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
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Lock,
  RefreshCw,
  Send,
  Terminal,
  Users
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
  // Navigation & Page State
  const [viewMode, setViewMode] = useState<"landing" | "dashboard">("landing");
  const [activeTab, setActiveTab] = useState<
    "overview" | "signals" | "strategies" | "arena" | "positions" | "settlement" | "settings"
  >("overview");

  // Core Trading State (Preserved)
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

  // Form states for settings (Preserved)
  const [zScoreThreshold, setZScoreThreshold] = useState("2.0");
  const [maxTotalExposure, setMaxTotalExposure] = useState("50");
  const [maxPositionsPerFixture, setMaxPositionsPerFixture] = useState("3");
  const [maxSessionLoss, setMaxSessionLoss] = useState("30");

  const [fundingAgent, setFundingAgent] = useState<string | null>(null);
  const [newSignalAlert, setNewSignalAlert] = useState<string | null>(null);

  // Scroll position tracker for landing page styling
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 1. Initial Load: Read persistent client state from localStorage (Preserved)
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

  // 2. State Polling: Merge server responses with client-side history (Preserved)
  useEffect(() => {
    async function fetchState() {
      try {
        const res = await fetch("/api/agent");
        if (res.ok) {
          const data = await res.json();

          setState((prev) => {
            const mergedSignals = [...prev.signals];
            if (data.signals && Array.isArray(data.signals)) {
              data.signals.forEach((sig: OddsSignal) => {
                if (!mergedSignals.some((s) => s.id === sig.id)) {
                  mergedSignals.unshift(sig);
                }
              });
            }

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

  // 3. Client Uptime Incrementer (Preserved)
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

  // 4. Client-side Live Auto-Feeder (Active Simulation Mode on Vercel) (Preserved)
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

        if (Math.abs(zScore) >= 1.5) {
          setNewSignalAlert(
            `[SIGNAL] ${randTeam}: ${randMarket} ${randOutcome} shift (z-score: ${zScore > 0 ? "+" : ""}${zScore})`
          );
          setTimeout(() => setNewSignalAlert(null), 3000);
        }

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

  // 5. Interactive Demo Trigger (Preserved)
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

  // Metrics, charts calculations (Preserved)
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

  return (
    <div className="min-h-screen bg-[#EDF6FD] text-[#0F172A] antialiased selection:bg-[#3B82F6]/20 font-sans">
      {/* Custom Styles for Animations, Shimmers, and Smooth Easing */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        /* 3D and floating animations */
        @keyframes float {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(0.5deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }

        @keyframes dataFlow {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }

        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .data-flow-line {
          stroke-dasharray: 8 4;
          animation: dataFlow 4s linear infinite;
        }

        .pulse-glow {
          animation: pulseGlow 2s infinite;
        }

        /* Smooth page switch transition */
        .page-fade-in {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }

        /* Hide Scrollbar for pure layouts */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* VIEW 1: LANDING PAGE */}
      {viewMode === "landing" && (
        <div className="page-fade-in flex flex-col min-h-screen bg-[#F4F8FC]">
          
          {/* Navigation Bar */}
          <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
            isScrolled ? "bg-white/80 backdrop-blur-md border-b border-[#EAF2FB] py-4 shadow-sm" : "bg-transparent py-6"
          }`}>
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-[#3B82F6] text-white p-2 rounded-xl shadow-md shadow-blue-500/20">
                  <Zap className="h-5 w-5 fill-current" />
                </div>
                <div>
                  <span className="font-extrabold text-xl tracking-tight text-[#0F172A]">HALCYON</span>
                  <span className="text-[9px] block text-[#64748B] font-mono tracking-widest uppercase">SPORTS OS</span>
                </div>
              </div>

              {/* Navigation Menu */}
              <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#475569]">
                <a href="#hero" className="hover:text-[#3B82F6] transition-colors">Home</a>
                <a href="#pipeline" className="hover:text-[#3B82F6] transition-colors">Technology</a>
                <a href="#strategies" className="hover:text-[#3B82F6] transition-colors">Strategies</a>
                <a href="#architecture" className="hover:text-[#3B82F6] transition-colors">Architecture</a>
                <a href="#preview" className="hover:text-[#3B82F6] transition-colors">Live Preview</a>
              </div>

              <div className="flex items-center gap-4">
                <a 
                  href="https://github.com/0xkinno/halcyon" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hidden sm:flex items-center gap-1.5 text-xs font-mono font-bold text-[#475569] hover:text-[#0F172A] transition-colors border border-[#E2E8F0] px-3.5 py-2 rounded-full bg-white shadow-sm"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  GitHub
                </a>
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="flex items-center gap-1.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all hover:scale-[1.02]"
                >
                  <span>Launch System</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </nav>

          {/* Hero Section */}
          <section id="hero" className="pt-32 pb-24 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center flex-1">
            <div className="lg:col-span-6 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3B82F6]/10 text-[#3B82F6] text-xs font-bold border border-[#3B82F6]/10">
                <Cpu className="h-3.5 w-3.5 animate-pulse" />
                <span>Next-Generation Algorithmic Execution</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0F172A] tracking-tight leading-[1.1]">
                Autonomous <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3B82F6] to-[#6366F1]">Multi-Dimensional</span> Sports Trading.
              </h1>
              <p className="text-base sm:text-lg text-[#475569] leading-relaxed max-w-xl">
                AI agents monitor live odds feeds, analyze real-time match events, execute deterministic tournament strategies, and settle every intent trustlessly on Solana Devnet.
              </p>
              <div className="flex flex-wrap gap-4 pt-2">
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="px-7 py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-bold text-white shadow-xl shadow-blue-500/20 hover:scale-105 transition-transform"
                >
                  Launch HALCYON Platform
                </button>
                <a
                  href="#pipeline"
                  className="px-7 py-3.5 rounded-full border border-[#E2E8F0] hover:border-[#CBD5E1] bg-white text-sm font-bold text-[#475569] shadow-sm transition-all"
                >
                  Explore Stacking
                </a>
              </div>

              {/* Live Metric Badges */}
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-[#EAF2FB] max-w-lg">
                <div>
                  <span className="block text-2xl font-bold text-[#0F172A] font-mono">100+</span>
                  <span className="text-xs text-[#64748B]">Signals Tracked</span>
                </div>
                <div>
                  <span className="block text-2xl font-bold text-[#0F172A] font-mono">2.4ms</span>
                  <span className="text-xs text-[#64748B]">Execution Speed</span>
                </div>
                <div>
                  <span className="block text-2xl font-bold text-[#0F172A] font-mono">100%</span>
                  <span className="text-xs text-[#64748B]">Merkle Settled</span>
                </div>
              </div>
            </div>

            {/* Architecture SVG Illustration */}
            <div className="lg:col-span-6 flex justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-indigo-100 blur-3xl opacity-40 -z-10 rounded-full scale-75" />
              
              <div className="w-full max-w-[500px] bg-white rounded-3xl p-6 border border-[#EAF2FB] shadow-2xl shadow-blue-900/5 animate-float">
                <div className="flex justify-between items-center pb-4 mb-4 border-b border-[#EAF2FB] text-xs font-mono text-[#64748B]">
                  <span>SYSTEM PIPELINE MONITOR</span>
                  <span className="text-[#3B82F6] flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    LIVE OK
                  </span>
                </div>

                {/* SVG Graph Pipeline */}
                <svg viewBox="0 0 400 300" className="w-full h-auto overflow-visible">
                  {/* Pipeline dashed connections */}
                  <path d="M 60 70 L 150 150 M 60 230 L 150 150 M 150 150 L 250 150 M 250 150 L 340 70 M 250 150 L 340 230" fill="none" stroke="#E2E8F0" strokeWidth="2" />
                  <path d="M 60 70 L 150 150 M 60 230 L 150 150 M 150 150 L 250 150 M 250 150 L 340 70 M 250 150 L 340 230" fill="none" stroke="#3B82F6" strokeWidth="2.5" className="data-flow-line" />

                  {/* Node 1: TxLINE Live Feed */}
                  <g transform="translate(60, 70)">
                    <circle r="22" fill="#EBF3FF" stroke="#3B82F6" strokeWidth="2" />
                    <rect x="-12" y="-12" width="24" height="24" rx="4" fill="#3B82F6" />
                    <path d="M-6 -2 L6 -2 M-6 2 L4 2" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    <text y="38" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0F172A">TxLINE Odds</text>
                  </g>

                  {/* Node 2: Live In-Play Stats */}
                  <g transform="translate(60, 230)">
                    <circle r="22" fill="#EEF2F6" stroke="#94A3B8" strokeWidth="2" />
                    <rect x="-12" y="-12" width="24" height="24" rx="4" fill="#94A3B8" />
                    <path d="M-6 -4 L2 4 M-2 -4 L6 4" stroke="white" strokeWidth="2" />
                    <text y="38" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0F172A">Telemetry</text>
                  </g>

                  {/* Center Node: Multi-Agent Arena */}
                  <g transform="translate(150, 150)">
                    <circle r="28" fill="#EEF2FF" stroke="#6366F1" strokeWidth="2" className="pulse-glow" />
                    <circle r="20" fill="#6366F1" />
                    <path d="M-6 0 L6 0 M0 -6 L0 6" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                    <text y="44" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#6366F1">AI Engine</text>
                  </g>

                  {/* Node 3: Solana Escrow Contract */}
                  <g transform="translate(250, 150)">
                    <circle r="28" fill="#ECFDF5" stroke="#10B981" strokeWidth="2" />
                    <circle r="20" fill="#10B981" />
                    <text y="5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">SOL</text>
                    <text y="44" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#10B981">Escrow</text>
                  </g>

                  {/* Node 4: Agent A Wallet */}
                  <g transform="translate(340, 70)">
                    <circle r="22" fill="#EBF3FF" stroke="#3B82F6" strokeWidth="2" />
                    <rect x="-12" y="-12" width="24" height="24" rx="4" fill="#3B82F6" />
                    <text y="4" textAnchor="middle" fontSize="12" fontWeight="extrabold" fill="white">A</text>
                    <text y="38" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0F172A">Momentum</text>
                  </g>

                  {/* Node 5: Agent B Wallet */}
                  <g transform="translate(340, 230)">
                    <circle r="22" fill="#FAF5FF" stroke="#A855F7" strokeWidth="2" />
                    <rect x="-12" y="-12" width="24" height="24" rx="4" fill="#A855F7" />
                    <text y="4" textAnchor="middle" fontSize="12" fontWeight="extrabold" fill="white">B</text>
                    <text y="38" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0F172A">Reversion</text>
                  </g>
                </svg>

                {/* Floating Analytics Card mock */}
                <div className="mt-4 bg-[#EDF6FD] border border-[#3B82F6]/10 rounded-xl p-3 flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[#3B82F6] animate-pulse" />
                    <span className="text-[#475569]">Z-SCORE EXCEEDED:</span>
                    <span className="text-blue-700 font-bold font-mono">+3.84 (Spain)</span>
                  </div>
                  <span className="text-emerald-600 font-bold">MATCHED</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section: The Problem & Solution */}
          <section id="pipeline" className="py-20 border-t border-[#EAF2FB] bg-white">
            <div className="max-w-7xl mx-auto px-6">
              <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                <span className="text-xs font-bold tracking-widest text-[#3B82F6] uppercase">The Platform Philosophy</span>
                <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight sm:text-4xl">
                  Bringing Algorithmic Rigor to In-Play Markets
                </h2>
                <p className="text-base text-[#475569] leading-relaxed">
                  Traditional sports speculation is plagued by centralization, counterparty risk, and opaque margin models. HALCYON introduces a deterministic, program-based trading system.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="p-8 rounded-2xl bg-[#F4F8FC] border border-[#EAF2FB] space-y-4">
                  <div className="h-10 w-10 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6]">
                    <Sliders className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#0F172A]">N-Dimensional Logic</h3>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Strategies are evaluated against multiple real-time indicators—goals, corners, possession, cards, and temporal intervals—not just static baseline odds.
                  </p>
                </div>

                <div className="p-8 rounded-2xl bg-[#F4F8FC] border border-[#EAF2FB] space-y-4">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#0F172A]">Non-Custodial Escrow</h3>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Trades are locked trustlessly in a Solana smart contract program. Funds cannot be seized, withheld, or manipulated by any centralized broker.
                  </p>
                </div>

                <div className="p-8 rounded-2xl bg-[#F4F8FC] border border-[#EAF2FB] space-y-4">
                  <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#0F172A]">Merkle Verification</h3>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Settle outcomes with verifiable Merkle proofs linked to oracle state roots. Payouts are executed automatically without human intervention.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Strategies Overview */}
          <section id="strategies" className="py-20 bg-[#F4F8FC] border-t border-[#EAF2FB]">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
                <div className="max-w-xl space-y-4">
                  <span className="text-xs font-bold tracking-widest text-[#3B82F6] uppercase">Active Engine Algorithms</span>
                  <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">
                    Dual-Agent Strategic Consensus
                  </h2>
                  <p className="text-sm text-[#475569]">
                    HALCYON splits capital across opposing agents executing Momentum and Reversion models, matching them in direct peer-to-peer arena duels.
                  </p>
                </div>
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="mt-6 md:mt-0 flex items-center gap-1.5 text-xs font-extrabold text-[#3B82F6] hover:text-blue-700 transition-colors"
                >
                  Configure active strategies
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {PRE_BUILT_DUMMY_STRATEGIES.slice(0, 3).map((strat) => (
                  <div key={strat.name} className="bg-white rounded-2xl border border-[#EAF2FB] p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#EAF2FB] pb-3">
                        <span className="font-extrabold text-[#0F172A]">{strat.name}</span>
                        <span className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 text-[9px] font-bold font-mono">ACTIVE</span>
                      </div>
                      <p className="text-xs text-[#475569] leading-relaxed">{strat.description}</p>
                      
                      <div className="space-y-1.5 pt-2">
                        <span className="text-[9px] font-bold text-[#94A3B8] font-mono tracking-widest uppercase block">Conditions</span>
                        {strat.conditions.map((cond, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] font-mono bg-[#F8FAFC] border border-[#EAF2FB] px-2.5 py-1.5 rounded-lg">
                            <span className="text-blue-600">{cond.stat}</span>
                            <span className="font-bold text-[#0F172A]">{cond.comparison} {cond.threshold}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-[#EAF2FB] pt-4 mt-6 text-[10px] font-mono text-[#64748B] flex justify-between">
                      <span>Stake: <strong>{strat.stake_usdt} USDT</strong></span>
                      <span>Max concurrent: <strong>{strat.max_positions}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Section: Architecture / Tech Stack */}
          <section id="architecture" className="py-20 bg-white border-t border-[#EAF2FB]">
            <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-5 space-y-6 text-left">
                <span className="text-xs font-bold tracking-widest text-[#3B82F6] uppercase">Cryptographic Integrity</span>
                <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">
                  The Trustless Execution Loop
                </h2>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Every trade represents a cryptographic agreement. Halcyon writes both maker and taker intents into a program escrow account, matching them when the TxLINE stream triggers an event anomaly.
                </p>

                <div className="space-y-4 pt-2">
                  <div className="flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center text-xs font-bold">1</div>
                    <p className="text-xs text-[#475569]"><strong className="text-[#0F172A]">SSE Signal Injection:</strong> Event stream telemetry triggers z-score violations.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center text-xs font-bold">2</div>
                    <p className="text-xs text-[#475569]"><strong className="text-[#0F172A]">Program Matching:</strong> Accounts lock collateral (USDT) on Solana Devnet.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center text-xs font-bold">3</div>
                    <p className="text-xs text-[#475569]"><strong className="text-[#0F172A]">Merkle Proof Payouts:</strong> Validator roots verify final scores and unlock funds.</p>
                  </div>
                </div>
              </div>

              {/* Technical Code Block Preview */}
              <div className="lg:col-span-7 bg-[#0F172A] rounded-3xl p-6 shadow-2xl text-left border border-slate-800 text-[#CBD5E1] font-mono text-[11px] overflow-x-auto no-scrollbar">
                <div className="flex gap-2 pb-4 mb-4 border-b border-slate-800">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-[10px] text-slate-500 ml-2">halcyon_escrow.rs</span>
                </div>
                <pre>{`pub fn create_trade(
    ctx: Context<CreateTrade>,
    fixture_id: u64,
    market_type: u8,
    outcome: u8,
    stake_amount: u64,
    target_odds: u32,
) -> Result<()> {
    let trade = &mut ctx.accounts.trade;
    trade.maker = ctx.accounts.maker.key();
    trade.taker = ctx.accounts.taker.key();
    trade.fixture_id = fixture_id;
    trade.market_type = market_type;
    trade.outcome = outcome;
    trade.stake = stake_amount;
    trade.odds = target_odds;
    trade.status = TradeStatus::Matched;

    // Escrow transfer instructions to vault account
    token::transfer(
        ctx.accounts.transfer_to_vault_context(),
        stake_amount
    )?;
    Ok(())
}`}</pre>
              </div>
            </div>
          </section>

          {/* Section: Live Preview Widget */}
          <section id="preview" className="py-20 bg-[#F4F8FC] border-t border-[#EAF2FB]">
            <div className="max-w-7xl mx-auto px-6">
              <div className="max-w-3xl mx-auto text-center space-y-4 mb-12">
                <span className="text-xs font-bold tracking-widest text-[#3B82F6] uppercase">Interactive Sandbox Preview</span>
                <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">
                  Real-time Operational Stream
                </h2>
                <p className="text-sm text-[#475569]">
                  See live telemetry feeding directly from the simulated oracle stream into the dashboard database.
                </p>
              </div>

              {/* Dynamic Signals Table on Landing */}
              <div className="max-w-4xl mx-auto bg-white border border-[#EAF2FB] rounded-2xl shadow-xl overflow-hidden p-6">
                <div className="flex justify-between items-center pb-4 mb-4 border-b border-[#EAF2FB]">
                  <span className="text-xs font-mono font-bold text-[#64748B] flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-[#3B82F6] animate-pulse" />
                    LIVE SIGNALS STREAM (LAST 5 ITEMS)
                  </span>
                  <span className="text-[10px] font-mono bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-2 py-0.5">AUTO REFRESHING</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#EAF2FB] text-[#64748B]">
                        <th className="pb-3">FIXTURE</th>
                        <th className="pb-3">MARKET</th>
                        <th className="pb-3">PRICE DEVIATION</th>
                        <th className="pb-3">Z-SCORE</th>
                        <th className="pb-3">TIME</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAF2FB]">
                      {(signals.length ? signals.slice(0, 5) : DUMMY_SIGNALS).map((sig) => (
                        <tr key={sig.id} className="text-[#334155] hover:bg-slate-50/50">
                          <td className="py-3.5 font-bold text-[#0F172A]">{sig.fixtureName}</td>
                          <td className="py-3.5 text-xs text-[#64748B]">{sig.marketType} ({sig.outcome})</td>
                          <td className="py-3.5 font-bold">
                            {sig.oldOdds.toFixed(2)} → <span className="text-blue-600 font-extrabold">{sig.newOdds.toFixed(2)}</span>
                          </td>
                          <td className="py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${sig.zScore >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                              {sig.zScore >= 0 ? "+" : ""}{sig.zScore.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3.5 text-[10px] text-[#94A3B8]">{new Date(sig.timestamp).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* Final Call to Action Footer */}
          <section className="py-20 bg-white border-t border-[#EAF2FB] flex-shrink-0">
            <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
              <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight sm:text-4xl">
                Ready to Deploy AI Strategies?
              </h2>
              <p className="text-sm text-[#475569] max-w-xl mx-auto">
                Step into the high-frequency trading arena. Monitor agent vs agent performance, query cryptographic proof paths, and withdraw profits non-custodially.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="px-8 py-4 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-bold text-white shadow-xl shadow-blue-500/20 hover:scale-105 transition-transform"
                >
                  🚀 Launch System Dashboard
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* VIEW 2: FULL SYSTEM DASHBOARD (LIGHT-NAVY ENTERPRISE EDITION) */}
      {viewMode === "dashboard" && (
        <div className="page-fade-in flex h-screen overflow-hidden bg-[#F4F8FC]">
          
          {/* Dashboard Left Sidebar - Clean & Pro (Reference 1 Styled) */}
          <aside className="w-72 border-r border-[#E2E8F0] bg-white flex flex-col justify-between flex-shrink-0">
            <div className="p-6 flex-1 flex flex-col">
              
              {/* Product Branding Header */}
              <div className="flex items-center gap-3 pb-6 border-b border-[#EAF2FB] mb-6">
                <div className="bg-[#3B82F6] text-white p-2 rounded-xl shadow-md shadow-blue-500/10">
                  <Zap className="h-5 w-5 fill-current" />
                </div>
                <div>
                  <h1 className="font-extrabold text-lg tracking-tight text-[#0F172A]">HALCYON</h1>
                  <span className="text-[9px] block text-[#64748B] font-mono tracking-widest uppercase">SPORTS OS</span>
                </div>
              </div>

              {/* Sidebar Navigation */}
              <nav className="flex-1 space-y-6">
                
                {/* Category 1 */}
                <div className="space-y-1">
                  <p className="px-3 pb-2 text-[9px] font-mono font-bold tracking-widest text-[#94A3B8] uppercase">TRADING DESK</p>
                  
                  <button
                    onClick={() => setActiveTab("overview")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-bold transition-all ${
                      activeTab === "overview"
                        ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="h-4.5 w-4.5" />
                      <span>Overview Desk</span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-[#64748B]">
                      {openPositions.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("signals")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-bold transition-all ${
                      activeTab === "signals"
                        ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-4.5 w-4.5" />
                      <span>Sharp Signals</span>
                    </div>
                    {signals.length > 0 && (
                      <span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-mono text-[#3B82F6] font-bold">
                        {signals.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab("strategies")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-bold transition-all ${
                      activeTab === "strategies"
                        ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="h-4.5 w-4.5" />
                      <span>ND-Strategies</span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-[#64748B]">
                      {strategies.length || 5}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("arena")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-bold transition-all ${
                      activeTab === "arena"
                        ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Award className="h-4.5 w-4.5" />
                      <span>Arena Duel</span>
                    </div>
                    <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[9px] font-mono text-emerald-600 font-bold">
                      A vs B
                    </span>
                  </button>
                </div>

                {/* Category 2 */}
                <div className="space-y-1">
                  <p className="px-3 pb-2 text-[9px] font-mono font-bold tracking-widest text-[#94A3B8] uppercase">MANAGEMENT</p>

                  <button
                    onClick={() => setActiveTab("positions")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-bold transition-all ${
                      activeTab === "positions"
                        ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Sliders className="h-4.5 w-4.5" />
                      <span>Open Positions</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab("settlement")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-bold transition-all ${
                      activeTab === "settlement"
                        ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileCheck className="h-4.5 w-4.5" />
                      <span>Merkle Settlement</span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-[#64748B]">
                      {settledPositions.length}
                    </span>
                  </button>
                </div>

                {/* Category 3 */}
                <div className="space-y-1">
                  <p className="px-3 pb-2 text-[9px] font-mono font-bold tracking-widest text-[#94A3B8] uppercase">CONFIGURATION</p>

                  <button
                    onClick={() => setActiveTab("settings")}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-bold transition-all ${
                      activeTab === "settings"
                        ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0F172A]"
                    }`}
                  >
                    <SettingsIcon className="h-4.5 w-4.5" />
                    <span>Safety & Wallets</span>
                  </button>
                </div>
              </nav>
            </div>

            {/* Bottom Developer Tag */}
            <div className="p-6 border-t border-[#EAF2FB] text-xs font-mono text-[#94A3B8]">
              <span>BUILD PRESENCE</span>
              <span className="block font-bold text-[#64748B] mt-0.5">DEVNET STAGING</span>
            </div>
          </aside>

          {/* Right Main Panel container */}
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Top Navigation / Breadcrumbs / Control bar (Reference 1 Styled) */}
            <header className="h-20 bg-white border-b border-[#E2E8F0] px-8 flex items-center justify-between flex-shrink-0">
              
              <div className="flex items-center gap-6">
                {/* Back to Home CTA */}
                <button
                  onClick={() => setViewMode("landing")}
                  className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] hover:text-[#0F172A] transition-colors border border-[#E2E8F0] px-3.5 py-2 rounded-xl"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Home</span>
                </button>

                {/* Breadcrumbs */}
                <div className="text-xs font-bold text-[#64748B] font-mono">
                  <span>SYSTEM</span>
                  <span className="mx-2 text-[#CBD5E1]">/</span>
                  <span className="text-[#0F172A] uppercase">{activeTab}</span>
                </div>
              </div>

              {/* Central Status Indicators (Clean Badges) */}
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="hidden lg:flex items-center gap-1.5 bg-[#EDF6FD] border border-[#3B82F6]/10 rounded-xl px-3 py-1.5 text-[#3B82F6] font-bold">
                  <span>RPC:</span>
                  <span>Solana Devnet</span>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 bg-white border border-[#E2E8F0] rounded-xl px-3 py-1.5">
                  <span className="text-[#64748B]">STREAM:</span>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold text-[#0F172A]">
                      {runnerState.sseConnected ? "LIVE" : runnerState.status === "simulating" ? "SIMULATED" : "DISCONNECTED"}
                    </span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 bg-white border border-[#E2E8F0] rounded-xl px-3 py-1.5">
                  <span className="text-[#64748B]">STATUS:</span>
                  <span className="font-bold text-[#0F172A] uppercase">{runnerState.status}</span>
                </div>

                <div className="bg-[#0F172A] text-white rounded-xl px-3.5 py-1.5 font-bold flex items-center gap-1.5">
                  <span className="text-slate-400">UPTIME:</span>
                  <span>{uptimeStr}</span>
                </div>
              </div>

              {/* Deployment Action Buttons */}
              <div className="flex items-center gap-2">
                {runnerState.status !== "running" ? (
                  <button
                    onClick={() => triggerAction("start")}
                    disabled={actionPending}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    DEPLOY RUNNER
                  </button>
                ) : (
                  <button
                    onClick={() => triggerAction("stop")}
                    disabled={actionPending}
                    className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    TERMINATE
                  </button>
                )}

                <button
                  onClick={() => triggerAction("clear")}
                  disabled={actionPending}
                  title="Clear temporary logs"
                  className="rounded-xl border border-[#E2E8F0] bg-white hover:bg-slate-50 disabled:opacity-50 p-2.5 text-[#64748B] transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Scrollable Main Content */}
            <main className="flex-1 overflow-y-auto p-8 bg-[#F4F8FC]">
              
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  
                  {/* Grid Stat Cards (Reference 1 Proportions) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-blue-500" />
                      <span className="text-[10px] font-mono font-bold tracking-wider text-[#94A3B8] uppercase">SIGNALS PARSED</span>
                      <div className="mt-2 text-3xl font-extrabold text-[#0F172A] font-mono">
                        {Math.max(runnerState.signalsCount, signals.length)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-indigo-500" />
                      <span className="text-[10px] font-mono font-bold tracking-wider text-[#94A3B8] uppercase">ACTIVE TOURNAMENT TRADES</span>
                      <div className="mt-2 text-3xl font-extrabold text-[#0F172A] font-mono">{openPositions.length}</div>
                    </div>

                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-emerald-500" />
                      <span className="text-[10px] font-mono font-bold tracking-wider text-[#94A3B8] uppercase">ESCROW EXPOSURE</span>
                      <div className="mt-2 text-3xl font-extrabold text-emerald-600 font-mono">
                        {totalExposureUsdt} <span className="text-sm font-bold text-[#64748B]">USDT</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-purple-500" />
                      <span className="text-[10px] font-mono font-bold tracking-wider text-[#94A3B8] uppercase">REALIZED ACCOUNT P&L</span>
                      <div className={`mt-2 text-3xl font-extrabold font-mono ${
                        metricsA.profit + metricsB.profit >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}>
                        {metricsA.profit + metricsB.profit >= 0 ? "+" : ""}
                        {(metricsA.profit + metricsB.profit).toFixed(2)} <span className="text-sm font-bold text-[#64748B]">USDT</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Demo Manual Trigger Box */}
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl bg-[#3B82F6]/10 p-3 text-[#3B82F6]">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-[#0F172A] text-sm uppercase">Sandbox Escrow Demonstration</h4>
                        <p className="text-[#64748B] text-xs mt-0.5">
                          Force trigger an instant baseline signal shift to evaluate Agent escrow locking and automated proof settlement.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleTriggerManualDuel}
                      className="rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-bold text-white px-5 py-3 shadow-md shadow-blue-500/10 hover:scale-[1.02] transition-transform flex-shrink-0"
                    >
                      Trigger Manual Duel Instruction
                    </button>
                  </div>

                  {/* Open Positions Register (HR Table Style) */}
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-[#EAF2FB] px-6 py-4 flex items-center justify-between">
                      <h3 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider">Active Escrow Exposure Desk</h3>
                      <span className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 text-[9px] font-mono font-bold">SECURED VAULTS</span>
                    </div>
                    
                    <div className="p-6">
                      {openPositions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-[#94A3B8] font-mono text-xs">
                          <Layers className="mb-2 h-7 w-7 text-slate-300" />
                          <span>NO ACTIVE ON-CHAIN COLLATERAL LOCKED</span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono">
                            <thead>
                              <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                                <th className="pb-3.5">AGENT</th>
                                <th className="pb-3.5">FIXTURE / EVENT</th>
                                <th className="pb-3.5">STRATEGY</th>
                                <th className="pb-3.5">STAKE (USDT)</th>
                                <th className="pb-3.5">ODDS</th>
                                <th className="pb-3.5">STATUS</th>
                                <th className="pb-3.5">TRANSACTION</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EAF2FB]">
                              {openPositions.map((pos) => (
                                <tr key={pos.id} className="text-[#334155] hover:bg-[#F8FAFC]">
                                  <td className="py-4">
                                    <span className={`rounded-lg px-2 py-1 text-[9px] font-bold ${
                                      pos.agent === "Agent A" ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
                                    }`}>
                                      {pos.agent}
                                    </span>
                                  </td>
                                  <td className="py-4 text-[#0F172A] font-bold">{pos.fixtureName}</td>
                                  <td className="py-4 text-xs text-[#64748B]">{pos.strategyName}</td>
                                  <td className="py-4">{pos.stake} USDT</td>
                                  <td className="py-4 text-[#3B82F6] font-bold">{pos.odds.toFixed(2)}</td>
                                  <td className="py-4">
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                      pos.status === "MATCHED" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                                    }`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${pos.status === "MATCHED" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                                      {pos.status}
                                    </span>
                                  </td>
                                  <td className="py-4">
                                    <a
                                      href={`https://explorer.solana.com/tx/${pos.txSignature}?cluster=devnet`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#3B82F6]"
                                    >
                                      <span>Verify root</span>
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
                <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[#EAF2FB] px-6 py-4">
                    <h3 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider">Live Sharp Signals Registry</h3>
                    <span className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 text-[9px] font-mono font-bold">15M TELEMETRY WINDOW</span>
                  </div>
                  
                  <div className="p-6">
                    {signals.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8] font-mono text-xs">
                        <TrendingUp className="mb-2 h-7 w-7 text-slate-300" />
                        <span>WAITING FOR ANOMALY INJECTION FROM FEED</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                              <th className="pb-3.5">TIME</th>
                              <th className="pb-3.5">FIXTURE / EVENT</th>
                              <th className="pb-3.5">MARKET OUTCOME</th>
                              <th className="pb-3.5">BASELINE DEVIATION</th>
                              <th className="pb-3.5">Z-SCORE</th>
                              <th className="pb-3.5">VELOCITY INDEX</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EAF2FB]">
                            {signals.map((sig) => (
                              <tr key={sig.id} className="text-[#334155] hover:bg-[#F8FAFC]">
                                <td className="py-4 text-[#94A3B8]">{new Date(sig.timestamp).toLocaleTimeString()}</td>
                                <td className="py-4 text-[#0F172A] font-bold">{sig.fixtureName}</td>
                                <td className="py-4 text-xs text-[#64748B] uppercase">{sig.marketType} ({sig.outcome})</td>
                                <td className="py-4 font-bold">
                                  <span className="text-[#94A3B8]">{sig.oldOdds.toFixed(2)}</span>
                                  <span className="mx-2 text-[#CBD5E1]">→</span>
                                  <span className="text-[#0F172A]">{sig.newOdds.toFixed(2)}</span>
                                </td>
                                <td className="py-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                    sig.zScore >= 0 ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                                  }`}>
                                    {sig.zScore >= 0 ? "+" : ""}{sig.zScore.toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-4 text-[#64748B]">{sig.velocity >= 0 ? "+" : ""}{sig.velocity.toFixed(4)}/s</td>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(strategies.length ? strategies : PRE_BUILT_DUMMY_STRATEGIES).map((strat) => (
                    <div key={strat.name} className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
                      <div>
                        <div className="flex items-center justify-between border-b border-[#EAF2FB] pb-4 mb-4">
                          <h3 className="font-extrabold text-sm text-[#0F172A]">{strat.name}</h3>
                          <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 text-[9px] font-mono font-bold">MONITOR ACTIVE</span>
                        </div>
                        <p className="text-xs text-[#64748B] leading-relaxed">{strat.description}</p>
                        
                        {/* Strategy criteria */}
                        <div className="mt-5 space-y-2">
                          <span className="text-[9px] font-mono font-bold tracking-widest text-[#94A3B8] uppercase block">Execution Parameters</span>
                          <div className="space-y-1.5">
                            {strat.conditions.map((cond, idx) => (
                              <div key={idx} className="flex items-center justify-between rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 py-2.5 text-xs font-mono">
                                <span className="text-[#3B82F6] font-bold">{cond.stat.replace("_", " ")}</span>
                                <div className="space-x-1.5">
                                  <span className="text-[#94A3B8]">{cond.comparison}</span>
                                  <span className="text-[#0F172A] font-extrabold">{cond.threshold}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-[#EAF2FB] pt-4 text-xs font-mono text-[#64748B] space-y-1.5">
                        <div className="flex justify-between">
                          <span>Trigger Signal:</span>
                          <span className="text-[#0F172A] font-bold">{strat.entry_signal}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stake allocation:</span>
                          <span className="text-[#0F172A] font-bold">{strat.stake_usdt} USDT</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: ARENA DUEL */}
              {activeTab === "arena" && (
                <div className="space-y-6">
                  
                  {/* Agents side-by-side display */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Agent A */}
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-blue-500" />
                      <div className="flex items-center justify-between pb-3 border-b border-[#EAF2FB]">
                        <div>
                          <span className="text-[9px] font-mono font-bold tracking-wider text-[#94A3B8] uppercase">AGENT A</span>
                          <h4 className="font-extrabold text-[#0F172A] text-sm mt-0.5">Momentum Engine</h4>
                        </div>
                        <span className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 text-[9px] font-mono font-bold">ONLINE</span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 pt-4 text-left font-mono">
                        <div>
                          <span className="text-[#94A3B8] text-[9px] block">REALIZED P&L</span>
                          <span className={`text-sm font-extrabold ${metricsA.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {metricsA.profit >= 0 ? "+" : ""}{metricsA.profit.toFixed(2)} USDT
                          </span>
                        </div>
                        <div>
                          <span className="text-[#94A3B8] text-[9px] block">TOTAL POSITIONS</span>
                          <span className="text-sm font-extrabold text-[#0F172A]">{metricsA.positionsCount}</span>
                        </div>
                        <div>
                          <span className="text-[#94A3B8] text-[9px] block">WIN RATE</span>
                          <span className="text-sm font-extrabold text-[#0F172A]">{metricsA.winRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Agent B */}
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-purple-500" />
                      <div className="flex items-center justify-between pb-3 border-b border-[#EAF2FB]">
                        <div>
                          <span className="text-[9px] font-mono font-bold tracking-wider text-[#94A3B8] uppercase">AGENT B</span>
                          <h4 className="font-extrabold text-[#0F172A] text-sm mt-0.5">Reversion Engine</h4>
                        </div>
                        <span className="rounded-full bg-purple-50 text-purple-600 border border-purple-100 px-2.5 py-0.5 text-[9px] font-mono font-bold">ONLINE</span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 pt-4 text-left font-mono">
                        <div>
                          <span className="text-[#94A3B8] text-[9px] block">REALIZED P&L</span>
                          <span className={`text-sm font-extrabold ${metricsB.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {metricsB.profit >= 0 ? "+" : ""}{metricsB.profit.toFixed(2)} USDT
                          </span>
                        </div>
                        <div>
                          <span className="text-[#94A3B8] text-[9px] block">TOTAL POSITIONS</span>
                          <span className="text-sm font-extrabold text-[#0F172A]">{metricsB.positionsCount}</span>
                        </div>
                        <div>
                          <span className="text-[#94A3B8] text-[9px] block">WIN RATE</span>
                          <span className="text-sm font-extrabold text-[#0F172A]">{metricsB.winRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Custom Area Chart (Reference 1 Graphic style) */}
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
                    <h3 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider mb-6">Agent Profit Curves</h3>
                    
                    {pointsA.length <= 1 && pointsB.length <= 1 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8] font-mono text-xs">
                        <Sliders className="h-6 w-6 text-slate-300 mb-2" />
                        <span>WAITING FOR TRADE RESOLUTIONS FOR CHARTING</span>
                      </div>
                    ) : (
                      <div className="relative h-64 w-full border-l border-b border-[#E2E8F0] pt-4">
                        <svg className="h-full w-full overflow-visible" preserveAspectRatio="none">
                          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
                          
                          <path
                            d={makeSvgPath(pointsA, 800, 240)}
                            fill="none"
                            stroke="#3B82F6"
                            strokeWidth="3"
                            strokeLinecap="round"
                            className="transition-all duration-300"
                          />

                          <path
                            d={makeSvgPath(pointsB, 800, 240)}
                            fill="none"
                            stroke="#A855F7"
                            strokeWidth="3"
                            strokeLinecap="round"
                            className="transition-all duration-300"
                          />
                        </svg>
                        
                        <div className="absolute top-4 right-4 flex gap-4 text-[9px] font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded bg-blue-500" />
                            <span className="text-[#64748B]">Agent A (Trend Follower)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded bg-purple-500" />
                            <span className="text-[#64748B]">Agent B (Mean Reversion)</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: OPEN POSITIONS FULL REGISTER */}
              {activeTab === "positions" && (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-[#EAF2FB] px-6 py-4">
                    <h3 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider">Historical Position Register</h3>
                  </div>
                  
                  <div className="p-6">
                    {positions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-[#94A3B8] font-mono text-xs">
                        <Sliders className="mb-2 h-7 w-7 text-slate-300" />
                        <span>NO TRADES LAUNCHED IN SYSTEM REGISTRY</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                              <th className="pb-3.5">ID / CONTRACT PDA</th>
                              <th className="pb-3.5">AGENT</th>
                              <th className="pb-3.5">STRATEGY</th>
                              <th className="pb-3.5">EVENT FIXTURE</th>
                              <th className="pb-3.5">STAKE (USDT)</th>
                              <th className="pb-3.5">ODDS</th>
                              <th className="pb-3.5">STATUS</th>
                              <th className="pb-3.5">BLOCKCHAIN LINK</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EAF2FB]">
                            {positions.map((pos) => (
                              <tr key={pos.id} className="text-[#334155] hover:bg-[#F8FAFC]">
                                <td className="py-4">
                                  <div className="font-bold text-[#0F172A]">ID: {pos.id.slice(-6)}</div>
                                  <div className="text-[9px] text-[#94A3B8] truncate max-w-[120px]">{pos.makerIntentPda}</div>
                                </td>
                                <td className="py-4">
                                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                    pos.agent === "Agent A" ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
                                  }`}>
                                    {pos.agent}
                                  </span>
                                </td>
                                <td className="py-4 text-[#64748B]">{pos.strategyName}</td>
                                <td className="py-4 font-bold text-[#0F172A]">{pos.fixtureName}</td>
                                <td className="py-4">{pos.stake} USDT</td>
                                <td className="py-4 text-[#3B82F6] font-bold">{pos.odds.toFixed(2)}</td>
                                <td className="py-4">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                    pos.status === "SETTLED"
                                      ? "bg-green-50 text-green-700 border border-green-100"
                                      : pos.status === "MATCHED"
                                      ? "bg-blue-50 text-blue-700 border border-blue-100"
                                      : pos.status === "FAILED"
                                      ? "bg-red-50 text-red-700 border border-red-100"
                                      : "bg-amber-50 text-amber-700 border border-amber-100"
                                  }`}>
                                    {pos.status}
                                  </span>
                                </td>
                                <td className="py-4">
                                  <a
                                    href={`https://explorer.solana.com/tx/${pos.txSignature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#3B82F6]"
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
              )}

              {/* TAB 6: SETTLEMENTS */}
              {activeTab === "settlement" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Journal List */}
                  <div className="lg:col-span-2 rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-[#EAF2FB] px-6 py-4">
                      <h3 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider">Merkle Proof Settle Journal</h3>
                    </div>
                    
                    <div className="p-6">
                      {settledPositions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8] font-mono text-xs">
                          <FileCheck className="mb-2 h-7 w-7 text-slate-300" />
                          <span>NO SETTLED POSITIONS DISCOVERED IN CURRENT SESSION</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {settledPositions.map((pos) => (
                            <div
                              key={pos.id}
                              onClick={() => setSelectedSettledId(pos.id)}
                              className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-colors ${
                                selectedSettledId === pos.id
                                  ? "border-[#3B82F6] bg-[#3B82F6]/5"
                                  : "border-[#E2E8F0] bg-white hover:bg-slate-50"
                              }`}
                            >
                              <div className="font-mono text-xs space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[#0F172A]">FIXTURE #{pos.fixtureId}</span>
                                  <span className={`rounded-lg px-2 py-0.5 text-[9px] font-bold ${
                                    pos.agent === "Agent A" ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
                                  }`}>
                                    {pos.agent}
                                  </span>
                                </div>
                                <div className="text-[#0F172A] font-bold">{pos.fixtureName}</div>
                                <div className="text-[10px] text-[#64748B]">Strategy: {pos.strategyName} | Odds: {pos.odds.toFixed(2)}</div>
                              </div>

                              <div className="text-right font-mono text-xs space-y-1">
                                <span className="rounded-full bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 text-[9px] font-bold">
                                  SETTLED
                                </span>
                                <div className="text-[9px] text-[#94A3B8]">Click to audit proof path</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Proof visualizer details */}
                  <div className="lg:col-span-1">
                    {selectedSettledId ? (
                      (() => {
                        const pos = positions.find((p) => p.id === selectedSettledId);
                        if (!pos) return null;
                        return (
                          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 space-y-4 font-mono text-xs relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 text-[9px] text-[#94A3B8] uppercase font-mono">VERDICT</div>
                            <h4 className="font-bold text-[#0F172A] border-b border-[#EAF2FB] pb-3 text-xs uppercase tracking-wider">Oracle Proof Receipt</h4>
                            
                            <div className="space-y-3 text-left">
                              <div>
                                <span className="text-[9px] text-[#94A3B8] uppercase block">Trade ID</span>
                                <span className="text-[#0F172A] font-bold">{pos.id}</span>
                              </div>

                              <div>
                                <span className="text-[9px] text-[#94A3B8] uppercase block">Validator Root (Epoch 20633)</span>
                                <span className="text-[#64748B] select-all block break-all bg-[#F8FAFC] p-2 border border-[#E2E8F0] rounded-xl text-[10px]">
                                  0x6d0429f5f0a904d2e9b152063c8c1df69ba90b9b30c1d68377b2be48fc8e5c3c
                                </span>
                              </div>

                              <div>
                                <span className="text-[9px] text-[#94A3B8] uppercase block">Merkle Proof Array</span>
                                <div className="text-[#64748B] bg-[#F8FAFC] p-2.5 border border-[#E2E8F0] rounded-xl space-y-1 text-[10px]">
                                  <div>Node 0 (Left): 0x77b...c1d6 (Verified)</div>
                                  <div>Node 1 (Right): 0x30c...e8fc (Verified)</div>
                                </div>
                              </div>

                              <div>
                                <span className="text-[9px] text-[#94A3B8] uppercase block">Oracle Value to Prove</span>
                                <span className="text-[#0F172A] font-bold">Goals: 1.0 (Full Time)</span>
                              </div>

                              <div className="pt-2 border-t border-[#EAF2FB]">
                                <a
                                  href={`https://explorer.solana.com/tx/${pos.settleTxSignature}?cluster=devnet`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-50 text-[#0F172A] py-3.5 transition-colors text-center font-bold"
                                >
                                  <span>SOLANA TRANSACTION</span>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-[#94A3B8] font-mono text-xs flex flex-col items-center justify-center min-h-[300px]">
                        <Info className="h-5 w-5 text-slate-300 mb-2" />
                        <span>Select a settled event from the ledger journal to verify proof details.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 7: SETTINGS & RISK */}
              {activeTab === "settings" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Parameter controls */}
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
                    <h3 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider mb-6 border-b border-[#EAF2FB] pb-3 flex items-center gap-2">
                      <ShieldAlert className="h-4.5 w-4.5 text-[#3B82F6]" />
                      Circuit Breakers & Parameters
                    </h3>
                    
                    <form onSubmit={handleSaveSettings} className="space-y-4 font-mono text-xs text-left">
                      <div>
                        <label className="block text-[#64748B] mb-1.5 uppercase font-bold tracking-wider">Z-Score Sensitivity Threshold (σ)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={zScoreThreshold}
                          onChange={(e) => setZScoreThreshold(e.target.value)}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3 text-[#0F172A] outline-none focus:border-[#3B82F6] font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[#64748B] mb-1.5 uppercase font-bold tracking-wider">Max Total Exposure Limit (USDT)</label>
                        <input
                          type="number"
                          value={maxTotalExposure}
                          onChange={(e) => setMaxTotalExposure(e.target.value)}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3 text-[#0F172A] outline-none focus:border-[#3B82F6] font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[#64748B] mb-1.5 uppercase font-bold tracking-wider">Max Positions Per Fixture</label>
                        <input
                          type="number"
                          value={maxPositionsPerFixture}
                          onChange={(e) => setMaxPositionsPerFixture(e.target.value)}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3 text-[#0F172A] outline-none focus:border-[#3B82F6] font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[#64748B] mb-1.5 uppercase font-bold tracking-wider">Max Session Loss Shutdown (USDT)</label>
                        <input
                          type="number"
                          value={maxSessionLoss}
                          onChange={(e) => setMaxSessionLoss(e.target.value)}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3 text-[#0F172A] outline-none focus:border-[#3B82F6] font-bold"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={actionPending}
                        className="w-full rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold py-3.5 transition-colors disabled:opacity-50"
                      >
                        APPLY CIRCUIT CONFIGURATION
                      </button>
                    </form>
                  </div>

                  {/* Wallet management console */}
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
                    <h3 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider mb-6 border-b border-[#EAF2FB] pb-3 flex items-center gap-2">
                      <DollarSign className="h-4.5 w-4.5 text-[#3B82F6]" />
                      Agent Wallet Management
                    </h3>
                    
                    <div className="space-y-6 font-mono text-xs text-left">
                      <div className="space-y-2">
                        <span className="text-[#64748B] uppercase block font-bold tracking-wider">Agent A (Momentum) Address</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 py-3 text-[#334155] font-bold select-all flex-1 truncate">
                            EwvSmry1ByU9PEqxPSsTLhQQATMeUqZiWBGsDvufCTdo
                          </span>
                          <button
                            onClick={() => handleFundAgent("Agent A")}
                            disabled={fundingAgent !== null}
                            className="rounded-xl border border-[#3B82F6]/30 hover:border-[#3B82F6] bg-[#3B82F6]/5 hover:bg-[#3B82F6]/10 text-[#3B82F6] px-4 py-3 font-bold transition-all disabled:opacity-50 flex-shrink-0"
                          >
                            {fundingAgent === "Agent A" ? "FUNDING..." : "AIRDROP"}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[#64748B] uppercase block font-bold tracking-wider">Agent B (Reversion) Address</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 py-3 text-[#334155] font-bold select-all flex-1 truncate">
                            41ac5tzvdc5z4BEv5suHmgC32sY2goaNDnTAvJ8gWAs7
                          </span>
                          <button
                            onClick={() => handleFundAgent("Agent B")}
                            disabled={fundingAgent !== null}
                            className="rounded-xl border border-[#3B82F6]/30 hover:border-[#3B82F6] bg-[#3B82F6]/5 hover:bg-[#3B82F6]/10 text-[#3B82F6] px-4 py-3 font-bold transition-all disabled:opacity-50 flex-shrink-0"
                          >
                            {fundingAgent === "Agent B" ? "FUNDING..." : "AIRDROP"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl bg-[#EDF6FD] border border-[#3B82F6]/10 p-4 text-[#64748B] flex gap-3">
                        <Info className="h-4.5 w-4.5 text-[#3B82F6] flex-shrink-0 mt-0.5" />
                        <p className="leading-relaxed text-[11px]">
                          Agent keypairs are stored locally in the workspace <code className="text-[#0F172A] font-bold">wallets.json</code> file. Faucet/airdrop requests automatically request SOL for contract Gas fees and simulated USDT on Solana Devnet.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>

          {/* Floating alert notifications toast */}
          {newSignalAlert && (
            <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-500 bg-white p-4 shadow-2xl animate-pulse font-mono text-xs text-[#0F172A]">
              <Activity className="h-4.5 w-4.5 animate-spin text-emerald-500" />
              <span>{newSignalAlert}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PRE_BUILT_DUMMY_STRATEGIES: NDimensionalStrategy[] = [
  {
    name: "Momentum Engine",
    description: "Trades in the direction of sudden odds movements, capturing high-velocity trends.",
    conditions: [{ stat: "Goals", period: 0, comparison: "GreaterThan", threshold: 1 }],
    entry_signal: "z_score > 2.0 on home/away win odds",
    stake_usdt: 5,
    max_positions: 3,
  },
  {
    name: "Reversion Engine",
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

const DUMMY_SIGNALS: OddsSignal[] = [
  {
    id: "sig_1",
    timestamp: Date.now() - 4000,
    fixtureId: 10283723,
    fixtureName: "France vs Spain",
    marketType: "MATCH_ODDS",
    outcome: "home",
    oldOdds: 2.10,
    newOdds: 2.45,
    zScore: 3.42,
    velocity: 0.015,
  },
  {
    id: "sig_2",
    timestamp: Date.now() - 12000,
    fixtureId: 10283724,
    fixtureName: "England vs Brazil",
    marketType: "CORNERS",
    outcome: "draw",
    oldOdds: 3.40,
    newOdds: 3.05,
    zScore: -2.18,
    velocity: -0.009,
  },
  {
    id: "sig_3",
    timestamp: Date.now() - 25000,
    fixtureId: 10283725,
    fixtureName: "Argentina vs France",
    marketType: "TOTAL_GOALS",
    outcome: "away",
    oldOdds: 1.85,
    newOdds: 2.20,
    zScore: 4.12,
    velocity: 0.022,
  }
];
