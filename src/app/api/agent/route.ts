import { NextResponse } from "next/server";
import { getRunnerState, startArenaRunner, stopArenaRunner } from "@/agent/arenaRunner";
import { getSignals, clearSignals } from "@/agent/signalDetector";
import { getPositions, clearPositions } from "@/agent/executor";
import { PRE_BUILT_STRATEGIES } from "@/agent/strategyEngine";
import { isSafeModeActive, safeModeReason, config as safeModeConfig, updateConfig } from "@/agent/safeMode";

const WORKER_URL = process.env.AGENT_WORKER_URL;

// Auto-start the local agent daemon ONLY if we are not using a remote worker
if (!WORKER_URL) {
  let initialized = false;
  if (typeof window === "undefined" && !initialized) {
    initialized = true;
    startArenaRunner().catch((e) => {
      console.error("[API AutoStart] Error starting arena runner daemon:", e);
    });
  }
}

export async function GET() {
  try {
    if (WORKER_URL) {
      // Proxy request to the worker
      const res = await fetch(`${WORKER_URL}/api/state`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Worker responded with status ${res.status}`);
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Local Fallback
    const runnerState = getRunnerState();
    const signals = getSignals();
    const positions = getPositions();

    return NextResponse.json({
      success: true,
      runnerState,
      signals,
      positions,
      strategies: PRE_BUILT_STRATEGIES,
      safeMode: {
        active: isSafeModeActive,
        reason: safeModeReason,
        config: safeModeConfig,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || e },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (WORKER_URL) {
      // Proxy request to the worker
      const res = await fetch(`${WORKER_URL}/api/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Worker action responded with status ${res.status}`);
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Local Fallback
    const { action, settings, agent } = body;

    if (action === "start") {
      await startArenaRunner();
      return NextResponse.json({ success: true, message: "Arena runner started." });
    }

    if (action === "stop") {
      stopArenaRunner();
      return NextResponse.json({ success: true, message: "Arena runner stopped." });
    }

    if (action === "clear") {
      clearSignals();
      clearPositions();
      return NextResponse.json({ success: true, message: "Signals and positions logs cleared." });
    }

    if (action === "settings" && settings) {
      updateConfig(settings);
      return NextResponse.json({ success: true, message: "Safe mode configurations updated." });
    }

    if (action === "fund") {
      if (agent === "Agent A" || agent === "Agent B") {
        const { fundAgentWallet } = await import("@/agent/executor");
        await fundAgentWallet(agent);
        return NextResponse.json({ success: true, message: `Funding completed for ${agent}.` });
      }
    }

    return NextResponse.json(
      { success: false, error: "Invalid action parameter" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || e },
      { status: 500 }
    );
  }
}
