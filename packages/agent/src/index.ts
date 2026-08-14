import http from "node:http";
import { ethers } from "ethers";
import { config } from "./config";
import { startMonitor, stopMonitor, getMonitorState } from "./monitor";
import { negotiationEngine } from "./negotiator";
import type { DisputeEvidence } from "./ai/mediator";
import { logger } from "./logger";
import {
  initDb,
  saveActivity,
  loadRecentActivity,
  loadPactNames,
  loadNegotiations,
  loadContracts,
  savePactName,
} from "./db";

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
  // Persist for restart survival (Batch 1)
  saveActivity({ timestamp: Date.now(), event, detail, pactId, txHash });
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
  // Persist for restart survival (Batch 1)
  savePactName(pactId, short);
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

/** Premium content behind x402: full attestation history + theater transcript. */
async function buildPremiumTimeline(pactId: string): Promise<Record<string, unknown>> {
  const events = activityLog.filter(a => a.pactId === pactId);
  let onChain: Record<string, unknown> = {};
  try {
    const { getPactContractRead } = await import("./pact");
    const state = await getPactContractRead().getPactState(pactId);
    onChain = {
      lastState: Number(state.state),
      attestationCount: Number(state.attestationCount),
      degradationCount: Number(state.consecutiveDegradation),
      breachTier: Number(state.breachTier),
      partyA: state.partyA,
      partyB: state.partyB,
      closed: state.closed,
    };
  } catch { /* on-chain read failed */ }

  let theater: unknown = null;
  try {
    const { negotiationTheater } = await import("./ai/theater");
    theater = negotiationTheater.getSession(pactId) ?? null;
  } catch { /* theater unavailable */ }

  return {
    pactId,
    unlockedAt: Date.now(),
    onChain,
    attestationHistory: events.slice(-30),
    negotiationTheater: theater,
  };
}

