/**
 * syndicate.ts — N-party Treaty Syndicates (Phase 4b)
 *
 * A mini agent-DAO on X Layer: up to 10 agents pool escrow and govern a
 * shared treaty with stake-weighted votes. Proposals execute automatically
 * once the required super-majority of weight votes in favor:
 *
 *   RENEGOTIATE / SETTLE : > 50% of stake
 *   BREACH declaration   : ≥ 66% of stake
 *
 * Breach verdicts slash the target's stake AND record a BREACHED outcome
 * in the ReputationOracle — syndicate law feeds portable reputation.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import SyndicateABI from "./abis/TreatySyndicate.json" with { type: "json" };

const MEMBER_WALLETS: Record<string, { name: string; key: string; address: string }> = {
  agent: { name: "Monitor", key: config.AGENT_PRIVATE_KEY, address: config.AGENT_ADDRESS ?? "" },
  Themis: { name: "Themis", key: config.THEMIS_PRIVATE_KEY ?? "", address: config.THEMIS_ADDRESS ?? "" },
  Athena: { name: "Athena", key: config.ATHENA_PRIVATE_KEY ?? "", address: config.ATHENA_ADDRESS ?? "" },
  Solon: { name: "Solon", key: config.SOLON_PRIVATE_KEY ?? "", address: config.SOLON_ADDRESS ?? "" },
};

// In-memory registry of created syndicates (contract has no global list)
const createdSyndicates: Array<{
  syndicateId: string;
  name: string;
  createdAt: number;
}> = [];

export function listCreatedSyndicates() {
  return [...createdSyndicates];
}

/** Map a member role ("agent", "Themis", "Athena", "Solon", or raw address) to its wallet address. */
export function resolveMemberAddresses(role: string): string {
  if (role.startsWith("0x")) return role;
  return MEMBER_WALLETS[role]?.address ?? "";
}

/** List every syndicate id that exists on-chain (contract keeps an index). */
export async function listOnChainSyndicateIds(): Promise<string[]> {
  try {
    const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
    const contract = new ethers.Contract(config.TREATY_SYNDICATE, SyndicateABI as unknown as ethers.InterfaceAbi, provider);
    const ids: string[] = await contract.getSyndicateIds();
    return ids;
  } catch (err) {
    logger.warn({ event: "syndicate_list_failed", err });
    return [];
  }
}

function getContract(signer: ethers.Wallet): ethers.Contract {
  return new ethers.Contract(config.TREATY_SYNDICATE, SyndicateABI as unknown as ethers.InterfaceAbi, signer);
}

function getWallet(role: string): ethers.Wallet | null {
  const w = MEMBER_WALLETS[role];
  if (!w || !w.key) return null;
  const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
  return new ethers.Wallet(w.key, provider);
}

/**
 * Create a new N-party syndicate. msg.value = sum of stakes, paid by the
 * agent wallet (which funds all members' stakes).
 */
