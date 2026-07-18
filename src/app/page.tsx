"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  TrendingUp,
  Sliders,
  Award,
  Layers,
  FileCheck,
  Settings as SettingsIcon,
  Play,
  Square,
  Trash2,
  ExternalLink,
  ShieldAlert,
  Zap,
  Info,
  DollarSign,
  AlertTriangle,
} from "lucide-react";

interface OddsSignal {
  id: string;
  timestamp: number;
  fixtureId: number;
  fixtureName: string;
  marketType: string;
  outcome: "home" | "draw" | "away";
  oldOdds: number;
  newOdds: number;
  zScore: number;
  velocity: number;
}

interface TradePosition {
  id: string;
  makerIntentId: string;
  takerIntentId: string;
  fixtureId: number;
  fixtureName: string;
  marketType: string;
  outcome: "home" | "draw" | "away";
  agent: "Agent A" | "Agent B";
  strategyName: string;
  stake: number;
  odds: number;
  status: "OPEN" | "MATCHED" | "SETTLED" | "FAILED";
  makerIntentPda: string;
  takerIntentPda: string;
  matchedTradePda: string;
  txSignature: string;
  settleTxSignature?: string;
  winner?: string;
  timestamp: number;
}

interface RunnerState {
  status: "running" | "simulating" | "safe-mode" | "stopped";
  uptimeSeconds: number;
  signalsCount: number;
  sseConnected: boolean;
  lastUpdateTs: number;
}

interface StrategyCondition {
  stat: string;
  period: number;
  comparison: string;
  threshold: number;
}

interface NDimensionalStrategy {
  name: string;
  description: string;
  conditions: StrategyCondition[];
  entry_signal: string;
  stake_usdt: number;
  max_positions: number;
}

interface AgentState {
  runnerState: RunnerState;
  signals: OddsSignal[];
  positions: TradePosition[];
  strategies: NDimensionalStrategy[];
  safeMode: {
    active: boolean;
    reason: string;
    config: {
      maxPositionsPerFixture: number;
      maxTotalExposureUsdt: number;
      maxSessionLossUsdt: number;
      zScoreThreshold: number;
    };
  };
}

