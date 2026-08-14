/**
 * feedback.ts — ERC-8004 feedback dual-write (Batch 2, Feature 6)
 *
 * Syntheke already writes reputation on-chain (ReputationRegistry). The gap:
 * the OKX AI agent marketplace has its own rating system, and Syntheke's
 * verdicts are invisible there. This module closes it:
 *
 *   1. When an arbitration settles, the monitor queues an OKX-style star
 *      review for each pact party (score derived from the on-chain verdict).
 *   2. The bridge runner (`scripts/feedback_sync.ts`) picks up pending
 *      reviews and submits them through the OKX marketplace API
 *      (`onchainos agent feedback-submit`) using the mediator's registered
 *      evaluator identity (Themis #10920 / Athena #10921 / Solon #10922).
 *   3. Submission is idempotent and acked back, so reputation lands in BOTH
 *      registries — Syntheke's ReputationRegistry AND the OKX marketplace.
 *
 * OKX reviews require a related task id, so full submission activates when
 * pacts are joined via the A2A marketplace (Batch 4). Until then, reviews
 * stay queued and visible on the dashboard.
 */

import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import { saveFeedback } from "./db";

/** In-memory mirror of the queue — keeps the API working without Postgres. */
interface QueuedFeedback {
  id: number;
  pactId: string;
  party: string;
  okxAgentId: string | null;
  creatorAgentId: string;
  score: number;
  description: string | null;
  taskId: string | null;
  createdAt: number;
}
const memoryQueue: QueuedFeedback[] = [];
let memoryNextId = 1;

export function getQueuedFeedback(): QueuedFeedback[] {
  return memoryQueue;
}

export function ackQueuedFeedback(ids: number[]): void {
  for (const id of ids) {
    const i = memoryQueue.findIndex(q => q.id === id);
    if (i >= 0) memoryQueue.splice(i, 1);
  }
}

/** Mediator evaluator identities registered on the OKX marketplace (Aug 14). */
const OKX_EVALUATOR_IDS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const part of config.OKX_AGENT_IDS.split(",")) {
    const [name, id] = part.split(":");
    if (name && id) map[name.trim()] = id.trim();
  }
  return map;
})();

/**
 * Queue OKX feedback for a closed pact. Star scores mirror the on-chain
 * verdict: the party favored by arbitration gets a high score, the party
 * found in breach gets a low one.
 */
export async function queuePactFeedback(
  pactId: string,
  result: {
    verdict: "approve" | "reject" | "deadlocked";
    partyA: string;
    partyB: string;
    partyAShare: number;
    okxAgentA?: string;
    okxAgentB?: string;
    taskId?: string;
  },
): Promise<void> {
  const { partyA, partyB, partyAShare } = result;

  // approve → party A wins (A: 4.5, B: 2.0) · reject → party B wins (A: 2.0, B: 4.5)
  const scoreA = result.verdict === "approve" ? 4.5 : result.verdict === "reject" ? 2.0 : 3.0;
  const scoreB = 5.0 - scoreA;

  // Review creator = the mediator who matches the consensus (Themis by default)
  const creatorAgentId = OKX_EVALUATOR_IDS.Themis ?? "";
  if (!creatorAgentId) {
    logger.warn({ event: "feedback_no_evaluator_id" }, "No OKX evaluator id configured — feedback not queued");
    return;
  }

  const entries = [
    {
      pactId, party: partyA, okxAgentId: result.okxAgentA,
      creatorAgentId, score: scoreA,
      description: `Syntheke arbitration: ${result.verdict.toUpperCase()} — party share ${partyAShare}%.`,
      taskId: result.taskId,
    },
    {
      pactId, party: partyB, okxAgentId: result.okxAgentB,
      creatorAgentId, score: scoreB,
      description: `Syntheke arbitration: ${result.verdict.toUpperCase()} — party share ${100 - partyAShare}%.`,
      taskId: result.taskId,
    },
  ];

  for (const e of entries) {
    saveFeedback(e);
    memoryQueue.push({
      id: memoryNextId++,
      pactId: e.pactId,
      party: e.party,
      okxAgentId: e.okxAgentId ?? null,
      creatorAgentId: e.creatorAgentId,
      score: e.score,
      description: e.description,
      taskId: e.taskId ?? null,
      createdAt: Date.now(),
    });
    logActivity(
      "feedback_queued",
      `⭐ OKX feedback queued for ${e.okxAgentId ? `agent #${e.okxAgentId}` : "counterparty"} — ${e.score}/5`,
      pactId,
    );
  }
  logger.info({ event: "feedback_queued", pactId: pactId.slice(0, 10), verdict: result.verdict },
    `Queued ${entries.length} OKX feedback entries (dual-write with ReputationRegistry)`);
}

/** Evaluator identity map for the dashboard. */
export function getEvaluatorIds(): Array<{ name: string; agentId: string }> {
  return Object.entries(OKX_EVALUATOR_IDS).map(([name, agentId]) => ({ name, agentId }));
}