export async function createSyndicate(
  name: string,
  charter: string,
  members: Array<{ role: string; address: string }>,
  stakesWei: bigint[],
): Promise<{ success: boolean; syndicateId?: string; totalStake?: string; txHash?: string; error?: string }> {
  try {
    const signer = getWallet("agent");
    if (!signer) return { success: false, error: "agent wallet not configured" };
    const contract = getContract(signer);
    const total = stakesWei.reduce((a, b) => a + b, 0n);
    const addresses = members.map(m => m.address);

    const tx = await contract.createSyndicate(name, charter, addresses, stakesWei, { value: total });
    const receipt = await tx.wait();
    let syndicateId = "";
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "SyndicateCreated") {
          syndicateId = parsed.args.syndicateId;
        }
      } catch { /* skip */ }
    }
    if (!syndicateId) {
      // Fallback: recompute is fragile — use event-less retry via proposalCount? Use name scan.
      return { success: true, totalStake: total.toString(), txHash: tx.hash, error: "created but id not parsed" };
    }

    createdSyndicates.push({ syndicateId, name, createdAt: Date.now() });
    logger.info({ event: "syndicate_created", syndicateId: syndicateId.slice(0, 10), name, members: members.length, totalStake: ethers.formatEther(total) },
      `Syndicate "${name}" formed — ${members.length} members, ${ethers.formatEther(total)} OKB pooled`);
    logActivity("syndicate_created", `Syndicate "${name}" formed with ${members.length} agents pooling ${ethers.formatEther(total)} OKB`, syndicateId, tx.hash);
    return { success: true, syndicateId, totalStake: total.toString(), txHash: tx.hash };
  } catch (err) {
    logger.warn({ event: "syndicate_create_failed", name, err });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A member proposes a motion. Proposer's weight auto-supports.
 */
export async function propose(
  syndicateId: string,
  as: string,
  kind: "RENEGOTIATE" | "BREACH" | "SETTLE",
  target: string,
  payouts: bigint[],
  newCharter: string,
): Promise<{ success: boolean; proposalId?: number; txHash?: string; executed?: boolean; error?: string }> {
  const signer = getWallet(as);
  if (!signer) return { success: false, error: `unknown member role: ${as}` };
  try {
    const contract = getContract(signer);
    const tx = await contract.propose(syndicateId, kind, target, payouts, newCharter);
    const receipt = await tx.wait();

    let proposalId: number | undefined;
    let executed = false;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "ProposalCreated") proposalId = Number(parsed.args.proposalId);
        if (parsed?.name === "ProposalExecuted") executed = true;
      } catch { /* skip */ }
    }

    logger.info({ event: "syndicate_proposal", syndicateId: syndicateId.slice(0, 10), as, kind, proposalId, executed },
      `${as} proposed ${kind}${executed ? " — instantly executed" : ""}`);
    logActivity("syndicate_proposal", `${as} proposed ${kind}${executed ? " — quorum reached, executed" : ""}`, syndicateId, tx.hash);
    return { success: true, proposalId, txHash: tx.hash, executed };
  } catch (err) {
    logger.warn({ event: "syndicate_propose_failed", err });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A member votes on a proposal. Auto-executes when quorum is reached.
 */
export async function vote(
  syndicateId: string,
  proposalId: number,
  as: string,
  support: boolean,
): Promise<{ success: boolean; txHash?: string; executed?: boolean; error?: string }> {
  const signer = getWallet(as);
  if (!signer) return { success: false, error: `unknown member role: ${as}` };
  try {
    const contract = getContract(signer);
    const tx = await contract.vote(syndicateId, proposalId, support);
    const receipt = await tx.wait();

    let executed = false;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "ProposalExecuted") executed = true;
      } catch { /* skip */ }
    }

    logger.info({ event: "syndicate_vote", syndicateId: syndicateId.slice(0, 10), proposalId, as, support, executed },
      `${as} voted ${support ? "FOR" : "AGAINST"} proposal #${proposalId}${executed ? " — quorum reached, executed" : ""}`);
    logActivity("syndicate_vote", `${as} voted ${support ? "FOR" : "AGAINST"} #${proposalId}${executed ? " — executed" : ""}`, syndicateId, tx.hash);
    return { success: true, txHash: tx.hash, executed };
  } catch (err) {
    logger.warn({ event: "syndicate_vote_failed", err });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SyndicateSnapshot {
  syndicateId: string;
  name: string;
  charter: string;
  members: Array<{ address: string; stake: string; stakeFormatted: string; weightBps: number }>;
  totalStake: string;
  totalStakeFormatted: string;
  dissolved: boolean;
  proposals: Array<{
    proposalId: number;
    kind: string;
    target: string;
    supportWeight: string;
    againstWeight: string;
    executed: boolean;
    proposer: string;
  }>;
}

/**
 * Read a full syndicate snapshot for the API + dashboard.
 */
export async function getSyndicateSnapshot(syndicateId: string): Promise<SyndicateSnapshot | null> {
  try {
    const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
    const contract = new ethers.Contract(config.TREATY_SYNDICATE, SyndicateABI as unknown as ethers.InterfaceAbi, provider);
    const [name, charter, members, totalStake, dissolved] = await contract.getSyndicate(syndicateId);
    if (!name && members.length === 0) return null;

    const total = BigInt(totalStake);
    const memberRows = await Promise.all(members.map(async (addr: string) => {
      const stake: bigint = await contract.getMemberStake(syndicateId, addr);
      return {
        address: addr,
        stake: stake.toString(),
        stakeFormatted: ethers.formatEther(stake),
        weightBps: total > 0n ? Number((stake * 10000n) / total) : 0,
      };
    }));

    const proposalCount: bigint = await contract.proposalCounts(syndicateId);
    const proposals: SyndicateSnapshot["proposals"] = [];
    for (let i = 1; i <= Number(proposalCount); i++) {
      try {
        const p = await contract.getProposal(syndicateId, i);
        proposals.push({
          proposalId: i,
          kind: p.kind,
          target: p.target,
          supportWeight: p.supportWeight.toString(),
          againstWeight: p.againstWeight.toString(),
          executed: p.executed,
          proposer: p.proposer,
        });
      } catch { /* skip */ }
    }

    return {
      syndicateId,
      name,
      charter,
      members: memberRows,
      totalStake: total.toString(),
      totalStakeFormatted: ethers.formatEther(total),
      dissolved,
      proposals,
    };
  } catch (err) {
    logger.warn({ event: "syndicate_read_failed", syndicateId, err });
    return null;
  }
}

/**
 * Full automated demo: form a 3-agent syndicate, amend the charter by vote,
 * then declare a breach that slashes a member and hits the reputation oracle.
 */
export async function runSyndicateDemo(): Promise<{
  success: boolean;
  steps: string[];
  syndicateId?: string;
  slashedMember?: string;
  error?: string;
}> {
  const steps: string[] = [];
  const demoMembers = [
    { role: "Themis", address: config.THEMIS_ADDRESS ?? "" },
    { role: "Athena", address: config.ATHENA_ADDRESS ?? "" },
    { role: "Solon", address: config.SOLON_ADDRESS ?? "" },
  ].filter(m => m.address);
  if (demoMembers.length < 3) return { success: false, steps, error: "mediator addresses not configured" };

  const stake = ethers.parseEther("0.003");
  const created = await createSyndicate(
    "Mediator Syndicate",
    "Three mediator agents pool escrow to guarantee treaty enforcement quality.",
    demoMembers,
    [stake, stake, stake],
  );
  if (!created.success || !created.syndicateId) return { success: false, steps, error: created.error };
  const sid = created.syndicateId;
  steps.push(`Syndicate formed: ${demoMembers.map(m => m.role).join(" + ")} pooled 0.009 OKB`);

  // 1. RENEGOTIATE — Themis proposes a stronger charter; Athena seconds → >50% → executes
  const newCharter = "All mediators must stake 0.003 OKB and may be slashed 100% for wrong verdicts.";
  const prop1 = await propose(sid, "Themis", "RENEGOTIATE", ethers.ZeroAddress, [], newCharter);
  if (!prop1.success) return { success: false, steps, syndicateId: sid, error: prop1.error };
  steps.push(`Themis proposed RENEGOTIATE${prop1.executed ? " (auto-executed)" : ""}`);
  if (!prop1.executed) {
    const v1 = await vote(sid, prop1.proposalId!, "Athena", true);
    steps.push(`Athena voted FOR — ${v1.executed ? "charter amended ✓" : "still pending"}`);
  }

  // 2. BREACH — Athena accuses Themis of a wrong verdict; Solon supports → 2/3 = 66.6% → slash
  const prop2 = await propose(sid, "Athena", "BREACH", config.THEMIS_ADDRESS ?? ethers.ZeroAddress, [], "");
  if (!prop2.success) return { success: false, steps, syndicateId: sid, error: prop2.error };
  steps.push(`Athena proposed BREACH against Themis${prop2.executed ? " (auto-executed)" : ""}`);
  if (!prop2.executed) {
    const v2 = await vote(sid, prop2.proposalId!, "Solon", true);
    steps.push(`Solon voted FOR — ${v2.executed ? "Themis slashed ✓ stake redistributed + reputation BREACHED" : "quorum not reached (needs 66%)"}`);
  }

  return { success: true, steps, syndicateId: sid, slashedMember: config.THEMIS_ADDRESS };
}
