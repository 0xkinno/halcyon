import { NextResponse } from "next/server";
import { getRunnerState, startArenaRunner, stopArenaRunner } from "@/agent/arenaRunner";
import { getSignals, clearSignals } from "@/agent/signalDetector";
import { getPositions, clearPositions } from "@/agent/executor";
import { PRE_BUILT_STRATEGIES } from "@/agent/strategyEngine";
import { isSafeModeActive, safeModeReason, config as safeModeConfig, updateConfig } from "@/agent/safeMode";

// Auto-start the agent daemon on first API query to simplify hackathon staging
let initialized = false;
if (typeof window === "undefined" && !initialized) {
  initialized = true;
  startArenaRunner().catch((e) => {
    console.error("[API AutoStart] Error starting arena runner daemon:", e);
  });
}

export async function GET() {
  try {
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
