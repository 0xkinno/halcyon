import { createServer, IncomingMessage, ServerResponse } from "http";
import { startArenaRunner, getRunnerState, stopArenaRunner } from "./arenaRunner";
import { getSignals, clearSignals } from "./signalDetector";
import { getPositions, clearPositions, fundAgentWallet } from "./executor";
import { PRE_BUILT_STRATEGIES } from "./strategyEngine";
import { isSafeModeActive, safeModeReason, config as safeModeConfig, updateConfig } from "./safeMode";

const PORT = process.env.PORT || 3001;

// Start the persistent agent loop automatically when the worker process boots
console.log("[Worker] Starting agent loop...");
startArenaRunner()
  .then(() => {
    console.log("[Worker] Agent loop running successfully.");
  })
  .catch((e) => {
    console.error("[Worker] Error starting agent loop:", e);
  });

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse path
  const url = req.url || "";
  const pathname = url.split("?")[0];

  if (req.method === "GET" && pathname === "/api/state") {
    try {
      const runnerState = getRunnerState();
      const signals = getSignals();
      const positions = getPositions();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
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
        })
      );
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: e.message || e }));
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/action") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body);
        const { action, settings, agent } = parsed;

        if (action === "start") {
          await startArenaRunner();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Arena runner started." }));
          return;
        }

        if (action === "stop") {
          stopArenaRunner();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Arena runner stopped." }));
          return;
        }

        if (action === "clear") {
          clearSignals();
          clearPositions();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Signals and positions logs cleared." }));
          return;
        }

        if (action === "settings" && settings) {
          updateConfig(settings);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Safe mode configurations updated." }));
          return;
        }

        if (action === "fund") {
          if (agent === "Agent A" || agent === "Agent B") {
            await fundAgentWallet(agent);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, message: `Funding completed for ${agent}.` }));
            return;
          }
        }

        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Invalid action parameter" }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message || e }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[Worker] Server listening on port ${PORT}`);
});
