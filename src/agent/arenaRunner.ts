import { getOrActivateServerSession } from "@/lib/auth/serverSession";
import { streamWithReconnect, type SseMessage, parseSseData } from "@/lib/txline/sse";
import { processOddsUpdate, type OddsSignal } from "./signalDetector";
import { openPosition, fundAgentWallet, initAgentWallets, getAgentKeypair } from "./executor";
import { runSettlerDaemon } from "./settler";
import { checkCircuitBreakers, config, isSafeModeActive, activateSafeMode } from "./safeMode";
import { PRE_BUILT_STRATEGIES, evaluateStrategy, type MatchStats } from "./strategyEngine";
import { getConnection } from "@/lib/anchor/client";
import type { MarketDefinition } from "@/types/market";
import * as fs from "fs";
import * as path from "path";

export interface RunnerState {
  status: "running" | "simulating" | "safe-mode" | "stopped";
  uptimeSeconds: number;
  signalsCount: number;
  sseConnected: boolean;
  lastUpdateTs: number;
  agentAAddress?: string;
  agentBAddress?: string;
}

export let runnerState: RunnerState = {
  status: "stopped",
  uptimeSeconds: 0,
  signalsCount: 0,
  sseConnected: false,
  lastUpdateTs: 0,
};

// Initialize wallets on boot to populate addresses immediately
initAgentWallets().then((wallets) => {
  runnerState.agentAAddress = wallets.agentA;
  runnerState.agentBAddress = wallets.agentB;
}).catch((e) => console.error("[Arena] Failed to init wallets on boot:", e));

const startTime = Date.now();
let runTimer: ReturnType<typeof setInterval> | null = null;
let simulationTimer: ReturnType<typeof setInterval> | null = null;
const stateFilePath = path.join(process.cwd(), "runnerState.json");

// In-memory persistent baseline state for the 3 simulation fixtures
const simulatedFixtures = [
  { id: 18237038, name: "France vs Spain", home: 1.65, draw: 3.80, away: 4.50 },
  { id: 17952170, name: "Argentina vs France", home: 2.30, draw: 3.20, away: 2.90 },
  { id: 17952171, name: "England vs Brazil", home: 2.10, draw: 3.30, away: 3.10 },
];

export const currentMatchStats: Record<number, MatchStats> = {
  18237038: { corners: 6, goals_diff: 0, red_cards: 0, possession: 52, shots_on_target: 4, period: 0 },
  17952170: { corners: 10, goals_diff: 1, red_cards: 0, possession: 55, shots_on_target: 6, period: 0 },
  17952171: { corners: 8, goals_diff: -1, red_cards: 0, possession: 48, shots_on_target: 3, period: 0 },
};

function saveRunnerState() {
  runnerState.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(runnerState, null, 2), "utf-8");
  } catch (e) {}
}

export function getRunnerState(): RunnerState {
  runnerState.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  return runnerState;
}

/**
 * Start the dual agent orchestrator.
 */
export async function startArenaRunner() {
  if (runnerState.status === "running" || runnerState.status === "simulating") return;

  console.log("[Arena] Initializing Arena runner...");
  runnerState.status = "running";
  
  // 1. Load keypairs and run faucets sequentially BEFORE signal processing
  await initAgentWallets();
  await fundAgentWallet("Agent A");
  await fundAgentWallet("Agent B");

  // 2. Connect TxLINE Server Session
  try {
    await getOrActivateServerSession();
  } catch (e: any) {
    console.error("[Arena] Failed to initialize TxLINE session:", e.message || e);
    activateSafeMode("Failed to authenticate TxLINE API session");
    runnerState.status = "safe-mode";
  }

  // 3. Start Settlement Daemon
  runSettlerDaemon();

  // 4. Start Uptime track
  runTimer = setInterval(() => {
    saveRunnerState();
  }, 1000);

  // 5. Connect to SSE stream
  const abortController = new AbortController();
  
  streamWithReconnect({
    kind: "odds",
    signal: abortController.signal,
    onMessage: (msg: SseMessage) => {
      runnerState.sseConnected = true;
      runnerState.lastUpdateTs = Date.now();
      
      const payload = parseSseData<any>(msg.data);
      if (payload && payload.fixtureId) {
        handleSseOddsUpdate(payload);
      }
    },
    onError: (err) => {
      console.warn("[Arena] SSE Stream disconnected / error:", err);
      runnerState.sseConnected = false;
      if (!isSafeModeActive) {
        activateSafeMode("SSE connection disconnected");
      }
    },
    onReconnect: (attempt) => {
      console.log(`[Arena] SSE Stream reconnect attempt #${attempt}...`);
    }
  });

  // Fallback simulator to ensure live data is visible in mock trading desk on Solana devnet
  startFallbackSimulator();

  // Force one trade 10 seconds after deployment starts for testing/debugging purposes
  setTimeout(async () => {
    console.log("[Arena] TRIGGERING FORCED TEST TRADE (10s delay after deploy)...");
    try {
      const marketTest: MarketDefinition = {
        id: `18237038:TEST:${Date.now()}`,
        fixtureId: 18237038,
        type: "WINNER",
        label: "Winner — France vs Spain",
        statKeyA: 1,
        statKeyB: null,
        threshold: 0,
        comparison: "GreaterThan",
        op: null
      };
      await openPosition({
        agent: "Agent A",
        strategyName: "Momentum",
        market: marketTest,
        stake: 2,
        odds: 1.85,
      });
      console.log("[Arena] Forced test trade submitted successfully!");
    } catch (e: any) {
      console.error("[Arena] Forced test trade failed:", e.message || e);
    }
  }, 10000);
}

