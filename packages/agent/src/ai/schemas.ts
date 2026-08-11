import { z } from "zod";

/**
 * AI Output Schemas — Strict validation for all AI-generated outputs.
 * Every AI response must conform to a Zod schema before touching the chain.
 * Schema validation failures → fallback to heuristic or rejection.
 */

// ──── Pact Terms ─────────────────────────────────────────

export const PactTermsSchema = z.object({
  amount: z.string().describe("Escrow amount in wei (as string for bigint)"),
  duration: z.number().int().positive().describe("Duration in blocks"),
  collateralRatio: z.number().int().min(10000).max(50000).describe("Basis points, e.g. 15000 = 150%"),
  liquidationThreshold: z.number().int().min(5000).max(50000).describe("Basis points"),
  interestRate: z.number().int().min(0).max(5000).describe("Basis points, e.g. 800 = 8%"),
  penaltyBps: z.number().int().min(0).max(5000).describe("Breach penalty in basis points"),
  breachGraceBlocks: z.number().int().min(0).max(100000).describe("Grace period in blocks"),
  renegotiationWindow: z.number().int().min(0).max(100000).describe("Renegotiation window in blocks"),
  maxRenegotiationRounds: z.number().int().min(1).max(10),
  monitoredConditions: z.number().int().min(0).max(0xFFFF).describe("Condition bitmap"),
});

// ──── Negotiation Output ──────────────────────────────────

export const NegotiationOutputSchema = z.object({
  action: z.enum(["propose", "counter", "accept", "reject"]),
  terms: PactTermsSchema.optional(),
  reasoning: z.string().max(500),
  fairnessScore: z.number().int().min(0).max(100).optional(),
  confidence: z.number().min(0).max(1).describe("AI confidence in this output"),
  risks: z.array(z.string().max(200)).max(5).optional(),
  suggestedAmendments: z.array(z.object({
    parameter: z.enum(["amount", "duration", "collateralRatio", "interestRate", "penaltyBps"]),
    current: z.string(),
    proposed: z.string(),
    rationale: z.string().max(200),
  })).max(5).optional(),
});

export type NegotiationOutput = z.infer<typeof NegotiationOutputSchema>;

// ──── Mediation Output ────────────────────────────────────

export const MediationVerdictSchema = z.object({
  verdict: z.enum(["approve", "reject", "abstain"]),
  fairnessScore: z.number().int().min(0).max(100),
  settlementAmount: z.string().describe("Recommended settlement in wei"),
  partyAPayout: z.string().describe("Payout to Party A in wei"),
  partyBPayout: z.string().describe("Payout to Party B in wei"),
  reasoning: z.string().max(1000).describe("Detailed reasoning behind verdict"),
  keyEvidence: z.array(z.string().max(200)).max(5),
  confidence: z.number().min(0).max(1),
  precedentReference: z.string().max(200).optional(),
});

export type MediationVerdict = z.infer<typeof MediationVerdictSchema>;

// ──── Anomaly Detection Output ─────────────────────────────

export const AnomalyOutputSchema = z.object({
  anomalyDetected: z.boolean(),
  anomalyType: z.enum(["none", "price_spike", "volume_surge", "counterparty_inactive", "liquidity_drop", "pattern_break", "other"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  affectedConditions: z.array(z.number().int().min(0).max(255)).max(10).optional(),
  explanation: z.string().max(500).optional(),
  recommendedAction: z.enum(["continue", "increase_frequency", "flag_for_review", "escalate"]).optional(),
  confidence: z.number().min(0).max(1),
});

// ──── Risk Assessment Output ──────────────────────────────

export const RiskAssessmentSchema = z.object({
  overallRisk: z.enum(["low", "medium", "high", "critical"]),
  counterpartyScore: z.number().int().min(0).max(100),
  marketRiskScore: z.number().int().min(0).max(100),
  termFairnessScore: z.number().int().min(0).max(100),
  recommendedCollateralRatio: z.number().int().min(10000).max(50000).optional(),
  warnings: z.array(z.string().max(300)).max(5),
  confidence: z.number().min(0).max(1),
});
