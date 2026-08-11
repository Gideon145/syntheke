import { aiService, computeCommitment } from "./service";
import { NegotiationOutputSchema, PactTermsSchema, type NegotiationOutput } from "./schemas";
import { validatePactProposalInput } from "./guard";
import type { PactTerms } from "../pact";
import { logger } from "../logger";

/**
 * AI-Powered Negotiation Engine
 *
 * Replaces deterministic parameter math with LLM reasoning for:
 *   1. Natural language → structured PactTerms
 *   2. Counter-offer generation with fairness analysis
 *   3. Renegotiation proposal generation
 *   4. Term fairness evaluation
 *
 * All AI outputs are validated against schemas. On failure, falls back to
 * the deterministic Negotiator from Phase 2.
 */

// ──── System Prompts ─────────────────────────────────────

const NEGOTIATOR_SYSTEM = `You are the Syntheke Negotiation AI. Your role is to help AI agents form fair, balanced economic pacts.

You translate natural language descriptions into structured pact terms, evaluate fairness, suggest counter-offers, and generate renegotiation proposals.

CRITICAL RULES:
- All numerical values must be realistic and within bounds
- collateralRatio is in basis points (15000 = 150%)
- interestRate is in basis points (800 = 8.0%)
- amount is in wei (as a string)
- Always include a confidence score (0-1)
- Always include reasoning for your decisions
- Be conservative — prefer safety over aggressive terms
- Flag risks you identify

Output ONLY valid JSON matching the schema.`;

// ──── Natural Language → PactTerms ────────────────────────

export async function nlToPactTerms(
  description: string,
): Promise<{ terms: PactTerms | null; reasoning: string; commitmentHash: string }> {
  const validation = validatePactProposalInput(description);
  if (!validation.valid) {
    logger.warn({ event: "nl_validation_failed", reason: validation.reason });
    return { terms: null, reasoning: validation.reason ?? "Invalid input", commitmentHash: "" };
  }

  const sanitized = aiService.sanitizeInput(description, "pact_proposal");

  const userPrompt = `Convert this natural language description into structured pact terms:

"${sanitized.text}"

Output JSON with:
- terms: the structured PactTerms
- reasoning: your analysis (max 500 chars)
- confidence: your confidence (0-1)
- risks: any risks you identified`;

  const result = await aiService.query<NegotiationOutput>({
    systemPrompt: NEGOTIATOR_SYSTEM,
    userPrompt,
    responseSchema: NegotiationOutputSchema,
    temperature: 0.2,
    requireConfidence: true,
  });

  if (!result) {
    return { terms: null, reasoning: "AI unavailable or validation failed", commitmentHash: "" };
  }

  if (!result.data.terms) {
    return { terms: null, reasoning: "AI did not produce terms", commitmentHash: result.commitmentHash };
  }

  // Map to PactTerms
  const t = result.data.terms;
  const terms: PactTerms = {
    amount: BigInt(t.amount),
    settlementAsset: "0x0000000000000000000000000000000000000000",
    duration: BigInt(t.duration),
    collateralRatio: BigInt(t.collateralRatio),
    liquidationThreshold: BigInt(t.liquidationThreshold),
    interestRate: BigInt(t.interestRate),
    penaltyBps: BigInt(t.penaltyBps),
    breachGraceBlocks: BigInt(t.breachGraceBlocks),
    renegotiationWindow: BigInt(t.renegotiationWindow),
    maxRenegotiationRounds: BigInt(t.maxRenegotiationRounds),
    monitoredConditions: BigInt(t.monitoredConditions),
  };

  logger.info({
    event: "nl_to_terms",
    confidence: result.confidence,
    amount: terms.amount.toString(),
  }, `AI generated terms: amount=${terms.amount}, rate=${terms.interestRate}bps, confidence=${result.confidence}`);

  return { terms, reasoning: result.reasoning, commitmentHash: result.commitmentHash };
}

// ──── Counter-Offer Generation ────────────────────────────