/**
 * Handle incoming real or simulated odds updates, check strategy triggers,
 * and submit trade transactions.
 */
function handleSseOddsUpdate(oddsData: any) {
  const update = {
    fixtureId: oddsData.fixtureId,
    fixtureName: oddsData.fixtureName || `Fixture #${oddsData.fixtureId}`,
    homeOdds: oddsData.homeOdds || oddsData.home || 2.0,
    drawOdds: oddsData.drawOdds || oddsData.draw || 3.0,
    awayOdds: oddsData.awayOdds || oddsData.away || 3.5,
    timestamp: oddsData.timestamp || Date.now(),
  };

  processOddsUpdate(update, config.zScoreThreshold, (signal: OddsSignal) => {
    runnerState.signalsCount += 1;
    console.log(`[Arena] SIGNAL DETECTED! z-score: ${signal.zScore.toFixed(2)} on ${signal.outcome} odds.`);

    const isSimulating = runnerState.status === "simulating";
    
    // Override safe mode blocks when simulation mode is active
    if (isSafeModeActive && !isSimulating) {
      console.log("[Arena] Safe Mode active. Trade execution blocked.");
      return;
    }

    if (!isSimulating && !checkCircuitBreakers(signal.fixtureId)) {
      return;
    }

    // Evaluate strategy engine conditions before trade execution
    executeAgentTrades(signal);
  });
}