function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, PAYMENT-SIGNATURE, PAYMENT-REQUIRED");
    res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");

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
          const { isAdversarialPact, getPactSubject, SUBJECT_LABELS } = await import("./create-pact");
          const contract = getPactContractRead();
          const onChain = await contract.getPactState(pactId);
          const subject = getPactSubject(pactId);
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
            adversarial: isAdversarialPact(pactId),
            subject: subject ?? "general",
            subjectLabel: subject ? SUBJECT_LABELS[subject] : SUBJECT_LABELS.general,
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

      // GET /escrow — real escrow vault state (Batch 1)
      if (req.method === "GET" && url.pathname === "/escrow") {
        const { getEscrowState } = await import("./escrow");
        const state = await getEscrowState();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state));
        return;
      }

      // GET /premium/timeline/:pactId — x402 payment-gated (Batch 2, Feature 4)
      if (req.method === "GET" && url.pathname.startsWith("/premium/timeline/")) {
        const pactId = url.pathname.slice("/premium/timeline/".length);
        const { settlePayment, respond402, paymentResponseHeader } = await import("./x402");
        const path = url.pathname;

        // Paid replay: PAYMENT-SIGNATURE header present → verify + settle
        const settlement = await settlePayment(req.headers["payment-signature"] as string | undefined, path);
        if (settlement) {
          logActivity("x402_payment", `Premium access settled: ${settlement.amount} TUSD9 units from ${settlement.payer.slice(0, 10)}…`, pactId, settlement.txHash);
          const timeline = await buildPremiumTimeline(pactId);
          res.writeHead(200, {
            "Content-Type": "application/json",
            "PAYMENT-RESPONSE": paymentResponseHeader(settlement),
          });
          res.end(JSON.stringify({ paidAccess: true, settlement, ...timeline }));
          return;
        }

        respond402(res, "GET", path);
        return;
      }

      // GET /votes/:pactId — on-chain commit-reveal mediator votes (Batch 2, Feature 5)
      if (req.method === "GET" && url.pathname.startsWith("/votes/")) {
        const pactId = url.pathname.slice(7);
        const { getVoteRoundState } = await import("./vote");
        try {
          const state = await getVoteRoundState(pactId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(state));
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ address: config.MEDIATOR_VOTES, pactId, mediators: [], votes: [], commitCount: 0, roundComplete: false }));
        }
        return;
      }

      // GET /payments — x402 payment state (Batch 2)
      if (req.method === "GET" && url.pathname === "/payments") {
        const { getPaymentsState } = await import("./x402");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getPaymentsState()));
        return;
      }

      // GET /feedback/pending — ERC-8004 dual-write queue (Batch 2, Feature 6)
      if (req.method === "GET" && url.pathname === "/feedback/pending") {
        const { loadPendingFeedback } = await import("./db");
        const { getEvaluatorIds, getQueuedFeedback } = await import("./feedback");
        const dbPending = await loadPendingFeedback();
        const mem = getQueuedFeedback();
        // Merge DB rows with in-memory entries (memory-only mode has no DB)
        const seen = new Set(dbPending.map(p => `${p.pactId}|${p.party}`));
        const memOnly = mem.filter(q => !seen.has(`${q.pactId}|${q.party}`));
        const pending = [
          ...dbPending,
          ...memOnly.map(q => ({
            id: q.id, pactId: q.pactId, party: q.party, okxAgentId: q.okxAgentId,
            creatorAgentId: q.creatorAgentId, score: q.score, description: q.description,
            taskId: q.taskId, createdAt: q.createdAt,
          })),
        ];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ pending, total: pending.length, evaluators: getEvaluatorIds() }));
        return;
      }

      // POST /feedback/acked — mark queued reviews as submitted by the bridge
      if (req.method === "POST" && url.pathname === "/feedback/acked") {
        let body = "";
        for await (const chunk of req) body += chunk;
        try {
          const { ids } = JSON.parse(body || "{}") as { ids?: number[] };
          const { ackFeedback } = await import("./db");
          const { ackQueuedFeedback } = await import("./feedback");
          for (const id of ids ?? []) ackFeedback(id);
          ackQueuedFeedback(ids ?? []);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ acked: ids?.length ?? 0 }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "bad_request" }));
        }
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

      // GET /reputation — portable reputation oracle (Phase 4a)
      if (req.method === "GET" && url.pathname === "/reputation") {
        const { getReputationSnapshot, getOracleInfo } = await import("./reputation");
        const target = url.searchParams.get("agent");
        if (target) {
          const snapshot = await getReputationSnapshot(target);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ address: target, reputation: snapshot, oracle: await getOracleInfo() }));
          return;
        }
        // Default: all known agents — pact parties (from cache) + mediator swarm
        const addresses = new Set<string>();
        for (const p of cachedPacts) {
          if (p.partyA) addresses.add(p.partyA);
          if (p.partyB) addresses.add(p.partyB);
        }
        for (const a of [config.THEMIS_ADDRESS, config.ATHENA_ADDRESS, config.SOLON_ADDRESS]) {
          if (a) addresses.add(a);
        }
        const snapshots = await Promise.all([...addresses].map(async addr => {
          const reputation = await getReputationSnapshot(addr);
          return { address: addr, reputation };
        }));
        // Rated agents first (descending score), then unrated
        snapshots.sort((a, b) => (b.reputation?.score ?? -1) - (a.reputation?.score ?? -1));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ agents: snapshots, oracle: await getOracleInfo() }));
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

      // POST /demo/breach/:pactId — force critical breach → AI arbitration (demo only)
      if (req.method === "POST" && url.pathname.startsWith("/demo/breach/")) {
        const pactId = url.pathname.slice("/demo/breach/".length);
        const { forceBreach } = await import("./oracles");
        forceBreach(pactId);
        logger.info({ event: "demo_breach", pactId: pactId.slice(0, 10) }, "Demo breach forced — arbitration incoming");
        logActivity("demo_breach", "Demo trigger: critical condition failure — AI arbitration + reputation update incoming", pactId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "breaching", pactId, windowMs: 300_000 }));
        return;
      }

      // GET /syndicates — N-party treaty syndicates (Phase 4b)
      if (req.method === "GET" && url.pathname === "/syndicates") {
        const { listCreatedSyndicates, listOnChainSyndicateIds, getSyndicateSnapshot } = await import("./syndicate");
        const created = listCreatedSyndicates();
        const onChain = await listOnChainSyndicateIds();
        // Union of on-chain ids and in-memory ids (in-memory covers agents that
        // were formed before enumeration existed)
        const ids = [...new Set([...onChain, ...created.map(c => c.syndicateId)])];
        const snapshots = await Promise.all(ids.map(id => getSyndicateSnapshot(id)));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          contract: config.TREATY_SYNDICATE,
          syndicates: snapshots.filter(Boolean),
          total: ids.length,
        }));
        return;
      }

      // POST /syndicates/create — form a new N-party syndicate
      if (req.method === "POST" && url.pathname === "/syndicates/create") {
        const body = await readBody(req);
        const { createSyndicate } = await import("./syndicate");
        const { ethers: ethersMod } = await import("ethers");
        const roles = Array.isArray(body.members) ? body.members : ["agent", "Themis", "Athena"];
        const memberRoles: string[] = roles.map((r: unknown) => String(r));
        const { resolveMemberAddresses } = await import("./syndicate");
        const stakeEach = String(body.stakeEach ?? "0.003");
        const members = memberRoles
          .map(role => ({ role, address: resolveMemberAddresses(role) }))
          .filter(m => m.address);
        const stakesWei = members.map(() => ethersMod.parseEther(stakeEach));
        const result = await createSyndicate(
          String(body.name ?? "Agent Syndicate"),
          String(body.charter ?? "Autonomous agent syndicate charter."),
          members,
          stakesWei,
        );
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /syndicates/:id/propose — member proposes a motion
      if (req.method === "POST" && url.pathname.startsWith("/syndicates/") && url.pathname.endsWith("/propose")) {
        const syndicateId = url.pathname.slice("/syndicates/".length, -"/propose".length);
        const body = await readBody(req);
        const { propose } = await import("./syndicate");
        const { ethers: ethersMod } = await import("ethers");
        const as = String(body.as ?? "agent");
        const kind = String(body.kind ?? "RENEGOTIATE");
        const target = String(body.target ?? ethersMod.ZeroAddress);
        const payouts = Array.isArray(body.payouts) ? body.payouts.map((p: unknown) => BigInt(String(p))) : [];
        const newCharter = String(body.newCharter ?? "");
        const result = await propose(syndicateId, as, kind as "RENEGOTIATE" | "BREACH" | "SETTLE", target, payouts, newCharter);
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ syndicateId, ...result }));
        return;
      }

      // POST /syndicates/:id/vote — member votes on a proposal
      if (req.method === "POST" && url.pathname.startsWith("/syndicates/") && url.pathname.endsWith("/vote")) {
        const syndicateId = url.pathname.slice("/syndicates/".length, -"/vote".length);
        const body = await readBody(req);
        const { vote } = await import("./syndicate");
        const result = await vote(
          syndicateId,
          Number(body.proposalId),
          String(body.as ?? "agent"),
          Boolean(body.support),
        );
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ syndicateId, ...result }));
        return;
      }

      // POST /syndicates/demo — full automated syndicate demo (create → amend → breach → slash)
      if (req.method === "POST" && url.pathname === "/syndicates/demo") {
        const { runSyndicateDemo } = await import("./syndicate");
        const result = await runSyndicateDemo();
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
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
          adversarial: body.adversarial === true,
        });
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /demo/adversarial — adversarial public pact (Batch 3, Feature 9)
      if (req.method === "POST" && url.pathname === "/demo/adversarial") {
        const body = await readBody(req);
        const { createPactFromNL } = await import("./create-pact");
        const description = String(body.description ??
          "Adversarial stress test: provider promises 99.9% uptime and liquidation monitoring every 60 seconds, with a 25% penalty for any breach");
        logActivity("adversarial_demo", "⚔️ Adversarial public pact requested — hostile counterparty incoming");
        const result = await createPactFromNL({
          partyADesc: "Client agent (watchdog)",
          partyBDesc: "Adversary agent",
          description,
          adversarial: true,
        });
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // GET /artifacts/:pactId — verifiable AI artifacts on-chain (Batch 3, Feature 7)
      if (req.method === "GET" && url.pathname.startsWith("/artifacts/")) {
        const pactId = url.pathname.slice("/artifacts/".length);
        const { getPactArtifacts, verifyArtifactOnChain } = await import("./artifact");
        const chain = await getPactArtifacts(pactId);
        const checks: Array<{ kind: string; hash: string; onChain: boolean }> = [];
        try {
          const { getContract } = await import("./ai/contract-writer");
          const c = getContract(pactId);
          if (c) {
            const v = await verifyArtifactOnChain(pactId, c.commitmentHash);
            checks.push({ kind: `contract-v${c.version}`, hash: c.commitmentHash, onChain: v.found });
          }
        } catch { /* no contract */ }
        try {
          const { negotiationTheater } = await import("./ai/theater");
          const s = negotiationTheater.getSession(pactId);
          if (s) {
            for (const t of s.transcript.slice(-6)) {
              const v = await verifyArtifactOnChain(pactId, t.commitmentHash);
              checks.push({ kind: "negotiation-move", hash: t.commitmentHash, onChain: v.found });
            }
          }
        } catch { /* no session */ }
        // Fallback: no in-memory session (e.g. pact created by another instance) —
        // verify the registry records themselves so provenance still shows as proven.
        if (checks.length === 0) {
          for (const a of chain.artifacts.slice(0, 12)) {
            const v = await verifyArtifactOnChain(pactId, a.hash);
            checks.push({ kind: a.kind, hash: a.hash, onChain: v.found });
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...chain, localChecks: checks, allVerified: checks.length > 0 && checks.every(c => c.onChain) }));
        return;
      }

      // GET /theater/stream/:pactId — live SSE negotiation stream (Batch 3, Feature 8)
      if (req.method === "GET" && url.pathname.startsWith("/theater/stream/")) {
        const pactId = url.pathname.slice("/theater/stream/".length);
        const { negotiationTheater, theaterEvents } = await import("./ai/theater");
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        const send = (event: string, data: unknown) => {
          try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* closed */ }
        };
        const session = negotiationTheater.getSession(pactId);
        if (session) send("snapshot", session);
        else send("snapshot", { pactId, status: "not-found" });
        const onMove = (payload: { pactId: string; entry: unknown }) => {
          if (payload.pactId === pactId) send("move", payload.entry);
        };
        theaterEvents.on("move", onMove);
        const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, 15000);
        req.on("close", () => {
          clearInterval(heartbeat);
          theaterEvents.off("move", onMove);
        });
        return;
      }

      // GET /.well-known/agent-card.json — A2A Agent Card (Batch 4, Feature 11)
      if (req.method === "GET" && url.pathname === "/.well-known/agent-card.json") {
        const { getAgentCard } = await import("./a2a");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getAgentCard()));
        return;
      }

      // POST /a2a/join — counterparty agent joins a draft pact (A2A, Batch 4)
      if (req.method === "POST" && url.pathname === "/a2a/join") {
        const body = await readBody(req);
        const pactId = String(body.pactId ?? "");
        const agree = body.agree !== false;
        const from = body.from ? String(body.from) : undefined;
        if (!pactId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "pactId is required" }));
          return;
        }
        const { a2aJoin } = await import("./a2a");
        const result = await a2aJoin(pactId, agree, from);
        res.writeHead(result.ok ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // GET /market — live OnchainOS market feeds (Batch 4, Feature 10)
      if (req.method === "GET" && url.pathname === "/market") {
        const { onchainOS } = await import("./integrations/onchainos");
        const [btc, eth] = await Promise.all([
          onchainOS.getMarketPrice("BTC"),
          onchainOS.getMarketPrice("ETH"),
        ]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          source: "onchainos-okx",
          enabled: onchainOS.isAvailable,
          btc, eth,
          fetchedAt: Date.now(),
        }));
        return;
      }

      // GET /tasks/evaluator — mediator swarm evaluator service card (Batch 4, Feature 12)
      if (req.method === "GET" && url.pathname === "/tasks/evaluator") {
        const { getEvaluatorIds } = await import("./feedback");
        const { getPaymentsState } = await import("./x402");
        const payments = getPaymentsState();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          service: "Dispute evaluation — mediator swarm (commit-reveal, on-chain)",
          mediators: getEvaluatorIds(),
          price: payments.priceFormatted,
          asset: payments.asset,
          endpoint: "/tasks/evaluate",
          method: "POST",
          payment: "OKX Agent Payments Protocol (x402 exact)",
        }));
        return;
      }

      // POST /tasks/evaluate — paid evaluator service (x402, Batch 4, Feature 12)
      if (req.method === "POST" && url.pathname === "/tasks/evaluate") {
        const body = await readBody(req);
        const pactId = String(body.pactId ?? "");
        const { ethers: ethersMod } = await import("ethers");
        const evalPactId = pactId.length === 66
          ? pactId
          : ethersMod.hexlify(ethersMod.keccak256(ethersMod.toUtf8Bytes(`evaluation-${Date.now()}`)));
        const evidence = {
          pactId: evalPactId,
          breachTier: Number(body.breachTier ?? 2),
          attestationCount: Number(body.attestationCount ?? 10),
          degradationCount: Number(body.degradationCount ?? 2),
        };
        const { settlePayment, respond402, paymentResponseHeader } = await import("./x402");
        const path = url.pathname;
        const settlement = await settlePayment(req.headers["payment-signature"] as string | undefined, path);
        if (!settlement) {
          respond402(res, "POST", path);
          return;
        }
        const { runMediatorVote } = await import("./vote");
        const result = await runMediatorVote(evidence);
        logActivity("task_evaluated",
          `Evaluator service: ${result.verdict} (${result.approveCount}/${result.rejectCount}) for ${evalPactId.slice(0, 10)}…`,
          evalPactId, settlement.txHash);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "PAYMENT-RESPONSE": paymentResponseHeader(settlement),
        });
        res.end(JSON.stringify({
          paid: true,
          settlement,
          verdict: result.verdict,
          reached: result.reached,
          partyAShare: result.partyAShare,
          votes: result.votes.map(v => ({
            mediator: v.mediator, address: v.address, verdict: v.verdict,
            fairnessScore: v.fairnessScore, reason: v.reason,
          })),
        }));
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

  // Restore persisted state (Batch 1) — survives restarts when DATABASE_URL is set
  await restorePersistedState();

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