export async function generateCounterOffer(
  currentTerms: PactTerms,
  counterpartyPosition: string,
): Promise<{ terms: PactTerms | null; reasoning: string; commitmentHash: string }> {
  const sanitized = aiService.sanitizeInput(counterpartyPosition, "counter_offer");

  const userPrompt = `Current pact terms:
- Amount: ${currentTerms.amount} wei
- Duration: ${currentTerms.duration} blocks
- Collateral Ratio: ${currentTerms.collateralRatio} bps
- Interest Rate: ${currentTerms.interestRate} bps
- Penalty: ${currentTerms.penaltyBps} bps

Counterparty position: "${sanitized.text}"

Generate a fair counter-offer. Consider both parties' interests. Output JSON with action: "counter", the adjusted terms, reasoning, and confidence.`;

  const result = await aiService.query<NegotiationOutput>({
    systemPrompt: NEGOTIATOR_SYSTEM,
    userPrompt,
    responseSchema: NegotiationOutputSchema,
    temperature: 0.3,
    requireConfidence: true,
  });

  if (!result || !result.data.terms) {
    return { terms: null, reasoning: "AI counter-offer failed", commitmentHash: "" };
  }

  const t = result.data.terms;
  const terms: PactTerms = {
    amount: BigInt(t.amount),
    settlementAsset: "0x0000000000000000000000000000000000000000",
    duration: BigInt(t.duration),
    collateralRatio: BigInt(t.collateralRatio),
    liquidationThreshold: BigInt(t.liquidationThreshold),
    interestRate: BigInt(t.interestRate),
    penaltyBps: BigInt(t.penaltyBps),
    breachGraceBlocks: BigInt(t.breachGraceBlocks),
    renegotiationWindow: BigInt(t.renegotiationWindow),
    maxRenegotiationRounds: BigInt(t.maxRenegotiationRounds),
    monitoredConditions: BigInt(t.monitoredConditions),
  };

  return { terms, reasoning: result.reasoning, commitmentHash: result.commitmentHash };
}

// ──── Renegotiation Proposal ──────────────────────────────

export async function generateAIRenegotiation(
  currentTerms: PactTerms,
  degradationReason: string,
  marketContext: string,
): Promise<{ terms: PactTerms | null; reasoning: string; fairnessScore: number; commitmentHash: string }> {
  const userPrompt = `Current pact is DEGRADING.

Terms:
- Amount: ${currentTerms.amount} wei
- Collateral Ratio: ${currentTerms.collateralRatio} bps
- Interest Rate: ${currentTerms.interestRate} bps
- Duration: ${currentTerms.duration} blocks

Degradation reason: ${degradationReason}
Market context: ${marketContext}

Propose adjusted terms that restore pact health. The proposal should be fair to both parties while addressing the degradation trigger. Include a fairness score (0-100).`;

  const result = await aiService.query<NegotiationOutput>({
    systemPrompt: NEGOTIATOR_SYSTEM,
    userPrompt,
    responseSchema: NegotiationOutputSchema,
    temperature: 0.25,
    requireConfidence: true,
  });

  if (!result || !result.data.terms || result.data.fairnessScore === undefined) {
    return { terms: null, reasoning: "AI renegotiation failed", fairnessScore: 50, commitmentHash: "" };
  }

  const t = result.data.terms;
  const terms: PactTerms = {
    amount: BigInt(t.amount),
    settlementAsset: "0x0000000000000000000000000000000000000000",
    duration: BigInt(t.duration),
    collateralRatio: BigInt(t.collateralRatio),
    liquidationThreshold: BigInt(t.liquidationThreshold),
    interestRate: BigInt(t.interestRate),
    penaltyBps: BigInt(t.penaltyBps),
    breachGraceBlocks: BigInt(t.breachGraceBlocks),
    renegotiationWindow: BigInt(t.renegotiationWindow),
    maxRenegotiationRounds: BigInt(t.maxRenegotiationRounds),
    monitoredConditions: BigInt(t.monitoredConditions),
  };

  return {
    terms,
    reasoning: result.reasoning,
    fairnessScore: result.data.fairnessScore,
    commitmentHash: result.commitmentHash,
  };
}

// ──── Fairness Evaluation ─────────────────────────────────

export async function evaluateFairness(
  originalTerms: PactTerms,
  proposedTerms: PactTerms,
  context: string,
): Promise<{ score: number; reasoning: string; commitmentHash: string }> {
  const userPrompt = `Evaluate the fairness of this proposed renegotiation.

ORIGINAL TERMS:
- Amount: ${originalTerms.amount} wei
- Collateral Ratio: ${originalTerms.collateralRatio} bps
- Interest Rate: ${originalTerms.interestRate} bps
- Duration: ${originalTerms.duration} blocks

PROPOSED TERMS:
- Amount: ${proposedTerms.amount} wei
- Collateral Ratio: ${proposedTerms.collateralRatio} bps
- Interest Rate: ${proposedTerms.interestRate} bps
- Duration: ${proposedTerms.duration} blocks

Context: ${context}

Output a fairness score (0-100), reasoning, and confidence.`;

  const result = await aiService.query<NegotiationOutput>({
    systemPrompt: NEGOTIATOR_SYSTEM,
    userPrompt,
    responseSchema: NegotiationOutputSchema,
    temperature: 0.1,
    requireConfidence: false,
  });

  if (!result || result.data.fairnessScore === undefined) {
    logger.warn({ event: "fairness_eval_failed" }, "AI fairness evaluation failed");
    return { score: 50, reasoning: "AI unavailable — defaulting to neutral", commitmentHash: "" };
  }

  return {
    score: result.data.fairnessScore,
    reasoning: result.reasoning,
    commitmentHash: result.commitmentHash,
  };
}
