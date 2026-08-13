/**
 * staking.ts — Mediator economic stakes (Phase 2a)
 *
 * Themis, Athena, and Solon stake native OKL in the MediatorStaking contract.
 * After every arbitration:
 *   - minority (wrong verdict) mediators are slashed
 *   - slashed stake is distributed to the majority (correct verdict)
 *
 * This makes AI verdicts economically consequential — real money on the line.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import StakingABI from "./abis/MediatorStaking.json" with { type: "json" };

const MEDIATOR_WALLETS: Array<{ name: string; address: string; key: string }> = [
  { name: "Themis", address: config.THEMIS_ADDRESS ?? "", key: config.THEMIS_PRIVATE_KEY ?? "" },
  { name: "Athena", address: config.ATHENA_ADDRESS ?? "", key: config.ATHENA_PRIVATE_KEY ?? "" },
  { name: "Solon", address: config.SOLON_ADDRESS ?? "", key: config.SOLON_PRIVATE_KEY ?? "" },
];

function getStakingContract(signer: ethers.Wallet): ethers.Contract {
  return new ethers.Contract(config.MEDIATOR_STAKING, StakingABI as unknown as ethers.InterfaceAbi, signer);
}

/**
 * Ensure each mediator has staked at least MEDIATOR_STAKE_AMOUNT.
 * Called at agent startup. Idempotent — skips mediators already staked.
 */
export async function ensureMediatorStakes(signer: ethers.Wallet): Promise<void> {
  const contract = getStakingContract(signer);
  const minStake = ethers.parseEther(config.MEDIATOR_STAKE_AMOUNT);

  for (const m of MEDIATOR_WALLETS) {
    if (!m.key || !m.address) continue;
    try {
      const current: bigint = await contract.stakes(m.address);
      if (current >= minStake) {
        logger.info({ event: "mediator_stake_ok", mediator: m.name, stake: ethers.formatEther(current) }, `${m.name} already staked ${ethers.formatEther(current)} OKL`);
        continue;
      }
      const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
      const mediatorWallet = new ethers.Wallet(m.key, provider);
      const mediatorContract = getStakingContract(mediatorWallet);
      const tx = await mediatorContract.stake({ value: minStake });
      await tx.wait();
      logger.info({ event: "mediator_staked", mediator: m.name, amount: config.MEDIATOR_STAKE_AMOUNT }, `${m.name} staked ${config.MEDIATOR_STAKE_AMOUNT} OKL`);
      logActivity("mediator_staked", `${m.name} staked ${config.MEDIATOR_STAKE_AMOUNT} OKL into mediator staking`);
    } catch (err) {
      logger.warn({ event: "mediator_stake_failed", mediator: m.name, err }, `${m.name} stake failed (insufficient balance?)`);
    }
  }
}

/**
 * Slash minority and reward majority after a dispute is resolved.
 * Called by the monitor (owner) after on-chain mediator voting.
 */
export async function recordVerdictStakes(
  signer: ethers.Wallet,
  pactId: string,
  consensusVerdict: "approve" | "reject",
  votes: Array<{ mediator: string; verdict: "approve" | "reject" | "abstain" }>,
): Promise<{ slashed: number; rewarded: number } | null> {
  const majority: string[] = [];
  const minority: string[] = [];

  for (const v of votes) {
    if (v.verdict === "abstain") continue; // abstainers are neither rewarded nor slashed
    const wallet = MEDIATOR_WALLETS.find(m => m.name === v.mediator);
    if (!wallet?.address) continue;
    if (v.verdict === consensusVerdict) majority.push(wallet.address);
    else minority.push(wallet.address);
  }

  if (minority.length === 0 || majority.length === 0) {
    logger.info({ event: "staking_no_dissent", pactId: pactId.slice(0, 10) }, "Unanimous verdict — no slashing");
    return null;
  }

  try {
    const contract = getStakingContract(signer);
    const tx = await contract.recordVerdict(pactId, majority, minority);
    await tx.wait();
    const slashedTotal: bigint = await contract.totalSlashed();
    logger.info({
      event: "staking_verdict_recorded",
      pactId: pactId.slice(0, 10),
      majority: majority.length,
      minority: minority.length,
    }, `Stakes settled: ${majority.length} rewarded, ${minority.length} slashed`);
    logActivity(
      "mediator_slashed",
      `${minority.length} mediator(s) slashed for wrong verdict — stake distributed to ${majority.length} correct mediators`,
      pactId,
      tx.hash,
    );
    return { slashed: minority.length, rewarded: majority.length };
  } catch (err) {
    logger.warn({ event: "staking_record_failed", err }, "Failed to record verdict stakes");
    return null;
  }
}

/**
 * Read current staking state for the API + dashboard.
 */
export async function getStakingState(): Promise<{
  address: string;
  slashPercent: number;
  totalStaked: string;
  totalStakedFormatted: string;
  totalSlashed: string;
  totalSlashedFormatted: string;
  verdictCount: number;
  mediators: Array<{ name: string; address: string; stake: string; stakeFormatted: string }>;
}> {
  const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
  const contract = new ethers.Contract(config.MEDIATOR_STAKING, StakingABI as unknown as ethers.InterfaceAbi, provider);

  const [slashPercent, totalStaked, totalSlashed, verdictCount] = await Promise.all([
    contract.slashPercent(),
    contract.totalStaked(),
    contract.totalSlashed(),
    contract.verdictCount(),
  ]);

  const mediators: Array<{ name: string; address: string; stake: string; stakeFormatted: string }> = [];
  for (const m of MEDIATOR_WALLETS) {
    if (!m.address) continue;
    try {
      const stake: bigint = await contract.stakes(m.address);
      mediators.push({
        name: m.name,
        address: m.address,
        stake: stake.toString(),
        stakeFormatted: ethers.formatEther(stake),
      });
    } catch {
      mediators.push({ name: m.name, address: m.address, stake: "0", stakeFormatted: "0.0" });
    }
  }

  return {
    address: config.MEDIATOR_STAKING,
    slashPercent: Number(slashPercent),
    totalStaked: totalStaked.toString(),
    totalStakedFormatted: ethers.formatEther(totalStaked),
    totalSlashed: totalSlashed.toString(),
    totalSlashedFormatted: ethers.formatEther(totalSlashed),
    verdictCount: Number(verdictCount),
    mediators,
  };
}
