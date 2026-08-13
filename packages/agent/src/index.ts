import http from "node:http";
import { ethers } from "ethers";
import { config } from "./config";
import { startMonitor, stopMonitor, getMonitorState } from "./monitor";
import { negotiationEngine } from "./negotiator";
import type { DisputeEvidence } from "./ai/mediator";
import { logger } from "./logger";

// ──── Activity Log (ring buffer, last 30 events) ─────────

interface ActivityEntry {
  timestamp: number;
  event: string;
  detail: string;
  pactId?: string;
  txHash?: string;
}

const activityLog: ActivityEntry[] = [];
const MAX_ACTIVITY = 30;

export function logActivity(event: string, detail: string, pactId?: string, txHash?: string): void {
  activityLog.push({ timestamp: Date.now(), event, detail, pactId, txHash });
  if (activityLog.length > MAX_ACTIVITY) activityLog.shift();
}

// ──── Cached Pact List (refreshed every 30s) ──────────────

interface CachedPact {
  pactId: string;
  name: string;
  subtitle?: string;
  lastState: number;
  degradationCount: number;
  attestationCount: number;
  partyA?: string;
  partyB?: string;
}

// In-memory pact name registry (set during creation)
const pactNames = new Map<string, string>();

export function setPactName(pactId: string, description: string): void {
  const short = description.length > 55 ? description.slice(0, 52) + "..." : description;
  pactNames.set(pactId, short);
}

let cachedPacts: CachedPact[] = [];
let lastPactRefresh = 0;

