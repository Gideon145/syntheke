/**
 * a2a.ts — A2A interoperability (Batch 4, Feature 11)
 *
 * Syntheke speaks the Agent-to-Agent protocol: an A2A Agent Card advertises
 * its skills to the OKX.AI marketplace, and a minimal A2A message endpoint
 * lets counterparty agents join drafts directly — no web form, just agents
 * talking to agents.
 */

import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import { getEvaluatorIds } from "./feedback";

export const AGENT_CARD_VERSION = "0.7.0";

/** A2A Agent Card (spec-compatible shape for the OKX.AI marketplace). */
export function getAgentCard(): Record<string, unknown> {
  const publicUrl = config.AGENT_PUBLIC_URL || `http://localhost:${config.PORT}`;
  return {
    name: "Syntheke",
    description:
      "Autonomous economic treaties between AI agents on X Layer — natural-language pact creation, live AI negotiation, 24/7 on-chain monitoring, and a staked AI mediator swarm for disputes.",
    url: publicUrl,
    version: AGENT_CARD_VERSION,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "pact-creation",
        name: "Pact creation",
        description: "Form a binding on-chain treaty from a natural-language description. Two AI parties negotiate the terms live before anything is written to X Layer.",
        tags: ["treaty", "escrow", "x-layer"],
        examples: [
          "Create a pact where my agent pays 10 OKB weekly for liquidation monitoring with a 25% breach penalty",
        ],
      },
      {
        id: "pact-join",
        name: "Pact join",
        description: "Join an existing draft pact as the counterparty. POST the pact id to /a2a/join.",
        tags: ["treaty", "counterparty"],
        examples: ["Join pact 0x… and accept the proposed terms"],
      },
      {
        id: "mediation",
        name: "AI mediation",
        description: "The staked mediator swarm (Themis · Athena · Solon) resolves breaches with on-chain commit-reveal votes and escrow settlement.",
        tags: ["dispute", "arbitration"],
        examples: ["Mediate a breached pact and split escrow fairly"],
      },
      {
        id: "monitoring",
        name: "Autonomous monitoring",
        description: "Every pact is monitored on-chain every 15 seconds — attestations, degradation tracking, and automatic escalation.",
        tags: ["oracle", "attestation"],
      },
      {
        id: "evaluation",
        name: "Dispute evaluation service",
        description: "Hire the mediator swarm as an evaluator: POST /tasks/evaluate (paid via the OKX Agent Payments Protocol).",
        tags: ["evaluator", "x402"],
        examples: ["Evaluate this dispute and return a binding verdict"],
      },
    ],
    evaluators: getEvaluatorIds(),
    security: {
      x402: true,
      commitRevealVotes: true,
      onChainArtifacts: true,
    },
  };
}

export interface A2AJoinResult {
  ok: boolean;
  pactId: string;
  state?: string;
  error?: string;
}

/**
 * A2A-style join: a counterparty agent asks to join a draft pact. In demo
 * mode the Syntheke agent signs for the counterparty wallet; the on-chain
 * join transaction is real.
 */
export async function a2aJoin(pactId: string, agree: boolean, from?: string): Promise<A2AJoinResult> {
  if (!agree) {
    logActivity("a2a_join_declined", `Counterparty agent ${from ?? "unknown"} declined the pact`, pactId);
    return { ok: false, pactId, state: "DECLINED" };
  }
  try {
    const { joinExistingPact } = await import("./create-pact");
    const result = await joinExistingPact(pactId);
    logActivity("a2a_join", `Counterparty agent ${from ?? "unknown"} joined via A2A — ${result.state ?? result.error}`, pactId);
    logger.info({ event: "a2a_join", pactId: pactId.slice(0, 10), from: from ?? "unknown", ok: result.success },
      `A2A join: ${result.success ? "accepted" : "failed"}`);
    return { ok: result.success, pactId, state: result.state, error: result.error };
  } catch (err) {
    return { ok: false, pactId, error: err instanceof Error ? err.message : String(err) };
  }
}
