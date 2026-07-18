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
  // Navigation & Page State (Preserved)
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

  // Scroll tracker (Preserved)
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
    <div className="min-h-screen bg-[#F5F2EB] text-[#121212] antialiased selection:bg-[#235BFF]/10 font-sans">
      
      {/* V2 DESIGN SYSTEM - ELEGANT TYPOGRAPHY & SOLEMN ANIMATIONS */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@300;400;500;600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
        
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
          background-color: #F5F2EB;
        }

        .font-serif-editorial {
          font-family: 'Cormorant Garamond', serif;
        }

        .font-mono-tech {
          font-family: 'IBM Plex Mono', monospace;
        }

        /* Very slow, high-end transitions */
        .transition-editorial {
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .page-fade-in {
          animation: fadeInEditorial 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes fadeInEditorial {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Clean outlines and subtle elevation */
        .border-editorial {
          border: 1px solid rgba(18, 18, 18, 0.08);
        }
        
        .divider-editorial {
          background-color: rgba(18, 18, 18, 0.08);
        }

        .hover-lift:hover {
          transform: translateY(-2px);
          border-color: rgba(18, 18, 18, 0.18);
        }
      `}</style>

      {/* VIEW 1: LANDING PAGE (PREMIUM EDITORIAL) */}
      {viewMode === "landing" && (
        <div className="page-fade-in flex flex-col min-h-screen">
          
          {/* Sticky transparent header with blur */}
          <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
            isScrolled ? "bg-[#F5F2EB]/80 backdrop-blur-md border-b border-[#121212]/5 py-4" : "bg-transparent py-7"
          }`}>
            <div className="max-w-7xl mx-auto px-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-[#235BFF]" />
                <span className="font-bold text-base tracking-[0.1em] text-[#121212] uppercase font-mono-tech">HALCYON</span>
              </div>

              {/* Minimal links */}
              <div className="hidden md:flex items-center gap-10 text-xs font-mono-tech uppercase tracking-[0.15em] text-[#121212]/60">
                <a href="#hero" className="hover:text-[#121212] transition-colors">Philosophy</a>
                <a href="#telemetry" className="hover:text-[#121212] transition-colors">Telemetry</a>
                <a href="#tactics" className="hover:text-[#121212] transition-colors">Tactics</a>
                <a href="#vault" className="hover:text-[#121212] transition-colors">Vaults</a>
                <a href="#sandbox" className="hover:text-[#121212] transition-colors">Sandbox</a>
              </div>

              <div className="flex items-center gap-6">
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="rounded-full bg-[#121212] hover:bg-black px-6 py-3 text-xs font-mono-tech uppercase tracking-[0.15em] text-[#F5F2EB] transition-editorial shadow-sm hover:scale-[1.01]"
                >
                  Launch OS
                </button>
              </div>
            </div>
          </nav>

          {/* Hero Section - Magazine Layout */}
          <section id="hero" className="pt-40 pb-28 px-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-start flex-1">
            <div className="lg:col-span-7 space-y-8 text-left">
              <span className="text-[10px] font-mono-tech font-bold tracking-[0.2em] text-[#235BFF] uppercase block">
                SYSTEM DEPLOYMENT: SOLANA DEVNET
              </span>
              
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-light font-serif-editorial text-[#121212] leading-[0.9] tracking-tight">
                Autonomous<br />
                Sports<br />
                Intelligence.
              </h1>
              
              <p className="text-base text-[#121212]/70 font-light leading-relaxed max-w-lg">
                An institutional operating system executing multi-agent sports anomaly strategies. Trades are committed programmatically to locked escrow positions and settled verification-only.
              </p>

              <div className="flex flex-wrap gap-5 pt-4">
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="px-8 py-4 rounded-full bg-[#235BFF] hover:bg-blue-700 text-xs font-mono-tech uppercase tracking-[0.15em] text-[#F5F2EB] transition-editorial"
                >
                  Initialize Platform
                </button>
                <a
                  href="#telemetry"
                  className="px-8 py-4 rounded-full border border-[#121212]/15 bg-transparent text-xs font-mono-tech uppercase tracking-[0.15em] text-[#121212] hover:bg-[#121212]/5 transition-editorial"
                >
                  System Manual
                </a>
              </div>
            </div>

            {/* Generated Hero Image - Floating Stadium */}
            <div className="lg:col-span-5 w-full">
              <div className="rounded-[24px] border-editorial overflow-hidden bg-[#EFE9DE] p-2 shadow-sm animate-float">
                <img 
                  src="/hero_stadium.png" 
                  alt="Institutional Sports Intelligence" 
                  className="w-full h-auto rounded-[20px] grayscale brightness-95 contrast-105"
                />
              </div>
              <div className="mt-4 text-left font-mono-tech text-[9px] text-[#121212]/50 tracking-[0.15em] uppercase flex justify-between px-2">
                <span>PLATE #01 — TACTICAL FORECAST</span>
                <span>SYSTEM ACTIVE</span>
              </div>
            </div>
          </section>

          {/* Philosophy Section */}
          <section className="py-32 border-t border-[#121212]/5 bg-[#F6F3EC]">
            <div className="max-w-7xl mx-auto px-10 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
              <div className="lg:col-span-5 text-left space-y-6">
                <span className="text-[10px] font-mono-tech tracking-[0.2em] text-[#121212]/50 uppercase block">PLATE #02 — PHILOSOPHY</span>
                <h2 className="text-4xl font-serif-editorial font-light text-[#121212] leading-tight">
                  Bringing algorithmic rigor to sports events.
                </h2>
                <p className="text-xs text-[#121212]/60 leading-relaxed font-light">
                  Classical sports trading models fail due to human bias, central execution control, and counterparty delays. HALCYON removes intermediation by handling capital inside non-custodial smart contracts, triggered by real-time streams.
                </p>
              </div>

              <div className="lg:col-span-7">
                <div className="rounded-[24px] border-editorial overflow-hidden p-2 bg-[#EEE8DD]">
                  <img 
                    src="/ai_engine.png" 
                    alt="Autonomous Architecture sculpture" 
                    className="w-full h-auto rounded-[20px] grayscale"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section: Telemetry / Live Match */}
          <section id="telemetry" className="py-32 bg-[#F5F2EB] border-t border-[#121212]/5">
            <div className="max-w-7xl mx-auto px-10 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
              <div className="lg:col-span-7">
                <div className="rounded-[24px] border-editorial overflow-hidden p-2 bg-[#EFE9DE]">
                  <img 
                    src="/live_match.png" 
                    alt="Live match athlete sprinting" 
                    className="w-full h-auto rounded-[20px] grayscale brightness-90 contrast-105"
                  />
                </div>
              </div>

              <div className="lg:col-span-5 text-left space-y-6">
                <span className="text-[10px] font-mono-tech tracking-[0.2em] text-[#121212]/50 uppercase block">PLATE #03 — TELEMETRY</span>
                <h2 className="text-4xl font-serif-editorial font-light text-[#121212] leading-tight">
                  Deterministic streaming parameters.
                </h2>
                <p className="text-xs text-[#121212]/60 leading-relaxed font-light">
                  Continuous feed telemetry reads events directly from the database, feeding raw variables (goals, corners, possession, time index) into our mathematical z-score evaluation layers.
                </p>
              </div>
            </div>
          </section>

          {/* Section: Tactics Board */}
          <section id="tactics" className="py-32 bg-[#F6F3EC] border-t border-[#121212]/5">
            <div className="max-w-7xl mx-auto px-10 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
              <div className="lg:col-span-5 text-left space-y-6">
                <span className="text-[10px] font-mono-tech tracking-[0.2em] text-[#121212]/50 uppercase block">PLATE #04 — STRATEGY</span>
                <h2 className="text-4xl font-serif-editorial font-light text-[#121212] leading-tight">
                  Dual-Agent arena consensus.
                </h2>
                <p className="text-xs text-[#121212]/60 leading-relaxed font-light">
                  Two isolated, opposing agents monitor the same telemetry block simultaneously. When a sharp pricing deviation occurs, Agent A matches Agent B in a balanced escrow vault trade.
                </p>
              </div>

              <div className="lg:col-span-7">
                <div className="rounded-[24px] border-editorial overflow-hidden p-2 bg-[#EFE9DE]">
                  <img 
                    src="/strategy_tactics.png" 
                    alt="Tactics board workspace" 
                    className="w-full h-auto rounded-[20px] grayscale"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section: Escrow Vault */}
          <section id="vault" className="py-32 bg-[#F5F2EB] border-t border-[#121212]/5">
            <div className="max-w-7xl mx-auto px-10 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
              <div className="lg:col-span-7">
                <div className="rounded-[24px] border-editorial overflow-hidden p-2 bg-[#EFE9DE]">
                  <img 
                    src="/escrow_vault.png" 
                    alt="Architectural vault door" 
                    className="w-full h-auto rounded-[20px] grayscale brightness-95"
                  />
                </div>
              </div>

              <div className="lg:col-span-5 text-left space-y-6">
                <span className="text-[10px] font-mono-tech tracking-[0.2em] text-[#121212]/50 uppercase block">PLATE #05 — SECURITY</span>
                <h2 className="text-4xl font-serif-editorial font-light text-[#121212] leading-tight">
                  On-chain Merkle execution.
                </h2>
                <p className="text-xs text-[#121212]/60 leading-relaxed font-light">
                  Positions remain locked securely in a non-custodial program account on Solana. Payout validation is resolved by proving outcomes against oracle-generated Merkle root signatures.
                </p>
              </div>
            </div>
          </section>

          {/* Live Preview Sandbox */}
          <section id="sandbox" className="py-32 bg-[#F6F3EC] border-t border-[#121212]/5">
            <div className="max-w-7xl mx-auto px-10">
              <div className="max-w-2xl text-left space-y-4 mb-16">
                <span className="text-[10px] font-mono-tech tracking-[0.2em] text-[#121212]/50 uppercase block">PLATE #06 — DATA STREAM</span>
                <h2 className="text-4xl font-serif-editorial font-light text-[#121212] leading-tight">
                  Active Sandbox Telemetry
                </h2>
                <p className="text-xs text-[#121212]/60 font-light">
                  Audit the real-time incoming mock stream signals flowing directly through our server processing layers.
                </p>
              </div>

              <div className="bg-[#F5F2EB] border-editorial rounded-[24px] p-8 shadow-sm max-w-4xl">
                <div className="flex justify-between items-center pb-4 mb-4 border-b border-[#121212]/5">
                  <span className="text-[10px] font-mono-tech font-bold text-[#121212]/50 tracking-[0.15em] uppercase">EVENT BROADCAST CHANNEL</span>
                  <span className="text-[9px] font-mono-tech bg-[#235BFF]/10 text-[#235BFF] px-3 py-1 rounded-full font-bold uppercase tracking-wider">SECURE SSE LINK</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono-tech">
                    <thead>
                      <tr className="border-b border-[#121212]/5 text-[#121212]/50">
                        <th className="pb-3 uppercase tracking-wider">Fixture</th>
                        <th className="pb-3 uppercase tracking-wider">Type</th>
                        <th className="pb-3 uppercase tracking-wider">Old → New Odds</th>
                        <th className="pb-3 uppercase tracking-wider">Z-Score</th>
                        <th className="pb-3 uppercase tracking-wider">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#121212]/5">
                      {(signals.length ? signals.slice(0, 5) : DUMMY_SIGNALS).map((sig) => (
                        <tr key={sig.id} className="text-[#121212]/80 hover:bg-[#121212]/2 transition-colors">
                          <td className="py-4 font-bold text-[#121212]">{sig.fixtureName}</td>
                          <td className="py-4 text-[#121212]/60">{sig.marketType} ({sig.outcome})</td>
                          <td className="py-4 font-bold">
                            {sig.oldOdds.toFixed(2)} → <span className="text-[#235BFF] font-extrabold">{sig.newOdds.toFixed(2)}</span>
                          </td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${sig.zScore >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                              {sig.zScore >= 0 ? "+" : ""}{sig.zScore.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-4 text-[#121212]/40 text-[10px]">{new Date(sig.timestamp).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* Footer Call to Action */}
          <section className="py-32 bg-[#F5F2EB] border-t border-[#121212]/5 flex-shrink-0">
            <div className="max-w-4xl mx-auto px-10 text-left space-y-8">
              <h2 className="text-5xl font-serif-editorial font-light text-[#121212] leading-tight">
                Audit system transactions and telemetry outcomes.
              </h2>
              <p className="text-xs text-[#121212]/60 leading-relaxed font-light max-w-xl">
                Open the system dashboard to trace running tournament logs, deploy local faucet testing, and inspect Merkle proof audit chains.
              </p>
              <div className="pt-4">
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="px-10 py-5 rounded-full bg-[#121212] hover:bg-black text-xs font-mono-tech uppercase tracking-[0.2em] text-[#F5F2EB] transition-editorial"
                >
                  🚀 Mount OS Terminal
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* VIEW 2: FULL SYSTEM DASHBOARD (MONOCHROME EDITORIAL EDITION) */}
      {viewMode === "dashboard" && (
        <div className="page-fade-in flex h-screen overflow-hidden bg-[#F5F2EB]">
          
          {/* Dashboard Left Sidebar - Clean & Minimalist (Reference 1 Styled) */}
          <aside className="w-72 border-r border-[#121212]/10 bg-[#F5F2EB] flex flex-col justify-between flex-shrink-0">
            <div className="p-8 flex-1 flex flex-col">
              
              {/* Product Branding Header */}
              <div className="flex items-center gap-3 pb-8 border-b border-[#121212]/10 mb-8">
                <div className="h-2 w-2 rounded-full bg-[#235BFF]" />
                <div>
                  <h1 className="font-bold text-sm tracking-[0.1em] text-[#121212] uppercase font-mono-tech">HALCYON</h1>
                  <span className="text-[8px] block text-[#121212]/40 font-mono-tech tracking-[0.15em] uppercase">SPORTS INTEL OS</span>
                </div>
              </div>

              {/* Sidebar Navigation */}
              <nav className="flex-1 space-y-8">
                
                {/* Category 1 */}
                <div className="space-y-1.5">
                  <p className="px-3 pb-2 text-[9px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase">TELEMETRY DESK</p>
                  
                  <button
                    onClick={() => setActiveTab("overview")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-mono-tech uppercase tracking-[0.1em] transition-editorial ${
                      activeTab === "overview"
                        ? "bg-[#121212]/5 text-[#121212] font-bold"
                        : "text-[#121212]/50 hover:bg-[#121212]/2 hover:text-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4" strokeWidth={1} />
                      <span>Overview</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#121212]/60">
                      {openPositions.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("signals")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-mono-tech uppercase tracking-[0.1em] transition-editorial ${
                      activeTab === "signals"
                        ? "bg-[#121212]/5 text-[#121212] font-bold"
                        : "text-[#121212]/50 hover:bg-[#121212]/2 hover:text-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-4 w-4" strokeWidth={1} />
                      <span>Sharp Signals</span>
                    </div>
                    {signals.length > 0 && (
                      <span className="text-[10px] font-bold text-[#235BFF]">
                        {signals.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab("strategies")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-mono-tech uppercase tracking-[0.1em] transition-editorial ${
                      activeTab === "strategies"
                        ? "bg-[#121212]/5 text-[#121212] font-bold"
                        : "text-[#121212]/50 hover:bg-[#121212]/2 hover:text-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="h-4 w-4" strokeWidth={1} />
                      <span>Strategies</span>
                    </div>
                    <span className="text-[10px] text-[#121212]/40">
                      {strategies.length || 5}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("arena")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-mono-tech uppercase tracking-[0.1em] transition-editorial ${
                      activeTab === "arena"
                        ? "bg-[#121212]/5 text-[#121212] font-bold"
                        : "text-[#121212]/50 hover:bg-[#121212]/2 hover:text-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Award className="h-4 w-4" strokeWidth={1} />
                      <span>Arena Duel</span>
                    </div>
                    <span className="text-[8px] border border-[#121212]/20 rounded px-1.5 py-0.5 text-[#121212]/40 font-bold">
                      A vs B
                    </span>
                  </button>
                </div>

                {/* Category 2 */}
                <div className="space-y-1.5">
                  <p className="px-3 pb-2 text-[9px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase">ESCROW REGISTRY</p>

                  <button
                    onClick={() => setActiveTab("positions")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-mono-tech uppercase tracking-[0.1em] transition-editorial ${
                      activeTab === "positions"
                        ? "bg-[#121212]/5 text-[#121212] font-bold"
                        : "text-[#121212]/50 hover:bg-[#121212]/2 hover:text-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Sliders className="h-4 w-4" strokeWidth={1} />
                      <span>Ledger</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab("settlement")}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-mono-tech uppercase tracking-[0.1em] transition-editorial ${
                      activeTab === "settlement"
                        ? "bg-[#121212]/5 text-[#121212] font-bold"
                        : "text-[#121212]/50 hover:bg-[#121212]/2 hover:text-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileCheck className="h-4 w-4" strokeWidth={1} />
                      <span>Settlements</span>
                    </div>
                    <span className="text-[10px] text-[#121212]/40">
                      {settledPositions.length}
                    </span>
                  </button>
                </div>

                {/* Category 3 */}
                <div className="space-y-1.5">
                  <p className="px-3 pb-2 text-[9px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase">SAFETY CODES</p>

                  <button
                    onClick={() => setActiveTab("settings")}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-mono-tech uppercase tracking-[0.1em] transition-editorial ${
                      activeTab === "settings"
                        ? "bg-[#121212]/5 text-[#121212] font-bold"
                        : "text-[#121212]/50 hover:bg-[#121212]/2 hover:text-[#121212]"
                    }`}
                  >
                    <SettingsIcon className="h-4 w-4" strokeWidth={1} />
                    <span>Risk Desk</span>
                  </button>
                </div>
              </nav>
            </div>

            {/* Bottom Developer Tag */}
            <div className="p-8 border-t border-[#121212]/10 text-[9px] font-mono-tech text-[#121212]/30 tracking-[0.15em] uppercase">
              <span>SYSTEM HOST: VERCEL CLOUD</span>
              <span className="block font-bold mt-1">PROD TERMINAL LINK</span>
            </div>
          </aside>

          {/* Right Content View */}
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Top Navigation Control bar (Reference 1 Spacing) */}
            <header className="h-20 bg-[#F5F2EB] border-b border-[#121212]/10 px-8 flex items-center justify-between flex-shrink-0">
              
              <div className="flex items-center gap-6">
                {/* Back to Home CTA */}
                <button
                  onClick={() => setViewMode("landing")}
                  className="flex items-center gap-2 text-[10px] font-mono-tech uppercase tracking-[0.15em] text-[#121212]/60 hover:text-[#121212] transition-colors border border-[#121212]/15 px-4 py-2.5 rounded-full bg-transparent"
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1} />
                  <span>Exit Terminal</span>
                </button>

                {/* Breadcrumbs */}
                <div className="text-[10px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase">
                  <span>HALCYON OS</span>
                  <span className="mx-2 text-[#121212]/20">/</span>
                  <span className="text-[#121212]">{activeTab}</span>
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex items-center gap-3 text-[10px] font-mono-tech tracking-[0.1em] uppercase">
                <div className="hidden lg:flex items-center gap-1 bg-[#121212]/5 rounded-xl px-3.5 py-2 text-[#121212] font-bold border border-[#121212]/5">
                  <span>NET:</span>
                  <span>Solana Devnet</span>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 bg-transparent border border-[#121212]/10 rounded-xl px-3.5 py-2">
                  <span className="text-[#121212]/50">Stream:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-bold text-[#121212]">
                      {runnerState.sseConnected ? "LIVE" : runnerState.status === "simulating" ? "SIMULATED" : "DISCONNECTED"}
                    </span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 bg-transparent border border-[#121212]/10 rounded-xl px-3.5 py-2">
                  <span className="text-[#121212]/50">Status:</span>
                  <span className="font-bold text-[#121212]">{runnerState.status}</span>
                </div>

                <div className="bg-[#121212] text-[#F5F2EB] rounded-xl px-4 py-2 font-bold font-mono-tech tracking-normal">
                  <span>{uptimeStr}</span>
                </div>
              </div>

              {/* Deployment Runner Controls */}
              <div className="flex items-center gap-2">
                {runnerState.status !== "running" ? (
                  <button
                    onClick={() => triggerAction("start")}
                    disabled={actionPending}
                    className="flex items-center gap-2 rounded-full bg-[#235BFF] hover:bg-blue-700 disabled:opacity-50 px-5 py-3 text-xs font-mono-tech uppercase tracking-[0.15em] text-[#F5F2EB] transition-editorial"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Deploy System
                  </button>
                ) : (
                  <button
                    onClick={() => triggerAction("stop")}
                    disabled={actionPending}
                    className="flex items-center gap-2 rounded-full bg-red-700 hover:bg-red-800 disabled:opacity-50 px-5 py-3 text-xs font-mono-tech uppercase tracking-[0.15em] text-[#F5F2EB] transition-editorial"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Shutdown
                  </button>
                )}

                <button
                  onClick={() => triggerAction("clear")}
                  disabled={actionPending}
                  title="Clear Telemetry State"
                  className="rounded-full border border-[#121212]/15 bg-transparent hover:bg-[#121212]/5 disabled:opacity-50 p-3 text-[#121212]/60 transition-editorial"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Dashboard Scrollable Work space */}
            <main className="flex-1 overflow-y-auto p-8 bg-[#F5F2EB]">
              
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-10">
                  
                  {/* Grid Stat Cards (Reference 1 Proportions) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm flex flex-col justify-between hover-lift transition-editorial">
                      <span className="text-[10px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase block">TELEMETRY SIGNALS LOGGED</span>
                      <div className="mt-4 text-4xl font-light font-serif-editorial text-[#121212]">
                        {Math.max(runnerState.signalsCount, signals.length)}
                      </div>
                    </div>

                    <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm flex flex-col justify-between hover-lift transition-editorial">
                      <span className="text-[10px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase block">ACTIVE TOURNAMENT CONTRACTS</span>
                      <div className="mt-4 text-4xl font-light font-serif-editorial text-[#121212]">{openPositions.length}</div>
                    </div>

                    <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm flex flex-col justify-between hover-lift transition-editorial">
                      <span className="text-[10px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase block">ACTIVE VAULT EXPOSURE</span>
                      <div className="mt-4 text-4xl font-light font-serif-editorial text-[#235BFF]">
                        {totalExposureUsdt} <span className="text-xs font-mono-tech tracking-[0.1em] uppercase text-[#121212]/40">USDT</span>
                      </div>
                    </div>

                    <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm flex flex-col justify-between hover-lift transition-editorial">
                      <span className="text-[10px] font-mono-tech font-bold tracking-[0.2em] text-[#121212]/40 uppercase block">CUMULATIVE REALIZED P&L</span>
                      <div className={`mt-4 text-4xl font-light font-serif-editorial ${
                        metricsA.profit + metricsB.profit >= 0 ? "text-[#0F8F67]" : "text-red-700"
                      }`}>
                        {metricsA.profit + metricsB.profit >= 0 ? "+" : ""}
                        {(metricsA.profit + metricsB.profit).toFixed(2)} <span className="text-xs font-mono-tech tracking-[0.1em] uppercase text-[#121212]/40">USDT</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Sandbox Duel Control Panel */}
                  <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4 text-left">
                      <div className="h-10 w-10 rounded-full border-editorial bg-[#121212]/5 flex items-center justify-center text-[#121212]/80">
                        <Zap className="h-5 w-5" strokeWidth={1} />
                      </div>
                      <div>
                        <h4 className="font-bold text-[#121212] text-xs uppercase tracking-[0.15em] font-mono-tech">Escrow Verification Sandbox</h4>
                        <p className="text-[#121212]/50 text-xs mt-1 font-light">
                          Manually push an anomaly z-score flag to lock double-agent collateral into Solana vault accounts.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleTriggerManualDuel}
                      className="rounded-full bg-[#121212] hover:bg-black text-[10px] font-mono-tech uppercase tracking-[0.15em] text-[#F5F2EB] px-6 py-4 shadow-sm flex-shrink-0 transition-editorial"
                    >
                      🚀 Trigger Escrow Duel Instruction
                    </button>
                  </div>

                  {/* Active Escrow Exposure Register (Editorial Table) */}
                  <div className="rounded-[24px] border-editorial bg-[#F5F2EB] shadow-sm overflow-hidden">
                    <div className="border-b border-[#121212]/10 px-8 py-5 flex items-center justify-between">
                      <h3 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] uppercase">Active Escrow Ledgers</h3>
                      <span className="text-[9px] font-mono-tech border border-[#121212]/10 rounded-full px-3 py-1 text-[#121212]/50">NON-CUSTODIAL ESCROW VALUATION</span>
                    </div>
                    
                    <div className="p-8">
                      {openPositions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-[#121212]/30 font-mono-tech text-[10px] tracking-wider uppercase">
                          <Layers className="mb-3 h-8 w-8 text-[#121212]/20" strokeWidth={1} />
                          <span>NO ACTIVE LOCKS FOUND IN VAULT STATE</span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono-tech">
                            <thead>
                              <tr className="border-b border-[#121212]/10 text-[#121212]/40">
                                <th className="pb-4 uppercase tracking-[0.1em]">Agent</th>
                                <th className="pb-4 uppercase tracking-[0.1em]">Fixture Event</th>
                                <th className="pb-4 uppercase tracking-[0.1em]">Strategy</th>
                                <th className="pb-4 uppercase tracking-[0.1em]">Stake</th>
                                <th className="pb-4 uppercase tracking-[0.1em]">Odds</th>
                                <th className="pb-4 uppercase tracking-[0.1em]">Status</th>
                                <th className="pb-4 uppercase tracking-[0.1em]">Audit Proof</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#121212]/5">
                              {openPositions.map((pos) => (
                                <tr key={pos.id} className="text-[#121212]/80 hover:bg-[#121212]/2 transition-colors">
                                  <td className="py-5">
                                    <span className={`rounded border px-2.5 py-1 text-[9px] font-bold ${
                                      pos.agent === "Agent A" ? "bg-blue-50/50 text-[#235BFF] border-[#235BFF]/10" : "bg-purple-50/50 text-purple-700 border-purple-700/10"
                                    }`}>
                                      {pos.agent}
                                    </span>
                                  </td>
                                  <td className="py-5 font-bold text-[#121212]">{pos.fixtureName}</td>
                                  <td className="py-5 text-[#121212]/50 text-xs">{pos.strategyName}</td>
                                  <td className="py-5">{pos.stake} USDT</td>
                                  <td className="py-5 text-[#235BFF] font-bold">{pos.odds.toFixed(2)}</td>
                                  <td className="py-5">
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold ${
                                      pos.status === "MATCHED" ? "bg-green-50 text-[#0F8F67] border border-[#0F8F67]/20" : "bg-amber-50 text-amber-700 border border-amber-700/20"
                                    }`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${pos.status === "MATCHED" ? "bg-[#0F8F67]" : "bg-amber-500"}`} />
                                      {pos.status}
                                    </span>
                                  </td>
                                  <td className="py-5">
                                    <a
                                      href={`https://explorer.solana.com/tx/${pos.txSignature}?cluster=devnet`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[#121212]/40 hover:text-[#235BFF] transition-colors"
                                    >
                                      <span>Verify root</span>
                                      <ExternalLink className="h-3 w-3" strokeWidth={1} />
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

              {/* TAB 2: SIGNALS REGISTRY */}
              {activeTab === "signals" && (
                <div className="rounded-[24px] border-editorial bg-[#F5F2EB] shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[#121212]/10 px-8 py-5">
                    <h3 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] uppercase">Live Telemetry Signals Registry</h3>
                    <span className="text-[9px] font-mono-tech border border-[#121212]/10 rounded-full px-3 py-1 text-[#121212]/50">TELEMETRY IN-PLAY WINDOW</span>
                  </div>
                  
                  <div className="p-8">
                    {signals.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-[#121212]/30 font-mono-tech text-[10px] tracking-wider uppercase">
                        <TrendingUp className="mb-3 h-8 w-8 text-[#121212]/20" strokeWidth={1} />
                        <span>WAITING FOR TELEMETRY EVENT STREAMS</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono-tech">
                          <thead>
                            <tr className="border-b border-[#121212]/10 text-[#121212]/40">
                              <th className="pb-4 uppercase tracking-[0.1em]">Time</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Fixture Match</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Market Event</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Deviation shift</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Z-Score</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Velocity Index</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#121212]/5">
                            {signals.map((sig) => (
                              <tr key={sig.id} className="text-[#121212]/80 hover:bg-[#121212]/2 transition-colors">
                                <td className="py-4 text-[#121212]/40">{new Date(sig.timestamp).toLocaleTimeString()}</td>
                                <td className="py-4 font-bold text-[#121212]">{sig.fixtureName}</td>
                                <td className="py-4 uppercase text-xs text-[#121212]/50">{sig.marketType} ({sig.outcome})</td>
                                <td className="py-4 font-bold">
                                  <span className="text-[#121212]/30">{sig.oldOdds.toFixed(2)}</span>
                                  <span className="mx-2 text-[#121212]/20">→</span>
                                  <span className="text-[#121212]">{sig.newOdds.toFixed(2)}</span>
                                </td>
                                <td className="py-4">
                                  <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                                    sig.zScore >= 0 ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                                  }`}>
                                    {sig.zScore >= 0 ? "+" : ""}{sig.zScore.toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-4 text-[#121212]/50">{sig.velocity >= 0 ? "+" : ""}{sig.velocity.toFixed(4)}/s</td>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {(strategies.length ? strategies : PRE_BUILT_DUMMY_STRATEGIES).map((strat) => (
                    <div key={strat.name} className="flex flex-col justify-between rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm">
                      <div className="space-y-5">
                        <div className="flex items-center justify-between border-b border-[#121212]/10 pb-4">
                          <h3 className="font-bold text-xs font-mono-tech uppercase tracking-wider text-[#121212]">{strat.name}</h3>
                          <span className="text-[9px] font-mono-tech border border-[#121212]/10 rounded-full px-3 py-0.5 text-[#121212]/50 uppercase tracking-widest font-bold">MONITOR ACTIVE</span>
                        </div>
                        <p className="text-xs text-[#121212]/60 leading-relaxed font-light">{strat.description}</p>
                        
                        <div className="space-y-2 text-left">
                          <span className="text-[9px] font-mono-tech font-bold tracking-[0.15em] text-[#121212]/40 uppercase block">Telemetry Parameters</span>
                          <div className="space-y-1.5">
                            {strat.conditions.map((cond, idx) => (
                              <div key={idx} className="flex items-center justify-between rounded-xl bg-[#121212]/2 border border-[#121212]/5 px-4 py-3 text-xs font-mono-tech">
                                <span className="text-[#235BFF] font-bold uppercase">{cond.stat.replace("_", " ")}</span>
                                <div className="space-x-1.5">
                                  <span className="text-[#121212]/30">{cond.comparison}</span>
                                  <span className="text-[#121212] font-bold">{cond.threshold}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 border-t border-[#121212]/10 pt-4 text-xs font-mono-tech text-[#121212]/50 space-y-1.5 text-left">
                        <div className="flex justify-between">
                          <span>Trigger Anomaly:</span>
                          <span className="text-[#121212] font-bold">{strat.entry_signal}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Capital allocation:</span>
                          <span className="text-[#121212] font-bold">{strat.stake_usdt} USDT</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: ARENA DUEL (Bloomberg / Financial Times style) */}
              {activeTab === "arena" && (
                <div className="space-y-10">
                  
                  {/* Agents info cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Agent A */}
                    <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm text-left">
                      <div className="flex items-center justify-between pb-4 border-b border-[#121212]/10">
                        <div>
                          <span className="text-[9px] font-mono-tech tracking-[0.15em] text-[#121212]/40 uppercase block">AGENT A CONTRACTS</span>
                          <h4 className="font-serif-editorial text-2xl font-light text-[#121212] mt-1">Trend Follower</h4>
                        </div>
                        <span className="text-[9px] font-mono-tech border border-[#121212]/10 rounded-full px-2.5 py-0.5 text-[#121212]/50 font-bold uppercase">ONLINE</span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 pt-6 font-mono-tech text-xs">
                        <div>
                          <span className="text-[#121212]/40 text-[9px] tracking-wider uppercase block">REALIZED P&L</span>
                          <span className={`text-sm font-extrabold ${metricsA.profit >= 0 ? "text-[#0F8F67]" : "text-red-700"}`}>
                            {metricsA.profit >= 0 ? "+" : ""}{metricsA.profit.toFixed(2)} USDT
                          </span>
                        </div>
                        <div>
                          <span className="text-[#121212]/40 text-[9px] tracking-wider uppercase block">POSITIONS</span>
                          <span className="text-sm font-extrabold text-[#121212]">{metricsA.positionsCount}</span>
                        </div>
                        <div>
                          <span className="text-[#121212]/40 text-[9px] tracking-wider uppercase block">WIN RATE</span>
                          <span className="text-sm font-extrabold text-[#121212]">{metricsA.winRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Agent B */}
                    <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm text-left">
                      <div className="flex items-center justify-between pb-4 border-b border-[#121212]/10">
                        <div>
                          <span className="text-[9px] font-mono-tech tracking-[0.15em] text-[#121212]/40 uppercase block">AGENT B CONTRACTS</span>
                          <h4 className="font-serif-editorial text-2xl font-light text-[#121212] mt-1">Mean Reversion</h4>
                        </div>
                        <span className="text-[9px] font-mono-tech border border-[#121212]/10 rounded-full px-2.5 py-0.5 text-[#121212]/50 font-bold uppercase">ONLINE</span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 pt-6 font-mono-tech text-xs">
                        <div>
                          <span className="text-[#121212]/40 text-[9px] tracking-wider uppercase block">REALIZED P&L</span>
                          <span className={`text-sm font-extrabold ${metricsB.profit >= 0 ? "text-[#0F8F67]" : "text-red-700"}`}>
                            {metricsB.profit >= 0 ? "+" : ""}{metricsB.profit.toFixed(2)} USDT
                          </span>
                        </div>
                        <div>
                          <span className="text-[#121212]/40 text-[9px] tracking-wider uppercase block">POSITIONS</span>
                          <span className="text-sm font-extrabold text-[#121212]">{metricsB.positionsCount}</span>
                        </div>
                        <div>
                          <span className="text-[#121212]/40 text-[9px] tracking-wider uppercase block">WIN RATE</span>
                          <span className="text-sm font-extrabold text-[#121212]">{metricsB.winRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Financial Times Style curve chart */}
                  <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] uppercase">Realized Profit curves</h3>
                      <span className="text-[9px] font-mono-tech border border-[#121212]/10 rounded-full px-3 py-1 text-[#121212]/50 uppercase tracking-widest font-bold font-mono-tech">ANALYTICAL TELEMETRY</span>
                    </div>
                    
                    {pointsA.length <= 1 && pointsB.length <= 1 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-[#121212]/30 font-mono-tech text-[10px] tracking-wider uppercase">
                        <Sliders className="h-6 w-6 text-[#121212]/20 mb-2" strokeWidth={1} />
                        <span>WAITING FOR SETTLED HISTORICAL RESULTS FOR CHARTING</span>
                      </div>
                    ) : (
                      <div className="relative h-64 w-full border-l border-b border-[#121212]/15 pt-4">
                        <svg className="h-full w-full overflow-visible" preserveAspectRatio="none">
                          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(18,18,18,0.06)" strokeWidth="1" strokeDasharray="3 3" />
                          
                          <path
                            d={makeSvgPath(pointsA, 800, 240)}
                            fill="none"
                            stroke="#235BFF"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            className="transition-all duration-300"
                          />

                          <path
                            d={makeSvgPath(pointsB, 800, 240)}
                            fill="none"
                            stroke="#121212"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            className="transition-all duration-300"
                          />
                        </svg>
                        
                        <div className="absolute top-4 right-4 flex gap-4 text-[9px] font-mono-tech uppercase tracking-[0.1em]">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#235BFF]" />
                            <span className="text-[#121212]/50">Agent A (Trend Follower)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#121212]" />
                            <span className="text-[#121212]/50">Agent B (Mean Reversion)</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: LEDGER REGISTER */}
              {activeTab === "positions" && (
                <div className="rounded-[24px] border-editorial bg-[#F5F2EB] shadow-sm overflow-hidden">
                  <div className="border-b border-[#121212]/10 px-8 py-5">
                    <h3 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] uppercase">Historical Ledger Register</h3>
                  </div>
                  
                  <div className="p-8">
                    {positions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-[#121212]/30 font-mono-tech text-[10px] tracking-wider uppercase">
                        <Sliders className="mb-3 h-8 w-8 text-[#121212]/20" strokeWidth={1} />
                        <span>NO TRANSACTIONS FOUND IN LEDGER</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono-tech">
                          <thead>
                            <tr className="border-b border-[#121212]/10 text-[#121212]/40">
                              <th className="pb-4 uppercase tracking-[0.1em]">PDA Key Address</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Agent</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Strategy</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Fixture</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Allocation</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Odds</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Status</th>
                              <th className="pb-4 uppercase tracking-[0.1em]">Contract audit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#121212]/5">
                            {positions.map((pos) => (
                              <tr key={pos.id} className="text-[#121212]/80 hover:bg-[#121212]/2 transition-colors">
                                <td className="py-5 font-bold">
                                  <div>ID: {pos.id.slice(-6)}</div>
                                  <div className="text-[9px] text-[#121212]/40 truncate max-w-[120px] font-normal">{pos.makerIntentPda}</div>
                                </td>
                                <td className="py-5">
                                  <span className={`rounded border px-2.5 py-1 text-[9px] font-bold ${
                                    pos.agent === "Agent A" ? "bg-blue-50/50 text-[#235BFF] border-[#235BFF]/10" : "bg-purple-50/50 text-purple-700 border-purple-700/10"
                                  }`}>
                                    {pos.agent}
                                  </span>
                                </td>
                                <td className="py-5 text-[#121212]/50 text-xs">{pos.strategyName}</td>
                                <td className="py-5 font-bold text-[#121212]">{pos.fixtureName}</td>
                                <td className="py-5">{pos.stake} USDT</td>
                                <td className="py-5 text-[#235BFF] font-bold">{pos.odds.toFixed(2)}</td>
                                <td className="py-5">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold ${
                                    pos.status === "SETTLED"
                                      ? "bg-green-50 text-[#0F8F67] border border-[#0F8F67]/20"
                                      : pos.status === "MATCHED"
                                      ? "bg-blue-50 text-[#235BFF] border border-[#235BFF]/20"
                                      : pos.status === "FAILED"
                                      ? "bg-red-50 text-red-700 border border-red-700/20"
                                      : "bg-amber-50 text-amber-700 border border-amber-700/20"
                                  }`}>
                                    {pos.status}
                                  </span>
                                </td>
                                <td className="py-5">
                                  <a
                                    href={`https://explorer.solana.com/tx/${pos.txSignature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[#121212]/40 hover:text-[#235BFF] transition-colors"
                                  >
                                    <span>Verify</span>
                                    <ExternalLink className="h-3 w-3" strokeWidth={1} />
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Journal List */}
                  <div className="lg:col-span-2 rounded-[24px] border-editorial bg-[#F5F2EB] shadow-sm overflow-hidden">
                    <div className="border-b border-[#121212]/10 px-8 py-5">
                      <h3 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] uppercase">Merkle Proof Settle Journal</h3>
                    </div>
                    
                    <div className="p-8">
                      {settledPositions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-[#121212]/30 font-mono-tech text-[10px] tracking-wider uppercase">
                          <FileCheck className="mb-3 h-8 w-8 text-[#121212]/20" strokeWidth={1} />
                          <span>NO SETTLED ARCHIVES FOUND IN STORAGE</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {settledPositions.map((pos) => (
                            <div
                              key={pos.id}
                              onClick={() => setSelectedSettledId(pos.id)}
                              className={`flex items-center justify-between rounded-xl border p-5 cursor-pointer transition-editorial text-left ${
                                selectedSettledId === pos.id
                                  ? "border-[#121212] bg-[#121212]/3"
                                  : "border-[#121212]/10 bg-transparent hover:bg-[#121212]/2"
                              }`}
                            >
                              <div className="font-mono-tech text-xs space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[#121212]">FIXTURE #{pos.fixtureId}</span>
                                  <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${
                                    pos.agent === "Agent A" ? "bg-blue-50/50 text-[#235BFF] border-[#235BFF]/10" : "bg-purple-50/50 text-purple-700 border-purple-700/10"
                                  }`}>
                                    {pos.agent}
                                  </span>
                                </div>
                                <div className="text-[#121212] font-bold text-sm">{pos.fixtureName}</div>
                                <div className="text-[10px] text-[#121212]/50">Strategy: {pos.strategyName} | Odds: {pos.odds.toFixed(2)}</div>
                              </div>

                              <div className="text-right font-mono-tech text-xs space-y-1.5 flex-shrink-0">
                                <span className="rounded border border-[#0F8F67]/20 bg-green-50 text-[#0F8F67] px-2 py-0.5 text-[9px] font-bold">
                                  SETTLED
                                </span>
                                <div className="text-[9px] text-[#121212]/40">Click to audit path</div>
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
                          <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 space-y-6 font-mono-tech text-xs relative overflow-hidden text-left shadow-sm">
                            <div className="absolute top-0 right-0 p-4 text-[9px] text-[#121212]/30 uppercase font-mono-tech">VERDICT VERIFY</div>
                            <h4 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] border-b border-[#121212]/10 pb-3 uppercase">Oracle Proof Receipt</h4>
                            
                            <div className="space-y-4 text-left">
                              <div>
                                <span className="text-[9px] text-[#121212]/40 uppercase block tracking-wider">Trade Contract ID</span>
                                <span className="text-[#121212] font-bold">{pos.id}</span>
                              </div>

                              <div>
                                <span className="text-[9px] text-[#121212]/40 uppercase block tracking-wider">Validator Root (Epoch 20633)</span>
                                <span className="text-[#121212]/70 select-all block break-all bg-[#121212]/2 p-3 border border-[#121212]/10 rounded-xl text-[10px]">
                                  0x6d0429f5f0a904d2e9b152063c8c1df69ba90b9b30c1d68377b2be48fc8e5c3c
                                </span>
                              </div>

                              <div>
                                <span className="text-[9px] text-[#121212]/40 uppercase block tracking-wider">Merkle Proof Nodes</span>
                                <div className="text-[#121212]/50 bg-[#121212]/2 p-3 border border-[#121212]/10 rounded-xl space-y-1.5 text-[9px] tracking-normal">
                                  <div>Node 0: 0x77b...c1d6 (Verified)</div>
                                  <div>Node 1: 0x30c...e8fc (Verified)</div>
                                </div>
                              </div>

                              <div>
                                <span className="text-[9px] text-[#121212]/40 uppercase block tracking-wider">State Outcomes Proven</span>
                                <span className="text-[#121212] font-bold">Goals: 1.0 (Full Time)</span>
                              </div>

                              <div className="pt-2 border-t border-[#121212]/10">
                                <a
                                  href={`https://explorer.solana.com/tx/${pos.settleTxSignature}?cluster=devnet`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center justify-center gap-1.5 rounded-full border border-[#121212]/15 bg-transparent hover:bg-[#121212]/5 text-[#121212] py-4 transition-editorial text-center font-bold tracking-[0.1em]"
                                >
                                  <span>SOLANA CONTRACT</span>
                                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1} />
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 text-center text-[#121212]/30 font-mono-tech text-[10px] tracking-wider uppercase flex flex-col items-center justify-center min-h-[300px]">
                        <Info className="h-5 w-5 text-[#121212]/20 mb-2" strokeWidth={1} />
                        <span>Select a settled ledger contract to verify cryptographic proof.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 7: SAFETY RISK DESK */}
              {activeTab === "settings" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Parameter controls */}
                  <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm">
                    <h3 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] uppercase mb-6 border-b border-[#121212]/10 pb-3 flex items-center gap-2">
                      <ShieldAlert className="h-4.5 w-4.5 text-[#121212]/80" strokeWidth={1} />
                      Circuit Breakers & Parameters
                    </h3>
                    
                    <form onSubmit={handleSaveSettings} className="space-y-5 font-mono-tech text-xs text-left">
                      <div>
                        <label className="block text-[#121212]/50 mb-1.5 uppercase font-bold tracking-[0.15em]">Z-Score Sensitivity Threshold (σ)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={zScoreThreshold}
                          onChange={(e) => setZScoreThreshold(e.target.value)}
                          className="w-full rounded-xl border border-[#121212]/15 bg-[#121212]/2 px-3.5 py-3.5 text-[#121212] outline-none focus:border-[#121212] font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[#121212]/50 mb-1.5 uppercase font-bold tracking-[0.15em]">Max Total Exposure Limit (USDT)</label>
                        <input
                          type="number"
                          value={maxTotalExposure}
                          onChange={(e) => setMaxTotalExposure(e.target.value)}
                          className="w-full rounded-xl border border-[#121212]/15 bg-[#121212]/2 px-3.5 py-3.5 text-[#121212] outline-none focus:border-[#121212] font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[#121212]/50 mb-1.5 uppercase font-bold tracking-[0.15em]">Max Positions Per Fixture</label>
                        <input
                          type="number"
                          value={maxPositionsPerFixture}
                          onChange={(e) => setMaxPositionsPerFixture(e.target.value)}
                          className="w-full rounded-xl border border-[#121212]/15 bg-[#121212]/2 px-3.5 py-3.5 text-[#121212] outline-none focus:border-[#121212] font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[#121212]/50 mb-1.5 uppercase font-bold tracking-[0.15em]">Max Session Loss Shutdown (USDT)</label>
                        <input
                          type="number"
                          value={maxSessionLoss}
                          onChange={(e) => setMaxSessionLoss(e.target.value)}
                          className="w-full rounded-xl border border-[#121212]/15 bg-[#121212]/2 px-3.5 py-3.5 text-[#121212] outline-none focus:border-[#121212] font-bold"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={actionPending}
                        className="w-full rounded-full bg-[#121212] hover:bg-black text-[#F5F2EB] font-bold py-4 transition-colors disabled:opacity-50 uppercase tracking-[0.15em]"
                      >
                        APPLY CIRCUIT CONFIGURATION
                      </button>
                    </form>
                  </div>

                  {/* Wallet management console */}
                  <div className="rounded-[24px] border-editorial bg-[#F5F2EB] p-8 shadow-sm">
                    <h3 className="font-mono-tech font-bold text-[10px] tracking-[0.15em] text-[#121212] uppercase mb-6 border-b border-[#121212]/10 pb-3 flex items-center gap-2">
                      <DollarSign className="h-4.5 w-4.5 text-[#121212]/80" strokeWidth={1} />
                      Agent Wallet Configuration
                    </h3>
                    
                    <div className="space-y-6 font-mono-tech text-xs text-left">
                      <div className="space-y-2">
                        <span className="text-[#121212]/40 uppercase block font-bold tracking-[0.15em]">Agent A Address</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-[#121212]/2 border border-[#121212]/15 rounded-xl px-3.5 py-3 text-[#121212]/80 font-bold select-all flex-1 truncate">
                            EwvSmry1ByU9PEqxPSsTLhQQATMeUqZiWBGsDvufCTdo
                          </span>
                          <button
                            onClick={() => handleFundAgent("Agent A")}
                            disabled={fundingAgent !== null}
                            className="rounded-full border border-[#121212]/15 hover:bg-[#121212]/5 text-[#121212]/80 px-4 py-3 font-bold transition-all disabled:opacity-50 flex-shrink-0 uppercase tracking-[0.1em]"
                          >
                            {fundingAgent === "Agent A" ? "FUNDING..." : "AIRDROP"}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[#121212]/40 uppercase block font-bold tracking-[0.15em]">Agent B Address</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-[#121212]/2 border border-[#121212]/15 rounded-xl px-3.5 py-3 text-[#121212]/80 font-bold select-all flex-1 truncate">
                            41ac5tzvdc5z4BEv5suHmgC32sY2goaNDnTAvJ8gWAs7
                          </span>
                          <button
                            onClick={() => handleFundAgent("Agent B")}
                            disabled={fundingAgent !== null}
                            className="rounded-full border border-[#121212]/15 hover:bg-[#121212]/5 text-[#121212]/80 px-4 py-3 font-bold transition-all disabled:opacity-50 flex-shrink-0 uppercase tracking-[0.1em]"
                          >
                            {fundingAgent === "Agent B" ? "FUNDING..." : "AIRDROP"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl bg-[#121212]/2 border border-[#121212]/5 p-4 text-[#121212]/50 flex gap-3">
                        <Info className="h-4.5 w-4.5 text-[#121212]/60 flex-shrink-0 mt-0.5" strokeWidth={1} />
                        <p className="leading-relaxed text-[10px] font-light">
                          Keypair storage linkage matches configuration file <code className="text-[#121212] font-bold">wallets.json</code>. Airdrop calls direct devnet SOL faucet injection and simulated USDT balance allocation.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>

          {/* Floating toast notification */}
          {newSignalAlert && (
            <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-[#235BFF]/30 bg-[#F5F2EB] p-4 shadow-xl font-mono-tech text-xs text-[#121212] border-editorial">
              <Activity className="h-4 w-4 animate-spin text-[#235BFF]" strokeWidth={1.5} />
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