async function refreshPactCache(): Promise<void> {
  try {
    const { getPactContractRead } = await import("./pact");
    const contract = getPactContractRead();
    const ids: string[] = await contract.getPactIds();
    const list: CachedPact[] = [];
    for (const id of ids) {
      try {
        const onChain = await contract.getPactState(id);
        const savedName = pactNames.get(id);
        // Derive treaty number from position in the reversed list (newest = highest #)
        const treatyNum = ids.length - list.length;
        const title = `Treaty #${treatyNum}`;
        list.push({
          pactId: id,
          name: title,
          subtitle: savedName || undefined,
          lastState: Number(onChain.state),
          degradationCount: Number(onChain.consecutiveDegradation),
          attestationCount: Number(onChain.attestationCount),
          partyA: onChain.partyA,
          partyB: onChain.partyB,
        });
      } catch { /* skip corrupted */ }
    }
    cachedPacts = list.reverse(); // newest first
    lastPactRefresh = Date.now();
  } catch { /* keep old cache */ }
}
// Initial load
refreshPactCache();
// Refresh every 30s
setInterval(refreshPactCache, 30_000);

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

      // GET /activity — recent agent events
      if (req.method === "GET" && url.pathname === "/activity") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ events: activityLog.slice(-20), total: activityLog.length }));
        return;
      }

      // GET /notifications — A2A notification history
      if (req.method === "GET" && url.pathname === "/notifications") {
        const { getRecentNotifications } = await import("./notify");
        const notifs = getRecentNotifications(20);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ notifications: notifs, total: notifs.length }));
        return;
      }

      // GET /pacts — return from cache (refreshed every 30s)
      if (req.method === "GET" && url.pathname === "/pacts") {
        // Trigger async refresh if cache is stale
        if (Date.now() - lastPactRefresh > 15_000) refreshPactCache();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ pacts: cachedPacts, total: cachedPacts.length }));
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
            degradationCount: Number(onChain.consecutiveDegradation),
            attestationCount: Number(onChain.attestationCount),
            lastAttestationBlock: tracker?.lastAttestationBlock || Number(onChain.breachBlock) || 0,
            partyA: onChain.partyA,
            partyB: onChain.partyB,
            activationBlock: Number(onChain.activationBlock) || Number(onChain.breachBlock) || 0,
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

      // GET /treasury — on-chain protocol treasury stats
      if (req.method === "GET" && url.pathname === "/treasury") {
        const { ethers } = await import("ethers");
        const treasuryAbi = await import("./abis/TreasuryVault.json", { with: { type: "json" } });
        const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
        const treasury = new ethers.Contract(config.TREASURY_VAULT, treasuryAbi.default as unknown as ethers.InterfaceAbi, provider);
        const [feeAmount, totalCollected, count, balance, owner] = await Promise.all([
          treasury.feeAmount(),
          treasury.totalFeesCollected(),
          treasury.feeCount(),
          treasury.balance(),
          treasury.owner(),
        ]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          address: config.TREASURY_VAULT,
          owner,
          feeAmount: feeAmount.toString(),
          feeAmountFormatted: ethers.formatEther(feeAmount),
          totalCollected: totalCollected.toString(),
          totalCollectedFormatted: ethers.formatEther(totalCollected),
          feeCount: Number(count),
          balance: balance.toString(),
          balanceFormatted: ethers.formatEther(balance),
        }));
        return;
      }

      // GET /staking — mediator economic stakes
      if (req.method === "GET" && url.pathname === "/staking") {
        const { getStakingState } = await import("./staking");
        const state = await getStakingState();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state));
        return;
      }

      // POST /demo/degrade/:pactId — force soft-condition degradation (demo only)
      if (req.method === "POST" && url.pathname.startsWith("/demo/degrade/")) {
        const pactId = url.pathname.slice("/demo/degrade/".length);
        const { forceDegrade } = await import("./oracles");
        forceDegrade(pactId);
        logger.info({ event: "demo_degrade", pactId: pactId.slice(0, 10) }, "Demo degradation forced (300s window)");
        logActivity("demo_degrade", "Demo trigger: forcing soft-condition degradation (self-heal incoming)", pactId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "degrading", pactId, windowMs: 300_000 }));
        return;
      }

      // GET /contracts/:pactId — plain-English contract for a treaty
      if (req.method === "GET" && url.pathname.startsWith("/contracts/")) {
        const pactId = url.pathname.slice("/contracts/".length);
        const { getContract } = await import("./ai/contract-writer");
        const contract = getContract(pactId);
        if (!contract) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No contract found for this pact" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(contract));
        return;
      }

      // GET /negotiations — live AI negotiation theater sessions
      if (req.method === "GET" && url.pathname === "/negotiations") {
        const { negotiationTheater } = await import("./ai/theater");
        const theaterSessions = negotiationTheater.listSessions();
        const engineSessions = negotiationEngine.getActiveSessions();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessions: theaterSessions, engineSessions: engineSessions.length, total: theaterSessions.length }));
        return;
      }

      // GET /negotiations/:pactId — full negotiation transcript
      if (req.method === "GET" && url.pathname.startsWith("/negotiations/")) {
        const pactId = url.pathname.slice("/negotiations/".length);
        const { negotiationTheater } = await import("./ai/theater");
        const session = negotiationTheater.getSession(pactId);
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No negotiation session found for this pact" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(session));
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

      // GET /ai/status — dual-model AI service health
      if (req.method === "GET" && url.pathname === "/ai/status") {
        const { aiService, deepseekService } = await import("./ai/service");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          models: [
            {
              id: "claude",
              provider: "anthropic",
              available: aiService.isAvailable,
              model: config.AI_MODEL,
              role: "Themis · negotiation Party A",
            },
            {
              id: "deepseek",
              provider: "deepseek",
              available: deepseekService.isAvailable,
              model: config.DEEPSEEK_MODEL,
              role: "Athena · Solon · negotiation Party B",
            },
          ],
          swarmHealthy: [aiService.isAvailable, deepseekService.isAvailable].filter(Boolean).length >= 1,
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

      // POST /notifications/test — simulate an A2A ping for testing
      if (req.method === "POST" && url.pathname === "/notifications/test") {
        const { notifyParties } = await import("./notify");
        const testPactId = "0x" + "aa".repeat(32);
        const partyA = "0xCAadA93b4A4D8632d77435A8ee51E5C3D497fD03";
        const partyB = "0x" + "bb".repeat(20);
        const results = [
          notifyParties(testPactId, "DEGRADING", partyA, partyB, "Payment timeliness at 72% — 3 consecutive cycles below threshold"),
          notifyParties(testPactId, "BREACHED", partyA, partyB, "Liquidation monitoring SLA violated — 0/8 conditions passing"),
          notifyParties(testPactId, "ARBITRATING", partyA, partyB, "100-block cure window expired — escalating to AI mediators"),
          notifyParties(testPactId, "CLOSED", partyA, partyB, "50/50 split — escrow distributed, reputation updated on-chain"),
        ];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sent: results.flat().length, states: ["DEGRADING", "BREACHED", "ARBITRATING", "CLOSED"] }));
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