async function executeAgentTrades(signal: OddsSignal) {
  let stats = currentMatchStats[signal.fixtureId];
  if (!stats) {
    stats = { corners: 5, goals_diff: 0, red_cards: 0, possession: 50, shots_on_target: 3, period: 0 };
    currentMatchStats[signal.fixtureId] = stats;
  }

  const isSimulating = runnerState.status === "simulating";
  const isSafeModeBlocking = isSafeModeActive && !isSimulating;

  for (const strat of PRE_BUILT_STRATEGIES) {
    const isConditionMet = evaluateStrategy(strat, stats);
    if (!isConditionMet) continue;

    // Agent A (Momentum) trades WITH the direction of z-score movement (zScore >= threshold)
    if (signal.zScore >= config.zScoreThreshold && strat.name === "Momentum") {
      const kp = getAgentKeypair("Agent A");
      let solBal = 0;
      try {
        solBal = await getConnection().getBalance(kp.publicKey);
      } catch (e) {}

      console.log("[SIGNAL->EXECUTOR] Signal fired:", { fixture: signal.fixtureName, zScore: signal.zScore, strategy: strat.name });
      console.log("[SIGNAL->EXECUTOR] Safe mode blocking?", isSafeModeBlocking);
      console.log("[SIGNAL->EXECUTOR] Wallet funded?", solBal > 0);

      if (isSafeModeBlocking) {
        console.log("[Arena] Trade blocked by safe mode limits.");
        continue;
      }

      console.log(`[Arena] Strategy "${strat.name}" condition met for Agent A. Executing trade...`);
      try {
        const marketA: MarketDefinition = {
          id: `${signal.fixtureId}:MOMENTUM:${Date.now()}`,
          fixtureId: signal.fixtureId,
          type: "WINNER",
          label: `Winner — ${signal.fixtureName}`,
          statKeyA: 1, // goals
          statKeyB: null,
          threshold: 0,
          comparison: signal.outcome === "home" ? "GreaterThan" : "LessThan",
          op: null
        };

        await openPosition({
          agent: "Agent A",
          strategyName: strat.name,
          market: marketA,
          stake: strat.stake_usdt,
          odds: signal.newOdds,
        });
      } catch (e: any) {
        console.error(`[Arena] Agent A trade failed:`, e.message || e);
      }
    }

    // Agent B (Reversion) trades AGAINST the direction of z-score movement (zScore <= -threshold)
    if (signal.zScore <= -config.zScoreThreshold && strat.name === "Reversion") {
      const kp = getAgentKeypair("Agent B");
      let solBal = 0;
      try {
        solBal = await getConnection().getBalance(kp.publicKey);
      } catch (e) {}

      console.log("[SIGNAL->EXECUTOR] Signal fired:", { fixture: signal.fixtureName, zScore: signal.zScore, strategy: strat.name });
      console.log("[SIGNAL->EXECUTOR] Safe mode blocking?", isSafeModeBlocking);
      console.log("[SIGNAL->EXECUTOR] Wallet funded?", solBal > 0);

      if (isSafeModeBlocking) {
        console.log("[Arena] Trade blocked by safe mode limits.");
        continue;
      }

      console.log(`[Arena] Strategy "${strat.name}" condition met for Agent B. Executing trade...`);
      try {
        const marketB: MarketDefinition = {
          id: `${signal.fixtureId}:REVERSION:${Date.now()}`,
          fixtureId: signal.fixtureId,
          type: "WINNER",
          label: `Winner — ${signal.fixtureName}`,
          statKeyA: 1,
          statKeyB: null,
          threshold: 0,
          comparison: signal.outcome === "home" ? "LessThan" : "GreaterThan", // inverted outcome
          op: null
        };

        await openPosition({
          agent: "Agent B",
          strategyName: strat.name,
          market: marketB,
          stake: strat.stake_usdt,
          odds: signal.newOdds,
        });
      } catch (e: any) {
        console.error(`[Arena] Agent B trade failed:`, e.message || e);
      }
    }
  }
}

/**
 * Pushes simulated odds updates periodically to keep the dashboard active
 * if live streaming has no activity.
 */
function startFallbackSimulator() {
  console.log("[Arena] Starting fallback feed simulator to ensure continuous updates...");
  
  simulationTimer = setInterval(() => {
    // Check if we already have real SSE updates (to prevent overlapping feeds)
    if (Date.now() - runnerState.lastUpdateTs < 8000 && runnerState.sseConnected) {
      runnerState.status = "running";
      return;
    }

    // Set simulator active status
    runnerState.status = "simulating";

    // Select a random fixture from our 3 demo targets
    const target = simulatedFixtures[Math.floor(Math.random() * simulatedFixtures.length)];
    
    // Mutate the odds: randomly adjust one team's odds by 0.01-0.05, occasionally spike by 0.1-0.2
    const roll = Math.random();
    const adjust = roll > 0.82 ? (Math.random() > 0.5 ? 0.23 : -0.23) : (Math.random() > 0.5 ? 0.03 : -0.03);
    
    // Update target stats to keep strategy engines fluctuating
    const stats = currentMatchStats[target.id];
    if (stats) {
      if (Math.random() > 0.7) stats.corners += 1;
      if (Math.random() > 0.8) stats.shots_on_target += 1;
      if (Math.random() > 0.9) {
        stats.possession = Math.min(75, Math.max(25, stats.possession + (Math.random() > 0.5 ? 2 : -2)));
      }
    }

    // Randomly select outcome to mutate
    const outcomeRoll = Math.random();
    if (outcomeRoll < 0.33) {
      target.home = Math.max(1.1, target.home + adjust);
    } else if (outcomeRoll < 0.66) {
      target.draw = Math.max(1.1, target.draw + adjust);
    } else {
      target.away = Math.max(1.1, target.away + adjust);
    }

    // Simulate update
    handleSseOddsUpdate({
      fixtureId: target.id,
      fixtureName: target.name,
      homeOdds: target.home,
      drawOdds: target.draw,
      awayOdds: target.away,
      timestamp: Date.now(),
    });
  }, 4000); // simulate update every 4 seconds
}

export function stopArenaRunner() {
  if (runnerState.status === "stopped") return;
  
  console.log("[Arena] Stopping Arena runner...");
  runnerState.status = "stopped";
  runnerState.sseConnected = false;
  
  if (runTimer) clearInterval(runTimer);
  if (simulationTimer) clearInterval(simulationTimer);
  saveRunnerState();
}
