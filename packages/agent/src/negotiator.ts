import { ethers } from "ethers";
import type { PactTerms } from "./pact";

/**
 * Structured Negotiation Engine
 *
 * Enables two agents to negotiate pact terms through structured parameter exchange.
 * V1: deterministic parameter passing with round limits.
 * Phase 3 will add AI-assisted negotiation via LLM.
 */

// ──── Types ──────────────────────────────────────────────

export interface NegotiationSession {
  pactId: string;
  partyA: string;
  partyB: string;
  terms: PactTerms | null;
  round: number;
  maxRounds: number;
  status: "active" | "accepted" | "rejected" | "deadlocked";
  offers: Array<{ proposer: string; terms: PactTerms; timestamp: number }>;
  expiresAt: number;
}

export interface CounterOfferParams {
  amount?: bigint;
  interestRate?: bigint;
  collateralRatio?: bigint;
  duration?: bigint;
  penaltyBps?: bigint;
}

// ──── In-Memory Session Store ────────────────────────────

const sessions = new Map<string, NegotiationSession>();

// ──── Engine ─────────────────────────────────────────────

export class NegotiationEngine {
  /**
   * Start a new negotiation session for a pact.
   */
  startSession(
    pactId: string,
    partyA: string,
    partyB: string,
    initialTerms: PactTerms,
    maxRounds = 3,
  ): NegotiationSession {
    const session: NegotiationSession = {
      pactId,
      partyA,
      partyB,
      terms: initialTerms,
      round: 1,
      maxRounds,
      status: "active",
      offers: [{ proposer: partyA, terms: initialTerms, timestamp: Date.now() }],
      expiresAt: Date.now() + 300_000, // 5 minutes
    };
    sessions.set(pactId, session);
    return session;
  }

  /**
   * Make a counter-offer. Advances the round. Deadlocks if max rounds exceeded.
   */
  makeCounterOffer(
    pactId: string,
    proposer: string,
    currentTerms: PactTerms,
    counterParams: CounterOfferParams,
  ): NegotiationSession {
    const session = this.getSession(pactId);
    if (session.status !== "active") throw new Error("Session not active");
    if (Date.now() > session.expiresAt) {
      session.status = "deadlocked";
      throw new Error("Session expired");
    }

    session.round++;
    if (session.round > session.maxRounds) {
      session.status = "deadlocked";
      throw new Error("Max negotiation rounds exceeded");
    }

    // Build counter-offer by merging params
    const newTerms: PactTerms = {
      ...currentTerms,
      amount: counterParams.amount ?? currentTerms.amount,
      interestRate: counterParams.interestRate ?? currentTerms.interestRate,
      collateralRatio: counterParams.collateralRatio ?? currentTerms.collateralRatio,
      duration: counterParams.duration ?? currentTerms.duration,
      penaltyBps: counterParams.penaltyBps ?? currentTerms.penaltyBps,
    };

    session.terms = newTerms;
    session.offers.push({ proposer, terms: newTerms, timestamp: Date.now() });
    session.expiresAt = Date.now() + 300_000; // Extend

    return session;
  }

  /**
   * Accept the current terms, finalizing negotiation.
   */
  acceptOffer(pactId: string, acceptor: string): NegotiationSession {
    const session = this.getSession(pactId);
    if (session.status !== "active") throw new Error("Session not active");
    session.status = "accepted";
    return session;
  }

  /**
   * Reject negotiation entirely.
   */
  rejectNegotiation(pactId: string): void {
    const session = this.getSession(pactId);
    session.status = "rejected";
    sessions.delete(pactId);
  }

  /**
   * Generate a renegotiation proposal when conditions degrade.
   * Uses deterministic parameter math. Phase 3 will add AI reasoning.
   */
  generateRenegotiationProposal(
    currentTerms: PactTerms,
    trigger: "collateral_ratio_approaching" | "yield_below_target" | "oracle_deviation",
  ): { newTerms: PactTerms; reason: string } {
    const newTerms = { ...currentTerms };

    switch (trigger) {
      case "collateral_ratio_approaching": {
        // Lower collateral requirement, increase interest as compensation
        const reduction = currentTerms.collateralRatio / 20n; // 5% reduction
        newTerms.collateralRatio = currentTerms.collateralRatio - reduction;
        const interestIncrease = (BigInt(String(Math.ceil(Number(reduction) / 10))) * 100n);
        newTerms.interestRate = currentTerms.interestRate + interestIncrease;
        return {
          newTerms,
          reason: `Collateral approaching threshold. Reducing ratio by ${reduction}bps, increasing rate by ${interestIncrease}bps.`,
        };
      }
      case "yield_below_target": {
        newTerms.interestRate = currentTerms.interestRate + 50n;
        newTerms.duration = currentTerms.duration + 7200n; // Extend ~1 day in blocks
        return {
          newTerms,
          reason: "Yield below target. Increasing rate by 50bps, extending duration by 7200 blocks.",
        };
      }
      case "oracle_deviation": {
        newTerms.renegotiationWindow = currentTerms.renegotiationWindow / 2n;
        newTerms.interestRate = currentTerms.interestRate + 25n;
        return {
          newTerms,
          reason: "Oracle deviation detected. Tightening renegotiation window, increasing rate by 25bps.",
        };
      }
    }
  }

  /**
   * Evaluate fairness of a proposed renegotiation (heuristic, 0-100).
   */
  evaluateFairness(originalTerms: PactTerms, proposedTerms: PactTerms): number {
    let score = 70; // Neutral baseline

    const collatReduction = Number(originalTerms.collateralRatio - proposedTerms.collateralRatio);
    const collatReductionPct = (collatReduction / Number(originalTerms.collateralRatio)) * 100;
    const rateChange = Number(proposedTerms.interestRate) - Number(originalTerms.interestRate);

    // Large collateral reductions are unfair unless well-compensated
    if (collatReductionPct > 30) score -= 20;
    else if (collatReductionPct > 15) score -= 10;

    // Rate increases compensate for risk reduction
    if (rateChange >= 100) score += 15;
    else if (rateChange >= 50) score += 10;
    else if (rateChange >= 25) score += 5;
    else if (rateChange < 0) score -= 15; // Dropping rate while reducing collateral is unfair

    return Math.max(0, Math.min(100, score));
  }

  getSession(pactId: string): NegotiationSession {
    const session = sessions.get(pactId);
    if (!session) throw new Error(`No negotiation session for pact ${pactId}`);
    return session;
  }

  getActiveSessions(): NegotiationSession[] {
    return Array.from(sessions.values()).filter(s => s.status === "active");
  }
}

// Singleton
export const negotiationEngine = new NegotiationEngine();
