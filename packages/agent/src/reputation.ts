/**
 * reputation.ts — Portable Reputation Oracle (Phase 4a)
 *
 * After a pact settles (on-chain mediator vote → resolve → finalize),
 * the monitor records the outcome for BOTH parties in ReputationOracle.
 *
 * Outcomes:
 *   - verdict "approve" → Party A's claim upheld → A COMPLETED, B BREACHED
 *   - verdict "reject"  → Party A's claim rejected → A BREACHED, B COMPLETED
 *   - deadlocked        → both TERMINATED
 *
 * Any protocol on X Layer can then call ReputationOracle.getReputation(agent)
 * to gate access or underwrite risk. This is the ecosystem-contribution layer.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import OracleABI from "./abis/ReputationOracle.json" with { type: "json" };

const TIER_NAMES = ["UNRATED", "RISKY", "CAUTIOUS", "NEUTRAL", "RELIABLE", "TRUSTED", "ELITE"];

function getOracleContract(signer?: ethers.Wallet): ethers.Contract {
  const runner = signer ?? new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
  return new ethers.Contract(config.REPUTATION_ORACLE, OracleABI as unknown as ethers.InterfaceAbi, runner);
}

export interface ReputationOutcome {
  pactId: string;
  partyA: string;
  partyB: string;
  verdict: "approve" | "reject" | "deadlocked";
  partyAShare: number; // percentage of escrow to A
}

/**
 * Record pact settlement outcomes in the ReputationOracle for both parties.
 * Called by the monitor after finalizeSettlement. Non-fatal on failure.
 */
export async function recordSettlementReputation(
  signer: ethers.Wallet,
  outcome: ReputationOutcome,
): Promise<{ partyA: { outcome: string; score: bigint } | null; partyB: { outcome: string; score: bigint } | null }> {
  const contract = getOracleContract(signer);
  const fairnessBpsA = outcome.partyAShare * 100; // percentage → bps
  const fairnessBpsB = (100 - outcome.partyAShare) * 100;

  let eventA: string;
  let eventB: string;
  if (outcome.verdict === "approve") {
    eventA = "COMPLETED";
    eventB = "BREACHED";
  } else if (outcome.verdict === "reject") {
    eventA = "BREACHED";
    eventB = "COMPLETED";
  } else {
    eventA = "TERMINATED";
    eventB = "TERMINATED";
  }

  const results: { partyA: { outcome: string; score: bigint } | null; partyB: { outcome: string; score: bigint } | null } = {
    partyA: null,
    partyB: null,
  };

  try {
    const txA = await contract.recordOutcome(outcome.pactId, outcome.partyA, eventA, fairnessBpsA);
    await txA.wait();
    results.partyA = { outcome: eventA, score: await contract.getScore(outcome.partyA) };
    logger.info({
      event: "reputation_recorded",
      pactId: outcome.pactId.slice(0, 10),
      agent: outcome.partyA.slice(0, 10),
      outcome: eventA,
      score: results.partyA.score.toString(),
    }, `Party A reputation: ${eventA} → ${results.partyA.score}`);
  } catch (err) {
    logger.warn({ event: "reputation_record_failed", party: "A", err });
  }

  try {
    const txB = await contract.recordOutcome(outcome.pactId, outcome.partyB, eventB, fairnessBpsB);
    await txB.wait();
    results.partyB = { outcome: eventB, score: await contract.getScore(outcome.partyB) };
    logger.info({
      event: "reputation_recorded",
      pactId: outcome.pactId.slice(0, 10),
      agent: outcome.partyB.slice(0, 10),
      outcome: eventB,
      score: results.partyB.score.toString(),
    }, `Party B reputation: ${eventB} → ${results.partyB.score}`);
  } catch (err) {
    logger.warn({ event: "reputation_record_failed", party: "B", err });
  }

  if (results.partyA || results.partyB) {
    logActivity(
      "reputation_updated",
      `Reputation oracle updated — A: ${results.partyA?.outcome ?? "skipped"} (${results.partyA?.score.toString() ?? "-"}), B: ${results.partyB?.outcome ?? "skipped"} (${results.partyB?.score.toString() ?? "-"})`,
      outcome.pactId,
    );
  }

  return results;
}

export interface ReputationSnapshot {
  address: string;
  score: number;
  scoreFormatted: string;
  tier: string;
  tierIndex: number;
  pactCount: number;
  completed: number;
  breached: number;
  terminated: number;
  complianceBps: number;
  lastUpdated: number;
}

/**
 * Read a full reputation snapshot for one agent. Used by GET /reputation.
 */
export async function getReputationSnapshot(address: string): Promise<ReputationSnapshot | null> {
  try {
    const contract = getOracleContract();
    const r = await contract.getReputation(address);
    return {
      address,
      score: Number(r.score),
      scoreFormatted: r.score.toString(),
      tier: TIER_NAMES[Number(r.tier)] ?? "UNRATED",
      tierIndex: Number(r.tier),
      pactCount: Number(r.pactCount),
      completed: Number(r.completedCount),
      breached: Number(r.breachedCount),
      terminated: Number(r.terminatedCount),
      complianceBps: Number(r.complianceBps),
      lastUpdated: Number(r.lastUpdated),
    };
  } catch (err) {
    logger.warn({ event: "reputation_read_failed", address, err });
    return null;
  }
}

/**
 * Oracle metadata for the API + dashboard.
 */
export async function getOracleInfo(): Promise<{ address: string; version: string; kFactor: number; registryV1: string }> {
  const contract = getOracleContract();
  try {
    const info = await contract.oracleInfo();
    return {
      address: config.REPUTATION_ORACLE,
      version: info[0],
      kFactor: Number(info[1]),
      registryV1: await contract.registryV1(),
    };
  } catch {
    return { address: config.REPUTATION_ORACLE, version: "syntheke-reputation-v2", kFactor: 32, registryV1: config.REPUTATION_REGISTRY };
  }
}
