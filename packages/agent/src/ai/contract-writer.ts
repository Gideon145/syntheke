/**
 * contract-writer.ts — Plain-English Contract Renderer (Phase 3a)
 *
 * Every on-chain treaty gets a human-readable legal-style contract,
 * written by Claude and stored alongside the state machine. Judges (and
 * humans) can read exactly what two AIs agreed to — in plain English.
 *
 * Regenerated on renegotiation so the prose always matches the on-chain terms.
 */

import { z } from "zod";
import { aiService, deepseekService } from "./service";
import { logger } from "../logger";

// ──── Schema ─────────────────────────────────────────────

const ContractSchema = z.object({
  title: z.string().min(1).max(120),
  preamble: z.string().min(1).max(600),
  sections: z.array(z.object({
    heading: z.string().min(1).max(80),
    body: z.string().min(1).max(500),
  })).min(2).max(8),
  summary: z.string().min(1).max(200),
});

export interface PactContract {
  pactId: string;
  title: string;
  preamble: string;
  sections: Array<{ heading: string; body: string }>;
  summary: string;
  version: number;
  generatedAt: number;
  model: string;
  commitmentHash: string;
}

// ──── In-memory store ────────────────────────────────────

const contracts = new Map<string, PactContract>();
const MAX_CONTRACTS = 100;

function prune(): void {
  while (contracts.size > MAX_CONTRACTS) {
    const oldest = Array.from(contracts.entries()).sort((a, b) => a[1].generatedAt - b[1].generatedAt)[0];
    if (oldest) contracts.delete(oldest[0]);
  }
}

export function getContract(pactId: string): PactContract | undefined {
  return contracts.get(pactId);
}

export function storeContract(contract: PactContract): void {
  contracts.set(contract.pactId, contract);
  prune();
  // Persist for restart survival (Batch 1)
  try {
    void import("../db").then(({ saveContract }) => saveContract(contract.pactId, contract));
  } catch { /* db unavailable */ }
  // Verifiable AI provenance — contract hash on-chain (Batch 3, Feature 7).
  // Skip if already recorded (restores re-store the same contract each boot).
  try {
    void import("../artifact").then(async ({ recordArtifact, verifyArtifactOnChain }) => {
      const { found } = await verifyArtifactOnChain(contract.pactId, contract.commitmentHash);
      if (!found) {
        recordArtifact(contract.pactId, `contract-v${contract.version}`, contract.commitmentHash, contract.model, contract.version);
      }
    });
  } catch { /* artifacts unavailable */ }
}

// ──── Terms formatting ───────────────────────────────────

function termsToProse(terms: Record<string, unknown>): string {
  const lines: string[] = [];
  const labels: Record<string, string> = {
    amount: "Escrow amount (wei)",
    settlementAsset: "Settlement asset",
    duration: "Duration (blocks)",
    collateralRatio: "Collateral ratio (bps)",
    liquidationThreshold: "Liquidation threshold (bps)",
    interestRate: "Interest rate (bps)",
    penaltyBps: "Breach penalty (bps)",
    breachGraceBlocks: "Breach grace period (blocks)",
    renegotiationWindow: "Renegotiation window (blocks)",
    maxRenegotiationRounds: "Max renegotiation rounds",
    monitoredConditions: "Monitored conditions (bitmap)",
  };
  for (const [k, v] of Object.entries(terms)) {
    lines.push(`  ${labels[k] ?? k}: ${v}`);
  }
  return lines.join("\n");
}

// ──── Writer ─────────────────────────────────────────────

export async function writeContract(input: {
  pactId: string;
  description: string;
  terms: Record<string, unknown>;
  partyADesc: string;
  partyBDesc: string;
  version?: number;
}): Promise<PactContract | null> {
  const systemPrompt = `You are the Syntheke Contract Scribe, an AI that renders on-chain economic treaties between AI agents as readable plain-English contracts.

Rules:
- Write in formal but accessible legal prose ("Party A shall...")
- Refer to parties as "Party A (${input.partyADesc})" and "Party B (${input.partyBDesc})"
- Convert numeric values into human terms (e.g. penaltyBps 2500 → "25% of escrow")
- Include a preamble, then 3-6 sections: Obligations, Escrow & Consideration, Monitoring & Breach, Remedies & Penalties, Termination
- Output ONLY valid JSON matching the schema.`;

  const userPrompt = `Write the contract for this treaty:

DESCRIPTION: "${input.description}"

ON-CHAIN TERMS:
${termsToProse(input.terms)}

JSON schema: {"title":"...","preamble":"...","summary":"one sentence","sections":[{"heading":"...","body":"..."}]}`;

  const { computeCommitment } = await import("./service");
  const request = {
    systemPrompt,
    userPrompt,
    responseSchema: ContractSchema,
    temperature: 0.4,
    maxTokens: 900,
    timeoutMs: 25_000,
  };

  // Cost-split: DeepSeek first (Claude Haiku often truncates long contracts),
  // Claude as fallback. Dual-model attribution is preserved either way.
  let result = await deepseekService.query<z.infer<typeof ContractSchema>>(request);
  let model = "deepseek";
  if (!result && aiService.isAvailable) {
    result = await aiService.query<z.infer<typeof ContractSchema>>(request);
    model = "claude";
  }

  if (!result) {
    logger.warn({ event: "contract_write_failed", pactId: input.pactId.slice(0, 10) }, "Both models failed to write contract");
    return null;
  }

  const contract: PactContract = {
    pactId: input.pactId,
    title: result.data.title,
    preamble: result.data.preamble,
    sections: result.data.sections,
    summary: result.data.summary,
    version: input.version ?? 1,
    generatedAt: Date.now(),
    model,
    commitmentHash: computeCommitment(userPrompt, JSON.stringify(result.data)),
  };

  storeContract(contract);
  logger.info({ event: "contract_written", pactId: input.pactId.slice(0, 10), model, sections: contract.sections.length }, `Contract written by ${model} (${contract.sections.length} sections)`);
  return contract;
}
