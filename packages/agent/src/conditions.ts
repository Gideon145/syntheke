import { createHash } from "node:crypto";
import type { PactData } from "./pact";

/**
 * Condition Evaluation Engine
 *
 * Evaluates pact health across up to 256 conditions encoded as a uint256 bitmap.
 * Each bit position corresponds to a specific condition. 0 = failed, 1 = healthy.
 *
 * The engine produces:
 *   - conditionBitmap: uint256 where each bit = health of one condition
 *   - evaluatedState: recommended Syntheke state transition
 *   - reason: human-readable summary
 *   - dataHash: Blake3-style hash of all source data (SHA-256 for V1)
 */

// ──── Condition Bit Positions ────────────────────────────

export enum ConditionBit {
  AGENT_IDENTITY_A   = 0,   // Party A's ERC-8004 identity is active
  AGENT_IDENTITY_B   = 1,   // Party B's ERC-8004 identity is active
  ESCROW_HEALTHY     = 2,   // Escrow balance meets requirements
  COLLATERAL_RATIO   = 3,   // Collateral ratio above liquidation threshold
  COLLATERAL_SOFT    = 4,   // Collateral ratio above soft warning threshold
  PAYMENT_CURRENT    = 5,   // Scheduled payments are on time
  YIELD_ON_TARGET    = 6,   // Yield/deployed capital meeting target
  COUNTERPARTY_HEALTH = 7,  // Counterparty agent responding to heartbeats
  ORACLE_STABLE      = 8,   // Price oracle data is fresh and stable
  LIQUIDITY_ADEQUATE = 9,   // Settlement asset has sufficient liquidity
  MILESTONES_TRACK   = 10,  // Milestone obligations are on schedule
  DEX_PRICE_TARGET   = 11,  // DEX subject: reference price feed live (Batch 5)
  DEX_LIQUIDITY_TARGET = 12, // DEX subject: pool/trading liquidity healthy (Batch 5)
  // Bits 13-255 reserved for pact-specific custom conditions
}

export const CONDITION_LABELS: Record<number, string> = {
  [ConditionBit.AGENT_IDENTITY_A]:   "Party A identity",
  [ConditionBit.AGENT_IDENTITY_B]:   "Party B identity",
  [ConditionBit.ESCROW_HEALTHY]:     "Escrow health",
  [ConditionBit.COLLATERAL_RATIO]:   "Collateral ratio (hard)",
  [ConditionBit.COLLATERAL_SOFT]:    "Collateral ratio (soft)",
  [ConditionBit.PAYMENT_CURRENT]:    "Payment status",
  [ConditionBit.YIELD_ON_TARGET]:    "Yield target",
  [ConditionBit.COUNTERPARTY_HEALTH]: "Counterparty health",
  [ConditionBit.ORACLE_STABLE]:      "Oracle stability",
  [ConditionBit.LIQUIDITY_ADEQUATE]: "Liquidity",
  [ConditionBit.MILESTONES_TRACK]:   "Milestones",
  [ConditionBit.DEX_PRICE_TARGET]:   "DEX price feed",
  [ConditionBit.DEX_LIQUIDITY_TARGET]: "DEX liquidity",
};

// ──── Condition Result Types ──────────────────────────────

export interface ConditionResult {
  bit: ConditionBit;
  healthy: boolean;
  detail: string;
  sourceData: unknown;
}

export interface EvaluationResult {
  pactId: string;
  blockNumber: number;
  timestamp: number;
  conditionBitmap: bigint;
  conditions: ConditionResult[];
  recommendedState: number;
  breachTier: number | null;
  reason: string;
  dataHash: string;
}

// ──── State Assessment ───────────────────────────────────

export enum RecommendedState {
  ACTIVE = 4,
  DEGRADING = 5,
  BREACHED = 7,
}

