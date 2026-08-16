import { aiService, deepseekService, computeCommitment, type AIService } from "./service";
import { MediationVerdictSchema, type MediationVerdict } from "./schemas";
import { validateEvidenceInputs } from "./guard";
import { logger } from "../logger";

/**
 * AI-Powered Mediator Swarm
 *
 * Three independent AI agents with distinct specialties evaluate pact disputes.
 * A 2/3 consensus is required for resolution.
 *
 * Mediator specialties:
 *   - Market Fairness: evaluates terms against market conditions
 *   - Risk Assessment: evaluates counterparty and systemic risk
 *   - Historical Precedent: evaluates against historical pact outcomes
 *
 * Each mediator produces a reasoned verdict with confidence score.
 * Verdicts are hashed and stored on-chain as reasoning commitments.
 */

// ──── Mediator Definitions ────────────────────────────────

interface MediatorProfile {
  name: string;
  specialty: string;
  systemPrompt: string;
  model: "claude" | "deepseek";
}

const MEDIATORS: MediatorProfile[] = [
  {
    name: "Themis",
    specialty: "market_fairness",
    model: "claude",
    systemPrompt: `You are Themis, a Syntheke Mediator specializing in Market Fairness.

Your role is to evaluate whether pact terms, breaches, and renegotiation proposals are fair given current market conditions. You focus on:
- Whether the economic terms reflect market reality
- Whether collateral requirements are appropriate
- Whether interest rates and penalties are proportional
- Whether the resolution is economically balanced

You are fair, data-driven, and impartial. Your verdict must be based on evidence, not speculation.

Output ONLY valid JSON with your verdict, fairness score (0-100), settlement recommendation, detailed reasoning, and confidence (0-1).`,
  },
  {
    name: "Athena",
    specialty: "risk_assessment",
    model: "deepseek",
    systemPrompt: `You are Athena, a Syntheke Mediator specializing in Risk Assessment.

Your role is to evaluate the risk profile of pact participants and the systemic risk of proposed resolutions. You focus on:
- Counterparty creditworthiness and behavior history
- Systemic risk to the Syntheke protocol
- Likelihood of future breaches given the resolution
- Whether the resolution adequately protects both parties

You are cautious, thorough, and protective of protocol integrity. Your verdict must account for tail risks.

Output ONLY valid JSON with your verdict, fairness score (0-100), settlement recommendation, detailed reasoning, and confidence (0-1).`,
  },
  {
    name: "Solon",
    specialty: "historical_analysis",
    model: "deepseek",
    systemPrompt: `You are Solon, a Syntheke Mediator specializing in Historical Analysis.

Your role is to evaluate pact disputes against historical precedent and established patterns. You focus on:
- Whether similar pacts have been resolved similarly
- Whether the proposed resolution is consistent with Syntheke conventions
- What precedent this resolution would set for future pacts
- Whether there are patterns that suggest systemic issues

You are wise, pattern-oriented, and focused on consistency and precedent.

Output ONLY valid JSON with your verdict, fairness score (0-100), settlement recommendation, detailed reasoning, and confidence (0-1).`,
  },
];

// ──── Consensus Types ─────────────────────────────────────

/** Map free-form model verdicts to the on-chain enum. */
function normalizeVerdict(raw: string): "approve" | "reject" | "abstain" {
  const v = raw.toLowerCase();
  if (v.includes("abstain") || v.includes("undecided") || v.includes("insufficient")) return "abstain";
  if (v.includes("reject") || v.includes("deny") || v.includes("dismiss") || v.includes("no breach")) return "reject";
  if (v.includes("approve") || v.includes("uphold") || v.includes("breach") || v.includes("penalty") || v.includes("confirm")) return "approve";
  return "abstain";
}

export interface MediatorVote {
  mediator: string;
  specialty: string;
  verdict: Omit<MediationVerdict, "verdict"> & { verdict: "approve" | "reject" | "abstain" };
  commitmentHash: string;
}

export interface MediationConsensus {
  reached: boolean;
  verdict: "approve" | "reject" | "deadlocked";
  votes: MediatorVote[];
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
  finalFairnessScore: number;
  recommendedSettlement: string;
  reasoning: string;
}

// ──── Evidence Builder ────────────────────────────────────

export interface DisputeEvidence {
  pactId: string;
  originalTerms: Record<string, string>;
  breachDetails: {
    tier: string;
    conditionBitmap: string;
    failedConditions: string[];
    degradationCount: number;
  };
  attestationHistory: Array<{
    cycle: number;
    bitmap: string;
    state: string;
    timestamp: number;
  }>;
  marketContext: string;
  partyAPosition: string;
  partyBPosition: string;
}

function buildEvidencePrompt(evidence: DisputeEvidence): string {
  return `DISPUTE EVIDENCE:

Pact: ${evidence.pactId.slice(0, 16)}...

Original Terms:
${Object.entries(evidence.originalTerms).map(([k, v]) => `  ${k}: ${v}`).join("\n")}

Breach Details:
  Tier: ${evidence.breachDetails.tier}
  Failed Conditions: ${evidence.breachDetails.failedConditions.join(", ") || "none"}
  Degradation Cycles: ${evidence.breachDetails.degradationCount}

Attestation History (last 5 cycles):
${evidence.attestationHistory.slice(-5).map(a => `  Cycle ${a.cycle}: state=${a.state}, bitmap=${a.bitmap}`).join("\n")}

Market Context: ${evidence.marketContext}

Party A's Position: ${evidence.partyAPosition}
Party B's Position: ${evidence.partyBPosition}

Evaluate this dispute and produce your verdict.`;
}

