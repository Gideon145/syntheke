import http from "node:http";
import { config } from "./config";
import { startMonitor, stopMonitor, getMonitorState } from "./monitor";
import { negotiationEngine } from "./negotiator";
import type { DisputeEvidence } from "./ai/mediator";
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
        const pactsList: Array<{ pactId: string; lastState: number; degradationCount: number; partyA?: string; partyB?: string; attestationCount?: number }> = [];
        if (state) {
          for (const [id, tracker] of state.pactsMonitored) {
            pactsList.push({ pactId: id, lastState: tracker.lastState, degradationCount: tracker.degradationCount, attestationCount: tracker.lastAttestationBlock > 0 ? 1 : 0 });
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ pacts: pactsList, total: pactsList.length }));
        return;
      }

      // GET /pacts/:id — enriched with on-chain data
      if (req.method === "GET" && url.pathname.startsWith("/pacts/")) {
        const pactId = url.pathname.slice(7);
        const state = getMonitorState();
        const tracker = state?.pactsMonitored.get(pactId);

        // Try to enrich with on-chain data (parties, real attestation count)
        let enriched: Record<string, unknown> = { ...tracker, pactId };
        try {
          const { getPactContractRead } = await import("./pact");
          const contract = getPactContractRead();
          const onChain = await contract.getPactState(pactId);
          enriched = {
            pactId,
            lastState: Number(onChain.state),
            degradationCount: tracker?.degradationCount ?? 0,
            attestationCount: Number(onChain.attestationCount),
            lastAttestationBlock: tracker?.lastAttestationBlock ?? 0,
            partyA: onChain.partyA,
            partyB: onChain.partyB,
            activationBlock: Number(onChain.activationBlock),
            breachTier: Number(onChain.breachTier),
            closed: onChain.closed,
          };
        } catch (err) {
          // Fall back to tracker-only data
          if (tracker) {
            enriched = {
              pactId,
              lastState: tracker.lastState,
              degradationCount: tracker.degradationCount,
              attestationCount: tracker.lastAttestationBlock > 0 ? 1 : 0,
              lastAttestationBlock: tracker.lastAttestationBlock,
            };
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(enriched));
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

      // GET /ai/status — AI service health
      if (req.method === "GET" && url.pathname === "/ai/status") {
        const { aiService } = await import("./ai/service");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          available: aiService.isAvailable,
          model: config.AI_MODEL,
        }));
        return;
      }

      // POST /ai/mediate — run AI mediation for a dispute
      if (req.method === "POST" && url.pathname === "/ai/mediate") {
        const body = await readBody(req);
        const { mediatorSwarm } = await import("./ai/mediator");
        const consensus = await mediatorSwarm.mediateDispute(body as unknown as DisputeEvidence);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(consensus));
        return;
      }

      // POST /ai/negotiate — generate pact terms from natural language
      if (req.method === "POST" && url.pathname === "/ai/negotiate") {
        const body = await readBody(req);
        const { nlToPactTerms } = await import("./ai/negotiator");
        const result = await nlToPactTerms(String(body.description ?? ""));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // GET /integrations — Phase 5: OKX Wallet + OnchainOS status
      if (req.method === "GET" && url.pathname === "/integrations") {
        const { onchainOS } = await import("./integrations/onchainos");
        const { runSecurityChecklist } = await import("./integrations/verification");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          onchainos: onchainOS.isAvailable,
          okxWallet: true,
          security: runSecurityChecklist(),
          contracts: {
            syntheke: config.SYNTHEKE_CONTRACT,
            agentRegistry: config.AGENT_REGISTRY,
            escrowVault: config.ESCROW_VAULT,
            reputationRegistry: config.REPUTATION_REGISTRY,
          },
        }));
        return;
      }

      // GET /marketplace — OKX AI Marketplace status + agent card
      if (req.method === "GET" && url.pathname === "/marketplace") {
        const { generateAgentCard } = await import("./integrations/okx-marketplace");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(generateAgentCard()));
        return;
      }

      // POST /pacts/create — create a new pact from natural language (Phase 7: User Flow)
      if (req.method === "POST" && url.pathname === "/pacts/create") {
        const body = await readBody(req);
        const { createPactFromNL } = await import("./create-pact");
        const result = await createPactFromNL({
          partyADesc: String(body.partyADesc ?? "Agent Alpha"),
          partyBDesc: String(body.partyBDesc ?? "Agent Beta"),
          description: String(body.description ?? ""),
        });
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /pacts/join — Party B joins an existing draft pact
      if (req.method === "POST" && url.pathname === "/pacts/join") {
        const body = await readBody(req);
        const pactId = String(body.pactId ?? "");
        if (!pactId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "pactId is required" }));
          return;
        }
        const { joinExistingPact } = await import("./create-pact");
        const result = await joinExistingPact(pactId);
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
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

// ──── Helpers ────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { resolve({}); }
    });
    req.on("error", reject);
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