export function assessState(
  conditions: ConditionResult[],
  consecutiveDegradation: number,
  degradationThreshold: number,
): { recommendedState: RecommendedState; breachTier: number | null; reason: string } {
  const failed = conditions.filter(c => !c.healthy);
  const criticalFailed = failed.filter(c =>
    c.bit === ConditionBit.AGENT_IDENTITY_A ||
    c.bit === ConditionBit.AGENT_IDENTITY_B ||
    c.bit === ConditionBit.ESCROW_HEALTHY,
  );
  const hardFailed = failed.filter(c =>
    c.bit === ConditionBit.COLLATERAL_RATIO ||
    c.bit === ConditionBit.PAYMENT_CURRENT,
  );
  const softFailed = failed.filter(c =>
    c.bit === ConditionBit.COLLATERAL_SOFT ||
    c.bit === ConditionBit.YIELD_ON_TARGET ||
    c.bit === ConditionBit.ORACLE_STABLE ||
    c.bit === ConditionBit.LIQUIDITY_ADEQUATE ||
    c.bit === ConditionBit.MILESTONES_TRACK ||
    c.bit === ConditionBit.COUNTERPARTY_HEALTH ||
    c.bit === ConditionBit.DEX_PRICE_TARGET ||
    c.bit === ConditionBit.DEX_LIQUIDITY_TARGET,
  );

  // Critical failures → immediate BREACH (FUNDAMENTAL or CATASTROPHIC)
  if (criticalFailed.length > 0) {
    const tier = criticalFailed.some(c =>
      c.bit === ConditionBit.AGENT_IDENTITY_A ||
      c.bit === ConditionBit.AGENT_IDENTITY_B,
    ) ? 4 : 3; // CATASTROPHIC if identity revoked, else FUNDAMENTAL
    return {
      recommendedState: RecommendedState.BREACHED,
      breachTier: tier,
      reason: `Critical failure: ${criticalFailed.map(c => CONDITION_LABELS[c.bit]).join(", ")}`,
    };
  }

  // Hard failures → BREACH (MINOR or MATERIAL)
  if (hardFailed.length > 0) {
    const tier = consecutiveDegradation >= degradationThreshold ? 2 : 1; // MATERIAL if escalating
    return {
      recommendedState: RecommendedState.BREACHED,
      breachTier: tier,
      reason: `Hard failure: ${hardFailed.map(c => CONDITION_LABELS[c.bit]).join(", ")}`,
    };
  }

  // Soft failures → DEGRADING or BREACH (if consecutive enough)
  if (softFailed.length > 0) {
    if (consecutiveDegradation >= degradationThreshold) {
      return {
        recommendedState: RecommendedState.BREACHED,
        breachTier: 1,
        reason: `Escalated degradation after ${consecutiveDegradation} cycles: ${softFailed.map(c => CONDITION_LABELS[c.bit]).join(", ")}`,
      };
    }
    return {
      recommendedState: RecommendedState.DEGRADING,
      breachTier: null,
      reason: `Soft degradation: ${softFailed.map(c => CONDITION_LABELS[c.bit]).join(", ")}`,
    };
  }

  // All clear
  return {
    recommendedState: RecommendedState.ACTIVE,
    breachTier: null,
    reason: "All conditions healthy",
  };
}

// ──── Bitmap Builder ─────────────────────────────────────

export function buildBitmap(conditions: ConditionResult[]): bigint {
  let bitmap = 0n;
  for (const c of conditions) {
    if (c.healthy) {
      bitmap |= (1n << BigInt(c.bit));
    }
  }
  return bitmap;
}

// ──── Data Hash ──────────────────────────────────────────

export function computeDataHash(conditions: ConditionResult[], blockNumber: number, timestamp: number): string {
  const payload = JSON.stringify({
    conditions: conditions.map(c => ({ bit: c.bit, healthy: c.healthy, detail: c.detail })),
    blockNumber,
    timestamp,
  });
  return "0x" + createHash("sha256").update(payload).digest("hex");
}
