/**
 * heal.ts — Proactive Self-Healing Treaties (Phase 2b)
 *
 * When a pact starts DEGRADING (before a hard breach), the monitor doesn't
 * wait for it to break. It:
 *   1. Generates amended terms (AI proposal, deterministic fallback)
 *   2. Evaluates fairness of the amendment
 *   3. If fair, executes on-chain renegotiation: DEGRADING → RENEGOTIATING → ACTIVE
 *
 * The treaty heals itself — no breach, no arbitration, no humans.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import { notifyParties } from "./notify";
import { negotiationEngine } from "./negotiator";
import { generateAIRenegotiation } from "./ai/negotiator";
import type { PactTerms } from "./pact";

export interface SelfHealResult {
  healed: boolean;
  reason: string;
  txHash?: string;
  newTerms?: Partial<PactTerms>;
  fairness: number;
}

/**
 * Attempt to self-heal a DEGRADING pact.
 * Caller must be the monitor (Party A in demo pacts).
 */
export async function selfHealPact(
  signer: ethers.Wallet,
  pactId: string,
  currentTerms: PactTerms,
  degradationReason: string,
): Promise<SelfHealResult> {
  // 1. Generate amendment proposal — AI first, deterministic fallback
  let newTerms: PactTerms | null = null;
  let fairness = 0;
  let reason: string;

  try {
    const aiResult = await generateAIRenegotiation(
      currentTerms,
      degradationReason,
      "X Layer testnet — dual-model AI monitoring (Claude + DeepSeek)",
    );
    if (aiResult.terms && aiResult.fairnessScore > 0) {
      newTerms = aiResult.terms;
      fairness = aiResult.fairnessScore;
      reason = aiResult.reasoning || "AI-proposed amendment";
    } else {
      const fallback = negotiationEngine.generateRenegotiationProposal(currentTerms, "collateral_ratio_approaching");
      newTerms = fallback.newTerms;
      fairness = negotiationEngine.evaluateFairness(currentTerms, fallback.newTerms);
      reason = fallback.reason;
    }
  } catch {
    const fallback = negotiationEngine.generateRenegotiationProposal(currentTerms, "collateral_ratio_approaching");
    newTerms = fallback.newTerms;
    fairness = negotiationEngine.evaluateFairness(currentTerms, fallback.newTerms);
    reason = fallback.reason;
  }

  // 2. Fairness gate — reject amendments that would make things worse
  if (fairness < 40) {
    logger.warn({ event: "selfheal_rejected", pactId: pactId.slice(0, 10), fairness }, `Self-heal amendment rejected (fairness ${fairness}/100 < 40)`);
    return { healed: false, reason: `Amendment rejected — fairness ${fairness}/100 below threshold`, fairness };
  }

  // 3. Execute on-chain: DEGRADING → RENEGOTIATING → ACTIVE
  try {
    const { getPactContract } = await import("./pact");
    const contract = getPactContract(signer);

    const tx1 = await contract.initiateRenegotiation(pactId);
    await tx1.wait();
    logger.info({ event: "selfheal_initiated", pactId: pactId.slice(0, 10), tx: tx1.hash });
    logActivity("selfheal_initiated", `Self-healing initiated — ${reason}`, pactId, tx1.hash);
    notifyParties(pactId, "RENEGOTIATING", "", "", "Autonomous self-healing triggered — agents amending terms before breach");

    const tx2 = await contract.acceptRenegotiation(pactId, newTerms);
    await tx2.wait();
    logger.info({ event: "selfheal_complete", pactId: pactId.slice(0, 10), tx: tx2.hash, fairness }, `Pact self-healed — new terms ACTIVE (fairness ${fairness}/100)`);
    logActivity("selfheal_complete", `✅ Pact self-healed — amended terms restored ACTIVE state (${reason})`, pactId, tx2.hash);

    // Rewrite the plain-English contract to match the amended terms
    try {
      const { writeContract } = await import("./ai/contract-writer");
      const { getContract } = await import("./ai/contract-writer");
      const existing = getContract(pactId);
      const termsRecord: Record<string, string> = {
        amount: newTerms.amount.toString(),
        settlementAsset: newTerms.settlementAsset,
        duration: newTerms.duration.toString(),
        collateralRatio: newTerms.collateralRatio.toString(),
        liquidationThreshold: newTerms.liquidationThreshold.toString(),
        interestRate: newTerms.interestRate.toString(),
        penaltyBps: newTerms.penaltyBps.toString(),
        breachGraceBlocks: newTerms.breachGraceBlocks.toString(),
        renegotiationWindow: newTerms.renegotiationWindow.toString(),
        maxRenegotiationRounds: newTerms.maxRenegotiationRounds.toString(),
        monitoredConditions: newTerms.monitoredConditions.toString(),
      };
      await writeContract({
        pactId,
        description: "Autonomously amended treaty (self-healed after degradation)",
        terms: termsRecord,
        partyADesc: "Party A",
        partyBDesc: "Party B",
        version: (existing?.version ?? 1) + 1,
      });
      logActivity("contract_amended", "📜 Contract rewritten to reflect self-healed terms", pactId);
    } catch (err) {
      logger.warn({ event: "contract_rewrite_failed", err }, "Contract rewrite after self-heal failed");
    }

    return {
      healed: true,
      reason,
      txHash: tx2.hash,
      newTerms: {
        amount: newTerms.amount,
        collateralRatio: newTerms.collateralRatio,
        interestRate: newTerms.interestRate,
        duration: newTerms.duration,
        penaltyBps: newTerms.penaltyBps,
        breachGraceBlocks: newTerms.breachGraceBlocks,
      },
      fairness,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "selfheal_tx_failed", pactId: pactId.slice(0, 10), err: msg }, "Self-heal transaction failed");
    return { healed: false, reason: `On-chain renegotiation failed: ${msg.slice(0, 100)}`, fairness };
  }
}