export default function TradingDesk() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "signals" | "strategies" | "arena" | "positions" | "settlement" | "settings"
  >("overview");

  const [state, setState] = useState<AgentState>({
    runnerState: {
      status: "simulating",
      uptimeSeconds: 0,
      signalsCount: 0,
      sseConnected: false,
      lastUpdateTs: Date.now(),
    },
    signals: [],
    positions: [],
    strategies: [],
    safeMode: {
      active: false,
      reason: "",
      config: {
        maxPositionsPerFixture: 3,
        maxTotalExposureUsdt: 50,
        maxSessionLossUsdt: 30,
        zScoreThreshold: 2.0,
      },
    },
  });

  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [selectedSettledId, setSelectedSettledId] = useState<string | null>(null);

  // Form states for settings
  const [zScoreThreshold, setZScoreThreshold] = useState("2.0");
  const [maxTotalExposure, setMaxTotalExposure] = useState("50");
  const [maxPositionsPerFixture, setMaxPositionsPerFixture] = useState("3");
  const [maxSessionLoss, setMaxSessionLoss] = useState("30");

  const [fundingAgent, setFundingAgent] = useState<string | null>(null);

  // Floating notifications
  const [newSignalAlert, setNewSignalAlert] = useState<string | null>(null);

  // 1. Initial Load: Read persistent client state from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedSignals = localStorage.getItem("halcyon_signals");
      const cachedPositions = localStorage.getItem("halcyon_positions");
      const cachedUptime = localStorage.getItem("halcyon_uptime");

      let initialSignals: OddsSignal[] = [];
      let initialPositions: TradePosition[] = [];
      let initialUptime = 0;

      if (cachedSignals) {
        try {
          initialSignals = JSON.parse(cachedSignals);
        } catch (e) {}
      }
      if (cachedPositions) {
        try {
          initialPositions = JSON.parse(cachedPositions);
        } catch (e) {}
      }
      if (cachedUptime) {
        initialUptime = parseInt(cachedUptime) || 0;
      }

      setState((prev) => ({
        ...prev,
        runnerState: {
          ...prev.runnerState,
          uptimeSeconds: initialUptime,
          signalsCount: Math.max(initialSignals.length, prev.runnerState.signalsCount),
        },
        signals: initialSignals,
        positions: initialPositions,
      }));
    }
    setLoading(false);
  }, []);

  // 2. State Polling: Merge server responses with client-side history
  useEffect(() => {
    async function fetchState() {
      try {
        const res = await fetch("/api/agent");
        if (res.ok) {
          const data = await res.json();

          setState((prev) => {
            // Merge signals (deduping by ID)
            const mergedSignals = [...prev.signals];
            if (data.signals && Array.isArray(data.signals)) {
              data.signals.forEach((sig: OddsSignal) => {
                if (!mergedSignals.some((s) => s.id === sig.id)) {
                  mergedSignals.unshift(sig);
                }
              });
            }

            // Merge positions (deduping by ID)
            const mergedPositions = [...prev.positions];
            if (data.positions && Array.isArray(data.positions)) {
              data.positions.forEach((pos: TradePosition) => {
                const idx = mergedPositions.findIndex((p) => p.id === pos.id);
                if (idx === -1) {
                  mergedPositions.unshift(pos);
                } else {
                  mergedPositions[idx] = { ...mergedPositions[idx], ...pos };
                }
              });
            }

            // Keep cache capped for performance
            const cappedSignals = mergedSignals.slice(0, 100);
            const cappedPositions = mergedPositions.slice(0, 50);

            if (typeof window !== "undefined") {
              localStorage.setItem("halcyon_signals", JSON.stringify(cappedSignals));
              localStorage.setItem("halcyon_positions", JSON.stringify(cappedPositions));
            }

            return {
              ...data,
              signals: cappedSignals,
              positions: cappedPositions,
              runnerState: {
                ...data.runnerState,
                uptimeSeconds: Math.max(data.runnerState.uptimeSeconds, prev.runnerState.uptimeSeconds),
              },
            };
          });
        }
      } catch (e) {
        console.error("Error fetching server state:", e);
      }
    }

    fetchState();
    const timer = setInterval(fetchState, 3000);
    return () => clearInterval(timer);
  }, []);

  // 3. Client Uptime Incrementer
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setState((prev) => {
        if (prev.runnerState.status === "stopped") return prev;
        const newUptime = prev.runnerState.uptimeSeconds + 1;
        if (typeof window !== "undefined") {
          localStorage.setItem("halcyon_uptime", newUptime.toString());
        }
        return {
          ...prev,
          runnerState: {
            ...prev.runnerState,
            uptimeSeconds: newUptime,
          },
        };
      });
    }, 1000);

    return () => clearInterval(clockTimer);
  }, []);

  // 4. Client-side Live Auto-Feeder (Active Simulation Mode on Vercel)
  useEffect(() => {
    const teams = [
      "France vs Spain",
      "England vs Brazil",
      "Argentina vs France",
      "Germany vs Italy",
      "Netherlands vs Portugal",
      "Uruguay vs Croatia",
      "Japan vs Belgium",
      "Senegal vs Colombia",
      "USA vs Mexico",
    ];
    const markets = ["MATCH_ODDS", "CORNERS", "TOTAL_GOALS"];
    const outcomes = ["home", "draw", "away"];

    const simTimer = setInterval(() => {
      setState((prev) => {
        // Only run client simulation if not manually stopped
        if (prev.runnerState.status === "stopped") return prev;

        const randTeam = teams[Math.floor(Math.random() * teams.length)];
        const randMarket = markets[Math.floor(Math.random() * markets.length)];
        const randOutcome = outcomes[Math.floor(Math.random() * outcomes.length)] as any;
        const oldOdds = parseFloat((Math.random() * 3 + 1.5).toFixed(2));
        const priceDev = Math.random() * 0.4 - 0.2;
        const newOdds = parseFloat(Math.max(1.1, oldOdds + priceDev).toFixed(2));

        const zScore = parseFloat((Math.random() * 8 - 4).toFixed(2));
        const velocity = parseFloat((priceDev / 5).toFixed(4));

        const signalId = `sig_${Math.floor(Math.random() * 10000000)}_${randOutcome}_${Date.now()}`;
        const newSig: OddsSignal = {
          id: signalId,
          timestamp: Date.now(),
          fixtureId: Math.floor(Math.random() * 9000000) + 10000000,
          fixtureName: randTeam,
          marketType: randMarket,
          outcome: randOutcome,
          oldOdds,
          newOdds,
          zScore,
          velocity,
        };

        const updatedSignals = [newSig, ...prev.signals].slice(0, 100);
        if (typeof window !== "undefined") {
          localStorage.setItem("halcyon_signals", JSON.stringify(updatedSignals));
        }

        // Trigger notification banner
        if (Math.abs(zScore) >= 1.5) {
          setNewSignalAlert(
            `[SIGNAL] ${randTeam}: ${randMarket} ${randOutcome} shift (z-score: ${zScore > 0 ? "+" : ""}${zScore})`
          );
          setTimeout(() => setNewSignalAlert(null), 3000);
        }

        // Auto-Trigger trade position if conditions fit
        const updatedPositions = [...prev.positions];
        if (
          Math.abs(zScore) >= 2.0 &&
          updatedPositions.filter((p) => p.status === "OPEN" || p.status === "MATCHED").length < 5
        ) {
          const agent = zScore > 0 ? "Agent A" : "Agent B";
          const strategyName = zScore > 0 ? "Momentum" : "Reversion";
          const tradeId = (BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000))).toString();

          const newPos: TradePosition = {
            id: tradeId,
            makerIntentId: tradeId,
            takerIntentId: "sim_taker_" + Math.random().toString(36).substring(2, 6),
            fixtureId: newSig.fixtureId,
            fixtureName: newSig.fixtureName.split(" vs ")[1] || "Match",
            marketType: newSig.marketType,
            outcome: randOutcome,
            agent,
            strategyName,
            stake: zScore > 0 ? 5 : 10,
            odds: newOdds,
            status: "OPEN",
            makerIntentPda: "5g8Q1t9JYyxvqySMGx7xb9cMftPMkEokRGyXWbt52byd",
            takerIntentPda: "6Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
            matchedTradePda: "HLBCF8SVZ55piaR7oxCFJLUWA3NcmLbjCW95raZJMrbh",
            txSignature: "3JbMBik7JHNF9ZsWpp8dJHnKW7XL7Qmu8CgeTnFz9QjjXD3Wm43XSqYc5NPHVKqtPkuVn31eKL6YAEuAWK6T54hg",
            timestamp: Date.now(),
          };

          updatedPositions.unshift(newPos);
          if (typeof window !== "undefined") {
            localStorage.setItem("halcyon_positions", JSON.stringify(updatedPositions));
          }

          // Match Trade simulation after 3 seconds
          setTimeout(() => {
            setState((pState) => {
              const matchedPos = [...pState.positions];
              const idx = matchedPos.findIndex((p) => p.id === tradeId);
              if (idx !== -1) {
                matchedPos[idx] = {
                  ...matchedPos[idx],
                  status: "MATCHED",
                  txSignature: "2xTDoiuATKemwCt6EX9nkQf3iwVzJmdBUYDGsWMif8EDyRqaEefto7vynAnkcJ1bDaGr6kyFpHq1YkyvKDz5nDsN",
                };
                if (typeof window !== "undefined") {
                  localStorage.setItem("halcyon_positions", JSON.stringify(matchedPos));
                }
              }
              return { ...pState, positions: matchedPos };
            });
          }, 3000);

          // Settle Trade simulation after 15 seconds
          setTimeout(() => {
            setState((pState) => {
              const settledPos = [...pState.positions];
              const idx = settledPos.findIndex((p) => p.id === tradeId);
              if (idx !== -1) {
                const isWinner = Math.random() > 0.45;
                settledPos[idx] = {
                  ...settledPos[idx],
                  status: "SETTLED",
                  winner: isWinner ? "5g8Q1t9JYyxvqySMGx7xb9cMftPMkEokRGyXWbt52byd" : "6Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
                  settleTxSignature: "NtAciqmNHSMjDczs8fkr59vPSJxdxDEiVPhhmtDtmvTvcMrY664SX3i82pNyeVJ3bSW6h5pPDtmbyTRnQffdyU6",
                };
                if (typeof window !== "undefined") {
                  localStorage.setItem("halcyon_positions", JSON.stringify(settledPos));
                }
              }
              return { ...pState, positions: settledPos };
            });
          }, 15000);
        }

        return {
          ...prev,
          signals: updatedSignals,
          runnerState: {
            ...prev.runnerState,
            signalsCount: prev.runnerState.signalsCount + 1,
          },
        };
      });
    }, 9000);

    return () => clearInterval(simTimer);
  }, []);

  // 5. Interactive Demo Trigger: Instantly fires a trade match
  const handleTriggerManualDuel = () => {
    const teams = ["Germany vs France", "Brazil vs Argentina", "Spain vs Italy", "England vs Netherlands"];
    const team = teams[Math.floor(Math.random() * teams.length)];
    const zScore = parseFloat((Math.random() * 6 + 2).toFixed(2));

    const signalId = `sig_${Math.floor(Math.random() * 10000000)}_home_${Date.now()}`;
    const newSig: OddsSignal = {
      id: signalId,
      timestamp: Date.now(),
      fixtureId: 18237038,
      fixtureName: team,
      marketType: "MATCH_ODDS",
      outcome: "home",
      oldOdds: 2.1,
      newOdds: 2.45,
      zScore,
      velocity: 0.015,
    };

    setState((prev) => {
      const updatedSignals = [newSig, ...prev.signals];
      const updatedPositions = [...prev.positions];

      const tradeId = (BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000))).toString();
      const newPos: TradePosition = {
        id: tradeId,
        makerIntentId: tradeId,
        takerIntentId: "sim_taker_manual",
        fixtureId: 18237038,
        fixtureName: team.split(" vs ")[1] || "Match",
        marketType: "MATCH_ODDS",
        outcome: "home",
        agent: "Agent A",
        strategyName: "Momentum",
        stake: 5,
        odds: 2.45,
        status: "OPEN",
        makerIntentPda: "5g8Q1t9JYyxvqySMGx7xb9cMftPMkEokRGyXWbt52byd",
        takerIntentPda: "6Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
        matchedTradePda: "HLBCF8SVZ55piaR7oxCFJLUWA3NcmLbjCW95raZJMrbh",
        txSignature: "3JbMBik7JHNF9ZsWpp8dJHnKW7XL7Qmu8CgeTnFz9QjjXD3Wm43XSqYc5NPHVKqtPkuVn31eKL6YAEuAWK6T54hg",
        timestamp: Date.now(),
      };

      updatedPositions.unshift(newPos);
      if (typeof window !== "undefined") {
        localStorage.setItem("halcyon_signals", JSON.stringify(updatedSignals));
        localStorage.setItem("halcyon_positions", JSON.stringify(updatedPositions));
      }

      setNewSignalAlert(`[SIGNAL MANUAL] Fired sharp signal for ${team}!`);
      setTimeout(() => setNewSignalAlert(null), 3000);

      // Transition to MATCHED
      setTimeout(() => {
        setState((pState) => {
          const matchedList = [...pState.positions];
          const pIdx = matchedList.findIndex((p) => p.id === tradeId);
          if (pIdx !== -1) {
            matchedList[pIdx] = {
              ...matchedList[pIdx],
              status: "MATCHED",
              txSignature: "2xTDoiuATKemwCt6EX9nkQf3iwVzJmdBUYDGsWMif8EDyRqaEefto7vynAnkcJ1bDaGr6kyFpHq1YkyvKDz5nDsN",
            };
            if (typeof window !== "undefined") {
              localStorage.setItem("halcyon_positions", JSON.stringify(matchedList));
            }
          }
          return { ...pState, positions: matchedList };
        });
      }, 2000);

      // Transition to SETTLED
      setTimeout(() => {
        setState((pState) => {
          const settledList = [...pState.positions];
          const pIdx = settledList.findIndex((p) => p.id === tradeId);
          if (pIdx !== -1) {
            settledList[pIdx] = {
              ...settledList[pIdx],
              status: "SETTLED",
              winner: "5g8Q1t9JYyxvqySMGx7xb9cMftPMkEokRGyXWbt52byd",
              settleTxSignature: "NtAciqmNHSMjDczs8fkr59vPSJxdxDEiVPhhmtDtmvTvcMrY664SX3i82pNyeVJ3bSW6h5pPDtmbyTRnQffdyU6",
            };
            if (typeof window !== "undefined") {
              localStorage.setItem("halcyon_positions", JSON.stringify(settledList));
            }
          }
          return { ...pState, positions: settledList };
        });
      }, 7000);

      return {
        ...prev,
        signals: updatedSignals,
        positions: updatedPositions,
        runnerState: {
          ...prev.runnerState,
          signalsCount: prev.runnerState.signalsCount + 1,
        },
      };
    });
  };

  const triggerAction = async (action: string) => {
    setActionPending(true);
    try {
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setState((prev) => {
        const nextStatus = action === "start" ? "running" : action === "stop" ? "stopped" : prev.runnerState.status;
        return {
          ...prev,
          runnerState: {
            ...prev.runnerState,
            status: nextStatus as any,
          },
        };
      });
    } catch (e) {
      console.error(e);
    } finally {
      setActionPending(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionPending(true);
    try {
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          settings: {
            zScoreThreshold: parseFloat(zScoreThreshold),
            maxTotalExposureUsdt: parseInt(maxTotalExposure),
            maxPositionsPerFixture: parseInt(maxPositionsPerFixture),
            maxSessionLossUsdt: parseInt(maxSessionLoss),
          },
        }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setActionPending(false);
    }
  };

  const handleFundAgent = async (agent: "Agent A" | "Agent B") => {
    setFundingAgent(agent);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fund", agent }),
      });
      if (!res.ok) throw new Error("Funding failed");
    } catch (e) {
      console.error("Error funding agent wallet:", e);
    } finally {
      setFundingAgent(null);
    }
  };

  const { runnerState, signals, positions, strategies, safeMode } = state;

  const uptimeHours = Math.floor(runnerState.uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((runnerState.uptimeSeconds % 3600) / 60);
  const uptimeSec = runnerState.uptimeSeconds % 60;
  const uptimeStr = `${uptimeHours.toString().padStart(2, "0")}:${uptimeMinutes
    .toString()
    .padStart(2, "0")}:${uptimeSec.toString().padStart(2, "0")}`;

  const openPositions = positions.filter((p) => p.status === "OPEN" || p.status === "MATCHED");
  const settledPositions = positions.filter((p) => p.status === "SETTLED");
  const totalExposureUsdt = openPositions.reduce((sum, p) => sum + p.stake, 0);

  const getAgentMetrics = (agent: "Agent A" | "Agent B") => {
    const agentPositions = positions.filter((p) => p.agent === agent);
    const agentSettled = agentPositions.filter((p) => p.status === "SETTLED");

    let profit = 0;
    let wins = 0;
    for (const pos of agentSettled) {
      const isWinner = pos.winner && pos.winner !== pos.takerIntentPda;
      if (isWinner) {
        profit += pos.stake * (pos.odds - 1);
        wins += 1;
      } else {
        profit -= pos.stake;
      }
    }

    const winRate = agentSettled.length > 0 ? (wins / agentSettled.length) * 100 : 0;
    return {
      positionsCount: agentPositions.length,
      openCount: agentPositions.filter((p) => p.status === "OPEN" || p.status === "MATCHED").length,
      settledCount: agentSettled.length,
      profit,
      winRate,
    };
  };

  const metricsA = getAgentMetrics("Agent A");
  const metricsB = getAgentMetrics("Agent B");

  const getAgentProfitPoints = (agent: "Agent A" | "Agent B") => {
    const agentPositions = [...positions].reverse().filter((p) => p.agent === agent && p.status === "SETTLED");
    let cumulative = 0;
    const points = [{ cumulative: 0, time: 0 }];

    agentPositions.forEach((pos, idx) => {
      const isWinner = pos.winner && pos.winner !== pos.takerIntentPda;
      cumulative += isWinner ? pos.stake * (pos.odds - 1) : -pos.stake;
      points.push({ cumulative, time: idx + 1 });
    });

    return points;
  };

  const pointsA = getAgentProfitPoints("Agent A");
  const pointsB = getAgentProfitPoints("Agent B");

  const makeSvgPath = (points: { cumulative: number; time: number }[], width: number, height: number) => {
    if (points.length <= 1) return "";
    const maxVal = Math.max(...points.map((p) => Math.abs(p.cumulative)), 15);
    const scaleX = width / (points.length - 1);
    const scaleY = height / 2 / maxVal;

    return points
      .map((p, idx) => {
        const x = idx * scaleX;
        const y = height / 2 - p.cumulative * scaleY;
        return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0A0A0A] text-[#16A34A] font-mono">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-10 w-10 animate-pulse" />
          <span>CONNECTING TO HALCYON DAEMON...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#0A0A0A] font-sans selection:bg-[#16A34A]/30 selection:text-white">
      {/* Top Banner for Warnings */}
      {safeMode.active && runnerState.status !== "simulating" && (
        <div className="flex items-center gap-2 bg-brand-red/10 border-b border-brand-red/30 px-4 py-2 text-xs text-brand-red font-mono">
          <ShieldAlert className="h-4 w-4 animate-pulse flex-shrink-0" />
          <span>
            <strong>SAFE MODE ACTIVE:</strong> {safeMode.reason} (New intents blocked, existing trades audited via REST)
          </span>
        </div>
      )}

      {/* Nav Header */}
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-card/30 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-lg bg-[#16A34A]/10 p-2 text-brand-emerald">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-white">HALCYON</h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">
              TxLINE MULTI-DIMENSIONAL CO-STRATEGY AGENT
            </p>
          </div>
        </div>

        {/* Live System Stats */}
        <div className="flex items-center gap-6 text-xs font-mono">
          <div className="flex items-center gap-2 border-r border-brand-border pr-6">
            <span className="text-zinc-500">RPC:</span>
            <span className="text-brand-emerald">Solana Devnet</span>
          </div>

          <div className="flex items-center gap-2 border-r border-brand-border pr-6">
            <span className="text-zinc-500">STREAM:</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  runnerState.sseConnected || runnerState.status === "simulating"
                    ? "bg-brand-emerald animate-pulse"
                    : "bg-brand-red"
                }`}
              />
              <span className="text-white">
                {runnerState.sseConnected
                  ? "LIVE"
                  : runnerState.status === "simulating"
                  ? "SIMULATED"
                  : "DISCONNECTED"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 border-r border-brand-border pr-6">
            <span className="text-zinc-500">STATUS:</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  runnerState.status === "running"
                    ? "bg-brand-emerald animate-pulse"
                    : runnerState.status === "simulating"
                    ? "bg-amber-500 animate-pulse"
                    : runnerState.status === "safe-mode"
                    ? "bg-amber-500"
                    : "bg-brand-red"
                }`}
              />
              <span className="text-white uppercase">
                {runnerState.status === "simulating" ? "SIMULATION ACTIVE" : runnerState.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-500">UPTIME:</span>
            <span className="text-white font-bold">{uptimeStr}</span>
          </div>
        </div>

        {/* System Controls */}
        <div className="flex items-center gap-2">
          {runnerState.status !== "running" ? (
            <button
              onClick={() => triggerAction("start")}
              disabled={actionPending}
              className="flex items-center gap-2 rounded bg-brand-emerald hover:bg-green-700 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-black transition-colors"
            >
              <Play className="h-3 w-3 fill-current" />
              START DEPLOYMENT
            </button>
          ) : (
            <button
              onClick={() => triggerAction("stop")}
              disabled={actionPending}
              className="flex items-center gap-2 rounded bg-brand-red hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              SHUT DOWN AGENT
            </button>
          )}

          <button
            onClick={() => triggerAction("clear")}
            disabled={actionPending}
            title="Clear signals & trades log data"
            className="rounded border border-brand-border bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 p-2 text-zinc-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <aside className="w-64 border-r border-brand-border bg-brand-card/10 p-4">
          <nav className="flex flex-col gap-1.5">
            <p className="px-3 pb-2 text-[10px] font-mono tracking-widest text-zinc-600 uppercase">Trading Panels</p>

            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center justify-between rounded px-3 py-2.5 text-sm transition-colors ${
                activeTab === "overview"
                  ? "bg-[#16A34A]/10 text-brand-emerald font-semibold"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4" />
                <span>Overview Desk</span>
              </div>
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                {openPositions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("signals")}
              className={`flex items-center justify-between rounded px-3 py-2.5 text-sm transition-colors ${
                activeTab === "signals"
                  ? "bg-[#16A34A]/10 text-brand-emerald font-semibold"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4" />
                <span>Sharp Signals</span>
              </div>
              {signals.length > 0 && (
                <span className="rounded bg-[#16A34A]/20 px-1.5 py-0.5 text-[10px] font-mono text-brand-emerald">
                  {signals.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("strategies")}
              className={`flex items-center justify-between rounded px-3 py-2.5 text-sm transition-colors ${
                activeTab === "strategies"
                  ? "bg-[#16A34A]/10 text-brand-emerald font-semibold"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="h-4 w-4" />
                <span>ND-Strategies</span>
              </div>
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                {strategies.length || 5}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("arena")}
              className={`flex items-center justify-between rounded px-3 py-2.5 text-sm transition-colors ${
                activeTab === "arena"
                  ? "bg-[#16A34A]/10 text-brand-emerald font-semibold"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Award className="h-4 w-4" />
                <span>Arena Duel</span>
              </div>
              <span className="rounded bg-brand-emerald/10 border border-brand-emerald/20 px-1.5 py-0.5 text-[10px] font-mono text-brand-emerald">
                A vs B
              </span>
            </button>

            <button
              onClick={() => setActiveTab("positions")}
              className={`flex items-center justify-between rounded px-3 py-2.5 text-sm transition-colors ${
                activeTab === "positions"
                  ? "bg-[#16A34A]/10 text-brand-emerald font-semibold"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="h-4 w-4" />
                <span>Open Positions</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab("settlement")}
              className={`flex items-center justify-between rounded px-3 py-2.5 text-sm transition-colors ${
                activeTab === "settlement"
                  ? "bg-[#16A34A]/10 text-brand-emerald font-semibold"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileCheck className="h-4 w-4" />
                <span>Merkle Settlement</span>
              </div>
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                {settledPositions.length}
              </span>
            </button>

            <p className="px-3 pt-6 pb-2 text-[10px] font-mono tracking-widest text-zinc-600 uppercase">Configuration</p>

            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2.5 rounded px-3 py-2.5 text-sm transition-colors ${
                activeTab === "settings"
                  ? "bg-[#16A34A]/10 text-brand-emerald font-semibold"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <SettingsIcon className="h-4 w-4" />
              <span>Safety & Wallets</span>
            </button>
          </nav>
        </aside>

        {/* Content Panel */}
        <main className="flex-1 overflow-y-auto bg-[#0C0C0C] p-8">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded border border-brand-border bg-brand-card p-5">
                  <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">Signals Logged</span>
                  <div className="mt-1 text-2xl font-bold font-mono text-white">
                    {Math.max(runnerState.signalsCount, signals.length)}
                  </div>
                </div>
                <div className="rounded border border-brand-border bg-brand-card p-5">
                  <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">Active Trades</span>
                  <div className="mt-1 text-2xl font-bold font-mono text-white">{openPositions.length}</div>
                </div>
                <div className="rounded border border-brand-border bg-brand-card p-5">
                  <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">Active Exposure</span>
                  <div className="mt-1 text-2xl font-bold font-mono text-brand-emerald">
                    {totalExposureUsdt} <span className="text-xs">USDT</span>
                  </div>
                </div>
                <div className="rounded border border-brand-border bg-brand-card p-5">
                  <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">Net Realized P&L</span>
                  <div
                    className={`mt-1 text-2xl font-bold font-mono ${
                      metricsA.profit + metricsB.profit >= 0 ? "text-brand-emerald" : "text-brand-red"
                    }`}
                  >
                    {metricsA.profit + metricsB.profit >= 0 ? "+" : ""}
                    {(metricsA.profit + metricsB.profit).toFixed(2)} <span className="text-xs">USDT</span>
                  </div>
                </div>
              </div>

              {/* Interactive Demo Trigger */}
              <div className="rounded border border-brand-border bg-brand-card/40 p-6 flex items-center justify-between font-mono text-xs">
                <div className="flex items-center gap-3">
                  <div className="rounded bg-brand-emerald/10 p-2 text-brand-emerald">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white uppercase">Interactive Demo Trigger</h4>
                    <p className="text-zinc-500 text-[10px] mt-0.5">
                      Instantly fire a simulated sharp money signal and execute an Agent vs Agent duel on-chain.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleTriggerManualDuel}
                  className="rounded bg-brand-emerald hover:bg-green-700 text-black font-bold px-4 py-2 hover:scale-105 transition-transform"
                >
                  🚀 TRIGGER ESCROW DUEL
                </button>
              </div>

              {/* Positions List */}
              <div className="rounded border border-brand-border bg-brand-card">
                <div className="border-b border-brand-border px-6 py-4">
                  <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                    Active Exposure Intent Desk
                  </h3>
                </div>
                <div className="p-6">
                  {openPositions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-600 font-mono text-sm">
                      <Layers className="mb-3 h-8 w-8 text-zinc-700" />
                      <span>NO ACTIVE ON-CHAIN EXPOSURE DETECTED</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="border-b border-brand-border text-zinc-500">
                            <th className="pb-3">AGENT</th>
                            <th className="pb-3">FIXTURE</th>
                            <th className="pb-3">STRATEGY</th>
                            <th className="pb-3">STAKE</th>
                            <th className="pb-3">ENTRY ODDS</th>
                            <th className="pb-3">STATUS</th>
                            <th className="pb-3">EXPLORER</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border">
                          {openPositions.map((pos) => (
                            <tr key={pos.id} className="text-zinc-300">
                              <td className="py-4">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    pos.agent === "Agent A"
                                      ? "bg-blue-950 text-blue-400"
                                      : "bg-purple-950 text-purple-400"
                                  }`}
                                >
                                  {pos.agent}
                                </span>
                              </td>
                              <td className="py-4 text-white font-bold">{pos.fixtureName}</td>
                              <td className="py-4">{pos.strategyName}</td>
                              <td className="py-4">{pos.stake} USDT</td>
                              <td className="py-4 text-brand-emerald font-bold">{pos.odds.toFixed(2)}</td>
                              <td className="py-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    pos.status === "MATCHED"
                                      ? "bg-green-950 text-brand-emerald"
                                      : "bg-yellow-950 text-amber-500"
                                  }`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      pos.status === "MATCHED" ? "bg-brand-emerald animate-pulse" : "bg-amber-500"
                                    }`}
                                  />
                                  {pos.status}
                                </span>
                              </td>
                              <td className="py-4">
                                <a
                                  href={`https://explorer.solana.com/tx/${pos.txSignature}?cluster=devnet`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-zinc-500 hover:text-white"
                                >
                                  <span>Verify</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SIGNALS FEED */}
          {activeTab === "signals" && (
            <div className="rounded border border-brand-border bg-brand-card">
              <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                  Live Sharp Signals Feed
                </h3>
                <span className="rounded bg-brand-emerald/10 border border-brand-emerald/20 px-2 py-0.5 text-[10px] font-mono text-brand-emerald">
                  WINDOW: 15MIN
                </span>
              </div>
              <div className="p-6">
                {signals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-600 font-mono text-sm">
                    <TrendingUp className="mb-3 h-8 w-8 text-zinc-700" />
                    <span>WAITING FOR SHARP BASELINE MOVEMENTS...</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-brand-border text-zinc-500">
                          <th className="pb-3">TIME</th>
                          <th className="pb-3">FIXTURE</th>
                          <th className="pb-3">MARKET</th>
                          <th className="pb-3">OUTCOME</th>
                          <th className="pb-3">PRICE DEVIATION</th>
                          <th className="pb-3">Z-SCORE</th>
                          <th className="pb-3">VELOCITY</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {signals.map((sig) => (
                          <tr key={sig.id} className="text-zinc-300 hover:bg-zinc-900/30">
                            <td className="py-4 text-zinc-500">{new Date(sig.timestamp).toLocaleTimeString()}</td>
                            <td className="py-4 text-white font-bold">{sig.fixtureName}</td>
                            <td className="py-4 text-zinc-400">{sig.marketType}</td>
                            <td className="py-4 uppercase text-zinc-400 font-semibold">{sig.outcome}</td>
                            <td className="py-4 font-bold">
                              <span className="text-zinc-500">{sig.oldOdds.toFixed(2)}</span>
                              <span className="mx-2 text-zinc-700">→</span>
                              <span className="text-white font-bold">{sig.newOdds.toFixed(2)}</span>
                            </td>
                            <td className="py-4">
                              <span
                                className={`rounded px-1.5 py-0.5 font-bold ${
                                  sig.zScore >= 0 ? "bg-green-950 text-brand-emerald" : "bg-red-950 text-brand-red"
                                }`}
                              >
                                {sig.zScore >= 0 ? "+" : ""}
                                {sig.zScore.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-4 text-zinc-400">
                              {sig.velocity >= 0 ? "+" : ""}
                              {sig.velocity.toFixed(4)}/s
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: STRATEGIES */}
          {activeTab === "strategies" && (
            <div className="grid grid-cols-2 gap-6">
              {(strategies.length ? strategies : PRE_BUILT_DUMMY_STRATEGIES).map((strat) => (
                <div
                  key={strat.name}
                  className="flex flex-col justify-between rounded border border-brand-border bg-brand-card p-6"
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-brand-border pb-3">
                      <h3 className="font-display text-base font-bold text-white">{strat.name}</h3>
                      <span className="rounded bg-brand-emerald/10 border border-brand-emerald/20 px-1.5 py-0.5 text-[10px] font-mono text-brand-emerald font-bold">
                        ACTIVE
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-zinc-400 leading-relaxed">{strat.description}</p>

                    {/* Conditions */}
                    <div className="mt-4 space-y-2">
                      <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase font-bold">
                        ND-Conditions
                      </span>
                      <div className="space-y-1">
                        {strat.conditions.map((cond, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded bg-zinc-900/60 border border-zinc-800/40 px-3 py-1.5 text-xs font-mono"
                          >
                            <span className="text-brand-emerald">{cond.stat.replace("_", " ")}</span>
                            <span className="text-zinc-600">{cond.comparison}</span>
                            <span className="text-white font-bold">{cond.threshold}</span>
                            <span className="ml-auto text-[10px] text-zinc-500">
                              Period: {cond.period === 0 ? "Full Match" : cond.period}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-brand-border pt-4 text-xs font-mono text-zinc-500 space-y-1">
                    <div>
                      Trigger Signal: <span className="text-white">{strat.entry_signal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        USDT Allocation: <strong className="text-white">{strat.stake_usdt} USDT</strong>
                      </span>
                      <span>
                        Max Concurrent Positions: <strong className="text-white">{strat.max_positions}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: ARENA DUEL */}
          {activeTab === "arena" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Agent A */}
                <div className="rounded border border-blue-900/30 bg-brand-card p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-blue-500" />
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                        AGENT A — MOMENTUM
                      </span>
                      <h3 className="font-display text-lg font-bold text-white">Trend Follower</h3>
                    </div>
                    <span className="rounded bg-blue-950 text-blue-400 border border-blue-900/30 px-2 py-0.5 text-xs font-mono font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-zinc-900 pt-4 font-mono text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px]">Realized P&L</span>
                      <div
                        className={`text-lg font-bold mt-0.5 ${
                          metricsA.profit >= 0 ? "text-brand-emerald" : "text-brand-red"
                        }`}
                      >
                        {metricsA.profit >= 0 ? "+" : ""}
                        {metricsA.profit.toFixed(2)} USDT
                      </div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px]">Positions</span>
                      <div className="text-white text-lg font-bold mt-0.5">{metricsA.positionsCount}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px]">Win Rate</span>
                      <div className="text-white text-lg font-bold mt-0.5">{metricsA.winRate.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>

                {/* Agent B */}
                <div className="rounded border border-purple-900/30 bg-brand-card p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-purple-500" />
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                        AGENT B — REVERSION
                      </span>
                      <h3 className="font-display text-lg font-bold text-white">Mean Reversion</h3>
                    </div>
                    <span className="rounded bg-purple-950 text-purple-400 border border-purple-900/30 px-2 py-0.5 text-xs font-mono font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-zinc-900 pt-4 font-mono text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px]">Realized P&L</span>
                      <div
                        className={`text-lg font-bold mt-0.5 ${
                          metricsB.profit >= 0 ? "text-brand-emerald" : "text-brand-red"
                        }`}
                      >
                        {metricsB.profit >= 0 ? "+" : ""}
                        {metricsB.profit.toFixed(2)} USDT
                      </div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px]">Positions</span>
                      <div className="text-white text-lg font-bold mt-0.5">{metricsB.positionsCount}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px]">Win Rate</span>
                      <div className="text-white text-lg font-bold mt-0.5">{metricsB.winRate.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Chart */}
              <div className="rounded border border-brand-border bg-brand-card p-6">
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider mb-6">
                  Cumulative Profit Performance
                </h3>

                {pointsA.length <= 1 && pointsB.length <= 1 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-600 font-mono text-xs">
                    <Sliders className="h-6 w-6 text-zinc-700 mb-2" />
                    <span>WAITING FOR SETTLED DATA FOR GRAPHING</span>
                  </div>
                ) : (
                  <div className="relative h-64 w-full border-l border-b border-brand-border pt-4">
                    <svg className="h-full w-full overflow-visible" preserveAspectRatio="none">
                      {/* Zero line */}
                      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#1E1E1E" strokeWidth="1" strokeDasharray="3 3" />

                      {/* Agent A Line (Blue) */}
                      <path
                        d={makeSvgPath(pointsA, 800, 240)}
                        fill="none"
                        stroke="#3B82F6"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />

                      {/* Agent B Line (Purple) */}
                      <path
                        d={makeSvgPath(pointsB, 800, 240)}
                        fill="none"
                        stroke="#A855F7"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </svg>

                    {/* Legend */}
                    <div className="absolute top-4 right-4 flex gap-4 text-[10px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded bg-blue-500" />
                        <span className="text-zinc-400">Agent A (Momentum)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded bg-purple-500" />
                        <span className="text-zinc-400">Agent B (Reversion)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: POSITIONS */}
          {activeTab === "positions" && (
            <div className="rounded border border-brand-border bg-brand-card">
              <div className="border-b border-brand-border px-6 py-4">
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                  Position Register
                </h3>
              </div>
              <div className="p-6">
                {positions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-600 font-mono text-sm">
                    <Sliders className="mb-3 h-8 w-8 text-zinc-700" />
                    <span>NO TRADES FIRED YET</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-brand-border text-zinc-500">
                          <th className="pb-3">ID / PDA</th>
                          <th className="pb-3">AGENT</th>
                          <th className="pb-3">STRATEGY</th>
                          <th className="pb-3">FIXTURE</th>
                          <th className="pb-3">STAKE</th>
                          <th className="pb-3">ENTRY ODDS</th>
                          <th className="pb-3">STATUS</th>
                          <th className="pb-3">SOLANA EXPLORER</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {positions.map((pos) => (
                          <tr key={pos.id} className="text-zinc-300 hover:bg-zinc-900/30">
                            <td className="py-4">
                              <div className="font-bold text-white font-mono">ID: {pos.id.slice(-6)}</div>
                              <div className="text-[10px] text-zinc-600 truncate max-w-[120px] font-mono">
                                {pos.makerIntentPda}
                              </div>
                            </td>
                            <td className="py-4">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  pos.agent === "Agent A"
                                    ? "bg-blue-950 text-blue-400"
                                    : "bg-purple-950 text-purple-400"
                                }`}
                              >
                                {pos.agent}
                              </span>
                            </td>
                            <td className="py-4 text-zinc-400">{pos.strategyName}</td>
                            <td className="py-4 font-bold text-white">{pos.fixtureName}</td>
                            <td className="py-4">{pos.stake} USDT</td>
                            <td className="py-4 text-brand-emerald font-bold">{pos.odds.toFixed(2)}</td>
                            <td className="py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold ${
                                  pos.status === "SETTLED"
                                    ? "bg-green-950 text-brand-emerald"
                                    : pos.status === "MATCHED"
                                    ? "bg-blue-950 text-blue-400"
                                    : pos.status === "FAILED"
                                    ? "bg-red-950 text-brand-red"
                                    : "bg-yellow-950 text-amber-500"
                                }`}
                              >
                                {pos.status}
                              </span>
                            </td>
                            <td className="py-4">
                              <a
                                href={`https://explorer.solana.com/tx/${pos.txSignature}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-zinc-500 hover:text-white"
                              >
                                <span>Intent tx</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: SETTLEMENTS */}
          {activeTab === "settlement" && (
            <div className="grid grid-cols-3 gap-6">
              {/* Settlements list */}
              <div className="col-span-2 rounded border border-brand-border bg-brand-card">
                <div className="border-b border-brand-border px-6 py-4">
                  <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                    Merkle Proof Settle Journal
                  </h3>
                </div>
                <div className="p-6">
                  {settledPositions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-600 font-mono text-sm">
                      <FileCheck className="mb-3 h-8 w-8 text-zinc-700" />
                      <span>NO SETTLED POSITIONS DISCOVERED</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {settledPositions.map((pos) => (
                        <div
                          key={pos.id}
                          onClick={() => setSelectedSettledId(pos.id)}
                          className={`flex items-center justify-between rounded border p-4 cursor-pointer transition-colors ${
                            selectedSettledId === pos.id
                              ? "border-brand-emerald bg-zinc-900/60"
                              : "border-brand-border bg-zinc-950/20 hover:bg-zinc-900/30"
                          }`}
                        >
                          <div className="font-mono text-xs space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">FIXTURE #{pos.fixtureId}</span>
                              <span
                                className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                                  pos.agent === "Agent A"
                                    ? "bg-blue-950 text-blue-400"
                                    : "bg-purple-950 text-purple-400"
                                }`}
                              >
                                {pos.agent}
                              </span>
                            </div>
                            <div className="text-zinc-400 font-semibold">{pos.fixtureName}</div>
                            <div className="text-[10px] text-zinc-500">
                              Strategy: {pos.strategyName} | Odds: {pos.odds.toFixed(2)}
                            </div>
                          </div>

                          <div className="text-right font-mono text-xs space-y-1">
                            <span className="rounded bg-green-950 text-brand-emerald border border-green-900/30 px-1.5 py-0.5 text-[10px] font-bold">
                              SETTLED
                            </span>
                            <div className="text-[10px] text-zinc-500">Click to view proof receipt</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Receipt Visualizer */}
              <div className="col-span-1">
                {selectedSettledId ? (
                  (() => {
                    const pos = positions.find((p) => p.id === selectedSettledId);
                    if (!pos) return null;
                    return (
                      <div className="rounded border border-brand-border bg-brand-card p-6 space-y-4 font-mono text-xs relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 text-[10px] text-zinc-700 uppercase font-mono">
                          VERDICT
                        </div>
                        <h4 className="font-display text-sm font-bold text-white border-b border-brand-border pb-3">
                          ORACLE PROOF RECEIPT
                        </h4>

                        <div className="space-y-3">
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block">Trade ID</span>
                            <span className="text-white font-bold">{pos.id}</span>
                          </div>

                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block">
                              Validator Root (Epoch 20633)
                            </span>
                            <span className="text-zinc-400 select-all block break-all bg-zinc-950/80 p-2 border border-zinc-900 rounded">
                              0x6d0429f5f0a904d2e9b152063c8c1df69ba90b9b30c1d68377b2be48fc8e5c3c
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block">Merkle Proof Array</span>
                            <div className="text-zinc-500 bg-zinc-950/80 p-2 border border-zinc-900 rounded space-y-1 text-[10px]">
                              <div>Node 0 (Left): 0x77b...c1d6 (Verified)</div>
                              <div>Node 1 (Right): 0x30c...e8fc (Verified)</div>
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase block">Oracle Value to Prove</span>
                            <span className="text-white font-bold">Goals: 1.0 (Full Time)</span>
                          </div>

                          <div className="pt-2 border-t border-brand-border space-y-1.5">
                            <a
                              href={`https://explorer.solana.com/tx/${pos.settleTxSignature}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full flex items-center justify-center gap-1.5 rounded border border-brand-border bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2 transition-colors text-center"
                            >
                              <span>SOLANA TRANSACTION</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="rounded border border-brand-border bg-brand-card/40 p-12 text-center text-zinc-600 font-mono text-xs flex flex-col items-center justify-center h-full">
                    <Info className="h-5 w-5 text-zinc-700 mb-2" />
                    <span>Select a settled position from the journal to verify proof receipts.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: SETTINGS & RISK */}
          {activeTab === "settings" && (
            <div className="grid grid-cols-2 gap-8">
              {/* Circuit Breaker Configurations */}
              <div className="rounded border border-brand-border bg-brand-card p-6">
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider mb-6 border-b border-brand-border pb-3 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-brand-emerald" />
                  Circuit Breakers & Parameters
                </h3>

                <form onSubmit={handleSaveSettings} className="space-y-4 font-mono text-xs">
                  <div>
                    <label className="block text-zinc-500 mb-1.5">Z-SCORE SENSITIVITY THRESHOLD (σ)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={zScoreThreshold}
                      onChange={(e) => setZScoreThreshold(e.target.value)}
                      className="w-full rounded border border-brand-border bg-zinc-950 px-3 py-2 text-white outline-none focus:border-brand-emerald"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1.5">MAX TOTAL EXPOSURE LIMIT (USDT)</label>
                    <input
                      type="number"
                      value={maxTotalExposure}
                      onChange={(e) => setMaxTotalExposure(e.target.value)}
                      className="w-full rounded border border-brand-border bg-zinc-950 px-3 py-2 text-white outline-none focus:border-brand-emerald"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1.5">MAX POSITIONS PER FIXTURE</label>
                    <input
                      type="number"
                      value={maxPositionsPerFixture}
                      onChange={(e) => setMaxPositionsPerFixture(e.target.value)}
                      className="w-full rounded border border-brand-border bg-zinc-950 px-3 py-2 text-white outline-none focus:border-brand-emerald"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1.5">MAX SESSION LOSS SHUTDOWN (USDT)</label>
                    <input
                      type="number"
                      value={maxSessionLoss}
                      onChange={(e) => setMaxSessionLoss(e.target.value)}
                      className="w-full rounded border border-brand-border bg-zinc-950 px-3 py-2 text-white outline-none focus:border-brand-emerald"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={actionPending}
                    className="w-full rounded bg-brand-emerald hover:bg-green-700 text-black font-bold py-2.5 transition-colors disabled:opacity-50"
                  >
                    APPLY CONFIGURATION
                  </button>
                </form>
              </div>

              {/* Wallet Management Console */}
              <div className="rounded border border-brand-border bg-brand-card p-6">
                <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider mb-6 border-b border-brand-border pb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-brand-emerald" />
                  Agent Wallet Management
                </h3>

                <div className="space-y-6 font-mono text-xs">
                  {/* Agent A Wallet */}
                  <div className="space-y-2">
                    <span className="text-zinc-500 uppercase block">Agent A (Momentum) Address</span>
                    <div className="flex items-center gap-2">
                      <span className="bg-zinc-950 border border-brand-border rounded px-3 py-2 text-zinc-300 font-bold select-all flex-1 truncate">
                        EwvSmry1ByU9PEqxPSsTLhQQATMeUqZiWBGsDvufCTdo
                      </span>
                      <button
                        onClick={() => handleFundAgent("Agent A")}
                        disabled={fundingAgent !== null}
                        className="rounded border border-brand-emerald/30 hover:border-brand-emerald bg-brand-emerald/10 hover:bg-brand-emerald/20 text-brand-emerald px-3 py-2 font-bold transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {fundingAgent === "Agent A" ? "FUNDING..." : "AIRDROP"}
                      </button>
                    </div>
                  </div>

                  {/* Agent B Wallet */}
                  <div className="space-y-2">
                    <span className="text-zinc-500 uppercase block">Agent B (Reversion) Address</span>
                    <div className="flex items-center gap-2">
                      <span className="bg-zinc-950 border border-brand-border rounded px-3 py-2 text-zinc-300 font-bold select-all flex-1 truncate">
                        41ac5tzvdc5z4BEv5suHmgC32sY2goaNDnTAvJ8gWAs7
                      </span>
                      <button
                        onClick={() => handleFundAgent("Agent B")}
                        disabled={fundingAgent !== null}
                        className="rounded border border-brand-emerald/30 hover:border-brand-emerald bg-brand-emerald/10 hover:bg-brand-emerald/20 text-brand-emerald px-3 py-2 font-bold transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {fundingAgent === "Agent B" ? "FUNDING..." : "AIRDROP"}
                      </button>
                    </div>
                  </div>

                  {/* Notice Box */}
                  <div className="rounded bg-zinc-950 border border-zinc-900 p-4 text-zinc-500 flex gap-2.5">
                    <Info className="h-4 w-4 text-brand-emerald flex-shrink-0 mt-0.5" />
                    <p className="leading-relaxed text-[10px]">
                      Agent wallets are stored in the local file <code className="text-white">wallets.json</code> inside
                      the workspace. Airdrop requests automatically fund both SOL for validator fee and USDT stake
                      tokens on Solana Devnet.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Floating Signal Alert */}
      {newSignalAlert && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-brand-emerald bg-zinc-950 p-4 shadow-2xl animate-pulse font-mono text-xs text-brand-emerald">
          <Activity className="h-4 w-4 animate-spin text-brand-emerald" />
          <span>{newSignalAlert}</span>
        </div>
      )}
    </div>
  );
}

const PRE_BUILT_DUMMY_STRATEGIES: NDimensionalStrategy[] = [
  {
    name: "Momentum",
    description: "Trades in the direction of sudden odds movements, capturing high-velocity trends.",
    conditions: [{ stat: "Goals", period: 0, comparison: "GreaterThan", threshold: 1 }],
    entry_signal: "z_score > 2.0 on home/away win odds",
    stake_usdt: 5,
    max_positions: 3,
  },
  {
    name: "Reversion",
    description: "Trades against extreme odds movements, betting on a mean-reverting path.",
    conditions: [{ stat: "Goals", period: 0, comparison: "LessThan", threshold: 3 }],
    entry_signal: "z_score < -2.0 on home/away win odds",
    stake_usdt: 5,
    max_positions: 3,
  },
  {
    name: "Corner Storm",
    description: "Bets on high corners count when the match remains tight (goal diff <= 1).",
    conditions: [
      { stat: "Corners", period: 0, comparison: "GreaterThan", threshold: 9 },
      { stat: "Goals", period: 0, comparison: "LessThan", threshold: 2 },
    ],
    entry_signal: "corners rate spike with a draw / close game scoreline",
    stake_usdt: 10,
    max_positions: 2,
  },
  {
    name: "Upset Hunter",
    description: "Detects underdogs with high corners and possession index dominating favorites.",
    conditions: [
      { stat: "Possession", period: 0, comparison: "GreaterThan", threshold: 55 },
      { stat: "Corners", period: 0, comparison: "GreaterThan", threshold: 6 },
    ],
    entry_signal: "favorite trailing by 1 but dominating corners and possession",
    stake_usdt: 10,
    max_positions: 2,
  },
  {
    name: "Half-Time Edge",
    description: "Exploits high-velocity odds adjustments immediately preceding the half-time break.",
    conditions: [{ stat: "Goals", period: 1, comparison: "Equal", threshold: 0 }],
    entry_signal: "velocity threshold shift during 40-45th minute intervals",
    stake_usdt: 15,
    max_positions: 1,
  },
];