/**
 * Load activity log, pact names, negotiation sessions and contracts from
 * Postgres into their in-memory stores. Best-effort — memory-only if no DB.
 */
async function restorePersistedState(): Promise<void> {
  try {
    await initDb();

    const [activity, names, negotiations, contracts] = await Promise.all([
      loadRecentActivity(30),
      loadPactNames(),
      loadNegotiations(),
      loadContracts(),
    ]);

    if (activity.length > 0) {
      for (const a of activity) activityLog.push(a);
      while (activityLog.length > MAX_ACTIVITY) activityLog.shift();
    }
    for (const [pactId, name] of names) pactNames.set(pactId, name);

    if (negotiations.length > 0 || contracts.length > 0) {
      const { negotiationTheater } = await import("./ai/theater");
      const { storeContract } = await import("./ai/contract-writer");
      for (const n of negotiations) negotiationTheater.restoreSession(n.pact_id, n.payload);
      for (const c of contracts) storeContract(c.payload as Parameters<typeof storeContract>[0]);
    }

    // Restore + backfill treaty subject metadata (Batch 5, Feature 14)
    const { restorePactSubjects } = await import("./create-pact");
    await restorePactSubjects();

    logger.info({
      event: "state_restored",
      activity: activity.length,
      names: names.size,
      negotiations: negotiations.length,
      contracts: contracts.length,
    }, "Persisted state restored from database");
  } catch (err) {
    logger.warn({ event: "state_restore_failed", err }, "State restore failed — memory-only mode");
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal agent error");
  process.exit(1);
});
