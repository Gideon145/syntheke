import http from "node:http";
import { config } from "./config";
import { startMonitor, stopMonitor, getMonitorState } from "./monitor";
import { negotiationEngine } from "./negotiator";
import { logger } from "./logger";

/**
 * Syntheke Agent — Main Entry Point
 *
 * Starts the autonomous monitor agent and an HTTP status/control server.
 * The monitor runs in the same process as the HTTP server (no microservices yet).
 *
 * Endpoints:
 *   GET  /status       — Full agent state
 *   GET  /health        — Liveness check
 *   GET  /pacts         — List monitored pacts
 *   GET  /pacts/:id     — Single pact monitoring state
 *   GET  /negotiations  — Active negotiation sessions
 *   POST /monitor/stop  — Gracefully stop the monitor
 *   POST /monitor/start — Restart the monitor
 */

// ──── HTTP Server ────────────────────────────────────────

function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${config.PORT}`);

    try {
      // GET /health
      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
        return;
      }

      // GET /status
      if (req.method === "GET" && url.pathname === "/status") {
        const state = getMonitorState();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          agent: state?.signerState.address ?? "not started",
          chainId: state?.signerState.chainId ?? config.XLAYER_CHAIN_ID,
          cycles: state?.cycleCount ?? 0,
          attestations: state?.totalAttestations ?? 0,
          pactsMonitored: state?.pactsMonitored.size ?? 0,
          running: state?.isRunning ?? false,
          lastCycle: state?.lastCycleStart ?? null,
        }));
        return;
      }

      // GET /pacts
      if (req.method === "GET" && url.pathname === "/pacts") {
        const state = getMonitorState();
        const pacts: Array<{ id: string; lastState: number; degradationCount: number }> = [];
        if (state) {
          for (const [id, tracker] of state.pactsMonitored) {
            pacts.push({ id, lastState: tracker.lastState, degradationCount: tracker.degradationCount });
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ pacts, total: pacts.length }));
        return;
      }

      // GET /pacts/:id
      if (req.method === "GET" && url.pathname.startsWith("/pacts/")) {
        const pactId = url.pathname.slice(7);
        const state = getMonitorState();
        const tracker = state?.pactsMonitored.get(pactId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(tracker ?? { error: "not found" }));
        return;
      }

      // GET /negotiations
      if (req.method === "GET" && url.pathname === "/negotiations") {
        const sessions = negotiationEngine.getActiveSessions();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessions, total: sessions.length }));
        return;
      }

      // POST /monitor/stop
      if (req.method === "POST" && url.pathname === "/monitor/stop") {
        stopMonitor();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "stopping" }));
        return;
      }

      // POST /monitor/start
      if (req.method === "POST" && url.pathname === "/monitor/start") {
        const state = getMonitorState();
        if (state?.isRunning) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "already_running" }));
          return;
        }
        // Start in background — don't await
        startMonitor().catch(err => logger.error({ err }, "Monitor start failed"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "starting" }));
        return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (err) {
      logger.error({ err }, "HTTP handler error");
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal" }));
    }
  });
}

// ──── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info({ event: "agent_bootstrap" }, "🏛️  Syntheke Agent Phase 2 starting...");

  // Start HTTP server
  const server = createServer();
  server.listen(config.PORT, () => {
    logger.info({ event: "server_started", port: config.PORT }, `HTTP server on :${config.PORT}`);
  });

  // Start the autonomous monitor
  await startMonitor();

  // Graceful shutdown
  const shutdown = () => {
    logger.info({ event: "shutdown" }, "Shutting down...");
    stopMonitor();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "Fatal agent error");
  process.exit(1);
});
