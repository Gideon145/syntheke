/**
 * Syntheke On-Chain Mediator Voting
 *
 * Each of the 3 mediator agents (Themis, Athena, Solon) votes on-chain
 * with their funded wallet. 2/3 consensus required for resolution.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";

interface MediatorVote {
  mediator: string;
  address: string;
  verdict: "approve" | "reject" | "abstain";
  fairnessScore: number;
  reason: string;
  signature?: string;
}

interface VotingResult {
  reached: boolean;
  verdict: "approve" | "reject" | "deadlocked";
  votes: MediatorVote[];
  approveCount: number;
  rejectCount: number;
  partyAShare: number; // percentage
}

const MEDIATOR_KEYS: Record<string, { pk: string; address: string }> = {
  Themis: { pk: config.THEMIS_PRIVATE_KEY ?? "", address: config.THEMIS_ADDRESS ?? "" },
  Athena: { pk: config.ATHENA_PRIVATE_KEY ?? "", address: config.ATHENA_ADDRESS ?? "" },
  Solon: { pk: config.SOLON_PRIVATE_KEY ?? "", address: config.SOLON_ADDRESS ?? "" },
};

/**
 * Run the mediator voting swarm — each mediator evaluates evidence
 * and submits their verdict. Returns 2/3 consensus result.
 */
export async function runMediatorVote(
  evidence: { pactId: string; breachTier: number; attestationCount: number; degradationCount: number },
): Promise<VotingResult> {
  const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
  const votes: MediatorVote[] = [];

  for (const [name, keys] of Object.entries(MEDIATOR_KEYS)) {
    if (!keys.pk) continue;
    try {
      const signer = new ethers.Wallet(keys.pk, provider);
      const vote = evaluateDispute(name, evidence);

      // Sign the vote (real ECDSA signature proving the mediator voted)
      const messageHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32", "string", "uint256"],
        [name, evidence.pactId, vote.verdict, vote.fairnessScore],
      );
      vote.signature = await signer.signMessage(ethers.getBytes(messageHash));
      vote.address = keys.address;

      votes.push(vote);
      logger.info({
        event: "mediator_voted",
        mediator: name,
        verdict: vote.verdict,
        fairness: vote.fairnessScore,
      }, `${name} voted: ${vote.verdict} (fairness: ${vote.fairnessScore}/100)`);

      logActivity(
        "mediator_voted",
        `${name} voted ${vote.verdict} (${vote.fairnessScore}/100) — ${vote.reason}`,
        evidence.pactId,
      );
    } catch (err) {
      logger.warn({ event: "mediator_vote_failed", mediator: name, err });
    }
  }

  const approveCount = votes.filter(v => v.verdict === "approve").length;
  const rejectCount = votes.filter(v => v.verdict === "reject").length;
  const reached = approveCount >= 2 || rejectCount >= 2;
  const verdict = approveCount >= 2 ? "approve" as const : rejectCount >= 2 ? "reject" as const : "deadlocked" as const;

  // Determine payout split
  let partyAShare = 50;
  if (verdict === "approve") partyAShare = 70;
  else if (verdict === "reject") partyAShare = 30;

  return { reached, verdict, votes, approveCount, rejectCount, partyAShare };
}

/**
 * Deterministic dispute evaluation per mediator.
 * In production, this calls Claude for each mediator.
 */
function evaluateDispute(name: string, evidence: { pactId: string; breachTier: number; attestationCount: number; degradationCount: number }): MediatorVote {
  const { breachTier, attestationCount, degradationCount } = evidence;

  // Themis — Market Fairness: leans toward party that's economically disadvantaged
  if (name === "Themis") {
    const fairness = breachTier <= 1 ? 65 : 35;
    if (attestationCount > 15) {
      return { mediator: "Themis", address: "", verdict: "approve", fairnessScore: fairness, reason: "High attestation count confirms breach pattern — penalty proportional" };
    }
    return { mediator: "Themis", address: "", verdict: "approve", fairnessScore: 55, reason: "Breach detected — escrow penalty per pact terms is fair" };
  }

  // Athena — Risk Assessment: conservative, protects protocol integrity
  if (name === "Athena") {
    if (degradationCount === 0 && breachTier <= 1) {
      return { mediator: "Athena", address: "", verdict: "approve", fairnessScore: 60, reason: "Direct breach without degradation — suggests systemic issue. Approve with caution." };
    }
    return { mediator: "Athena", address: "", verdict: "reject", fairnessScore: 40, reason: "Insufficient degradation history — possible false positive on testnet" };
  }

  // Solon — Historical Precedent: looks for patterns
  if (name === "Solon") {
    if (attestationCount >= 20) {
      return { mediator: "Solon", address: "", verdict: "approve", fairnessScore: 70, reason: "20+ attestations consistent with precedent — resolution aligns with similar pacts" };
    }
    return { mediator: "Solon", address: "", verdict: "abstain", fairnessScore: 50, reason: "Insufficient attestation history for precedent matching" };
  }

  return { mediator: name, address: "", verdict: "abstain", fairnessScore: 50, reason: "Unable to reach determination" };
}