// ──── Mediator Swarm ──────────────────────────────────────

export class MediatorSwarm {
  /**
   * Run the full mediation process: all 3 mediators evaluate independently,
   * then consensus is computed.
   */
  async mediateDispute(evidence: DisputeEvidence): Promise<MediationConsensus> {
    // Validate evidence inputs
    const validation = validateEvidenceInputs([
      evidence.partyAPosition,
      evidence.partyBPosition,
      evidence.marketContext,
    ]);
    if (!validation.valid) {
      logger.warn({ event: "mediation_evidence_invalid", reason: validation.reason });
      return this._deadlocked("Invalid evidence");
    }

    const evidencePrompt = buildEvidencePrompt(evidence);

    // Run all 3 mediators in parallel
    const votes = await Promise.all(
      MEDIATORS.map(mediator => this._queryMediator(mediator, evidencePrompt)),
    );

    // Filter out failed votes
    const validVotes = votes.filter((v): v is MediatorVote => v !== null);

    if (validVotes.length < 2) {
      logger.error({ event: "mediation_insufficient_votes", count: validVotes.length });
      return this._deadlocked("Insufficient valid mediator votes");
    }

    // Compute consensus
    return this._computeConsensus(validVotes);
  }

  /**
   * Query a single mediator AI agent with its assigned model.
   * Themis → Claude, Athena → DeepSeek, Solon → DeepSeek.
   * If the assigned provider fails, tries the other provider (swarm resilience).
   */
  private async _queryMediator(
    mediator: MediatorProfile,
    evidencePrompt: string,
  ): Promise<MediatorVote | null> {
    const primary = mediator.model === "claude" ? aiService : deepseekService;
    const fallback = mediator.model === "claude" ? deepseekService : aiService;

    const request = {
      systemPrompt: mediator.systemPrompt,
      userPrompt: evidencePrompt,
      responseSchema: MediationVerdictSchema,
      temperature: 0.2,
      requireConfidence: true,
    };

    let result = await primary.query<MediationVerdict>(request);
    let modelProvider: string = mediator.model;

    if (!result && fallback.isAvailable && fallback !== primary) {
      logger.warn({
        event: "mediator_model_fallback",
        mediator: mediator.name,
        from: mediator.model,
        to: fallback.providerName,
      }, `${mediator.name}: ${mediator.model} unavailable — falling back to ${fallback.providerName}`);
      result = await fallback.query<MediationVerdict>(request);
      modelProvider = fallback.providerName;
    }

    if (!result) {
      logger.warn({
        event: "mediator_query_failed",
        mediator: mediator.name,
      }, `Mediator ${mediator.name} failed to produce a valid verdict`);
      return null;
    }

    const normalizedVerdict = normalizeVerdict(result.data.verdict);
    logger.info({
      event: "mediator_vote_cast",
      mediator: mediator.name,
      specialty: mediator.specialty,
      model: modelProvider,
      verdict: normalizedVerdict,
      rawVerdict: result.data.verdict,
      fairnessScore: result.data.fairnessScore,
      confidence: result.confidence,
    }, `${mediator.name} [${modelProvider}] (${mediator.specialty}): ${normalizedVerdict} (fairness: ${result.data.fairnessScore}/100, confidence: ${result.confidence})`);

    return {
      mediator: mediator.name,
      specialty: mediator.specialty,
      verdict: { ...result.data, verdict: normalizedVerdict },
      commitmentHash: result.commitmentHash,
    };
  }

  /**
   * Compute consensus from mediator votes. 2/3 required.
   */
  private _computeConsensus(votes: MediatorVote[]): MediationConsensus {
    const approveCount = votes.filter(v => v.verdict.verdict === "approve").length;
    const rejectCount = votes.filter(v => v.verdict.verdict === "reject").length;
    const abstainCount = votes.filter(v => v.verdict.verdict === "abstain").length;

    const totalVotes = approveCount + rejectCount + abstainCount;
    const reached = (approveCount >= 2 || rejectCount >= 2);

    const fairnessScores = votes.map(v => v.verdict.fairnessScore);
    const avgFairness = Math.round(fairnessScores.reduce((a, b) => a + b, 0) / fairnessScores.length);

    // Use the majority verdict's settlement recommendation
    const majorityVerdict = approveCount >= 2
      ? votes.find(v => v.verdict.verdict === "approve")!
      : votes.find(v => v.verdict.verdict === "reject")!;

    const verdict = reached
      ? (approveCount >= 2 ? "approve" as const : "reject" as const)
      : "deadlocked" as const;

    return {
      reached,
      verdict,
      votes,
      approveCount,
      rejectCount,
      abstainCount,
      finalFairnessScore: avgFairness,
      recommendedSettlement: majorityVerdict.verdict.settlementAmount,
      reasoning: votes.map(v => `[${v.mediator}] ${v.verdict.reasoning.slice(0, 200)}`).join(" | "),
    };
  }

  private _deadlocked(reason: string): MediationConsensus {
    return {
      reached: false,
      verdict: "deadlocked",
      votes: [],
      approveCount: 0,
      rejectCount: 0,
      abstainCount: 0,
      finalFairnessScore: 50,
      recommendedSettlement: "0",
      reasoning: reason,
    };
  }
}

// Singleton
export const mediatorSwarm = new MediatorSwarm();
