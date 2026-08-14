/**
 * Syntheke On-Chain Mediator Voting — commit-reveal (Batch 2, Feature 5)
 *
 * Each of the 3 mediator agents (Themis, Athena, Solon) votes on-chain
 * with a commit-reveal scheme enforced by the MediatorVotes contract:
 *
 *   Phase 1 — COMMIT: every mediator evaluates the evidence privately and
 *     commits keccak256(verdict, fairnessScore, reasonHash, nonce) on-chain.
 *     No verdict is visible yet — nobody can copy or react to the others.
 *   Phase 2 — REVEAL: the contract only unlocks reveals once ALL mediators
 *     have committed. Each reveal is verified on-chain against its commitment
 *     (commitment mismatch → tx reverts). Anyone can verify the votes.
 *
 * 2/3 consensus required for resolution.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import MediatorVotesABI from "./abis/MediatorVotes.json" with { type: "json" };

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

/** pactId -> mediator -> pending reveal data (survives between phases in-process) */
const pendingReveals = new Map<string, Map<string, {
  verdict: "approve" | "reject" | "abstain";
  fairnessScore: number;
  reasonHash: string;
  nonce: string;
  reason: string;
}>>();

function getVotesContract(signerOrProvider: ethers.Wallet | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    config.MEDIATOR_VOTES,
    MediatorVotesABI as unknown as ethers.InterfaceAbi,
    signerOrProvider,
  );
}

/**
 * Run the mediator voting swarm — each mediator evaluates evidence
 * and submits their verdict. Returns 2/3 consensus result.
 */
export async function runMediatorVote(
  evidence: { pactId: string; breachTier: number; attestationCount: number; degradationCount: number },
): Promise<VotingResult> {
  const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
  const pactIdBytes = ethers.getBytes(evidence.pactId);
  const votes: MediatorVote[] = [];

  // ── Phase 1: COMMIT ─────────────────────────────────────
  const round = pendingReveals.get(evidence.pactId) ?? new Map();
  for (const [name, keys] of Object.entries(MEDIATOR_KEYS)) {
    if (!keys.pk || !keys.address) continue;
    try {
      const signer = new ethers.Wallet(keys.pk, provider);
      const vote = evaluateDispute(name, evidence);
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(vote.reason));
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const commitment = ethers.solidityPackedKeccak256(
        ["string", "uint256", "bytes32", "bytes32"],
        [vote.verdict, vote.fairnessScore, reasonHash, nonce],
      );

      const contract = getVotesContract(signer);
      const [, committed] = await contract.getCommitment(pactIdBytes, keys.address);
      if (!committed) {
        const tx = await contract.commitVote(pactIdBytes, commitment);
        await tx.wait();
      }

      round.set(name, {
        verdict: vote.verdict,
        fairnessScore: vote.fairnessScore,
        reasonHash,
        nonce,
        reason: vote.reason,
      });

      logger.info({ event: "mediator_committed", mediator: name, commitment: commitment.slice(0, 18) },
        `${name} committed verdict hash on-chain (${commitment.slice(0, 18)}…)`);
      logActivity("mediator_committed", `${name} committed a hidden verdict hash on-chain`, evidence.pactId);
    } catch (err) {
      logger.warn({ event: "mediator_commit_failed", mediator: name, err });
    }
  }
  pendingReveals.set(evidence.pactId, round);

  // ── Phase 2: REVEAL (unlocked once all mediators committed) ──
  const mediatorCount = Object.values(MEDIATOR_KEYS).filter(k => k.pk && k.address).length;
  if (round.size >= mediatorCount) {
    for (const [name, keys] of Object.entries(MEDIATOR_KEYS)) {
      if (!keys.pk || !keys.address) continue;
      const pending = round.get(name);
      if (!pending) continue;
      try {
        const signer = new ethers.Wallet(keys.pk, provider);
        const contract = getVotesContract(signer);
        const alreadyRevealed = await contract.hasRevealed(pactIdBytes, keys.address);
        if (alreadyRevealed) continue;
        const tx = await contract.revealVote(
          pactIdBytes,
          pending.verdict,
          pending.fairnessScore,
          pending.reasonHash,
          pending.nonce,
        );
        await tx.wait();
        logger.info({ event: "mediator_revealed", mediator: name, verdict: pending.verdict, txHash: tx.hash },
          `${name} revealed verdict on-chain: ${pending.verdict} (${pending.fairnessScore}/100)`);
        logActivity("mediator_revealed",
          `${name} revealed ${pending.verdict} (${pending.fairnessScore}/100) — verified against commitment`,
          evidence.pactId, tx.hash);
      } catch (err) {
        logger.warn({ event: "mediator_reveal_failed", mediator: name, err });
      }
    }
  } else {
    logger.warn({ event: "commit_reveal_incomplete", committed: round.size, total: mediatorCount },
      "Not all mediators committed — reveals stay locked this cycle");
  }

  // ── Read revealed votes back from the chain (the source of truth) ──
  try {
    const readContract = getVotesContract(provider);
    const revealed = await readContract.getVotes(pactIdBytes);
    for (const r of revealed) {
      const name = Object.entries(MEDIATOR_KEYS).find(([, k]) =>
        k.address.toLowerCase() === String(r.mediator).toLowerCase())?.[0];
      const verdict = String(r.verdict) as "approve" | "reject" | "abstain";
      if (name) {
        votes.push({
          mediator: name,
          address: String(r.mediator),
          verdict,
          fairnessScore: Number(r.fairnessScore),
          reason: round.get(name)?.reason ?? `On-chain reveal #${evidence.pactId.slice(0, 8)}`,
        });
      }
    }
  } catch (err) {
    logger.warn({ event: "vote_read_failed", err });
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

/** API helper — full on-chain round state for a pact (commits + reveals). */
export async function getVoteRoundState(pactId: string): Promise<{
  address: string;
  pactId: string;
  mediators: Array<{ address: string; committed: boolean; commitment: string; revealed: boolean }>;
  votes: Array<{ mediator: string; verdict: string; fairnessScore: number; reasonHash: string }>;
  commitCount: number;
  roundComplete: boolean;
}> {
  const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
  const contract = getVotesContract(provider);
  const pactIdBytes = ethers.getBytes(pactId);

  const mediatorList = Object.values(MEDIATOR_KEYS).filter(k => k.address);
  const entries = await Promise.all(mediatorList.map(async m => {
    const [hash, committed] = await contract.getCommitment(pactIdBytes, m.address);
    const revealed = await contract.hasRevealed(pactIdBytes, m.address);
    return {
      address: m.address,
      committed,
      commitment: committed ? String(hash) : "",
      revealed,
    };
  }));

  const rawVotes = await contract.getVotes(pactIdBytes);
  const votes = rawVotes.map((r: { mediator: string; verdict: string; fairnessScore: bigint; reasonHash: string }) => ({
    mediator: String(r.mediator),
    verdict: String(r.verdict),
    fairnessScore: Number(r.fairnessScore),
    reasonHash: String(r.reasonHash),
  }));

  return {
    address: config.MEDIATOR_VOTES,
    pactId,
    mediators: entries,
    votes,
    commitCount: Number(await contract.commitCount(pactIdBytes)),
    roundComplete: votes.length >= mediatorList.length,
  };
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
