import { ethers } from "ethers";
import { config } from "./config";
import PactABI from "./abis/SynthekeContract.json" with { type: "json" };

const ABI = PactABI as unknown as ethers.InterfaceAbi;

/**
 * PactContract — wraps all on-chain interactions with the deployed SynthekeContract.
 * Uses ethers.js v6 for typed contract calls, event parsing, and transaction management.
 */

export interface PactTerms {
  amount: bigint;
  settlementAsset: string;
  duration: bigint;
  collateralRatio: bigint;
  liquidationThreshold: bigint;
  interestRate: bigint;
  penaltyBps: bigint;
  breachGraceBlocks: bigint;
  renegotiationWindow: bigint;
  maxRenegotiationRounds: bigint;
  monitoredConditions: bigint;
}

export interface PactData {
  state: number;
  partyA: string;
  partyB: string;
  terms: PactTerms;
  activationBlock: bigint;
  degradationCounter: bigint;
  consecutiveDegradation: bigint;
  breachTier: number;
  breachBlock: bigint;
  attestationCount: bigint;
  partyADeposited: boolean;
  partyBDeposited: boolean;
  closed: boolean;
}

export type SynthekeState =
  | "DRAFT" | "NEGOTIATING" | "PROPOSED" | "COMMITTED" | "ACTIVE"
  | "DEGRADING" | "RENEGOTIATING" | "BREACHED" | "CURING"
  | "ARBITRATING" | "RESOLVING" | "SETTLING" | "CLOSED"
  | "EXPIRED" | "TERMINATED";

export const STATE_NAMES: Record<number, SynthekeState> = {
  0: "DRAFT", 1: "NEGOTIATING", 2: "PROPOSED", 3: "COMMITTED",
  4: "ACTIVE", 5: "DEGRADING", 6: "RENEGOTIATING", 7: "BREACHED",
  8: "CURING", 9: "ARBITRATING", 10: "RESOLVING", 11: "SETTLING",
  12: "CLOSED", 13: "EXPIRED", 14: "TERMINATED",
};

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
}

export function getSigner(): ethers.Wallet {
  const provider = getProvider();
  return new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
}

export function getPactContract(signer?: ethers.Signer): ethers.Contract {
  const s = signer ?? getSigner();
  return new ethers.Contract(config.SYNTHEKE_CONTRACT, ABI, s);
}

export function getPactContractRead(): ethers.Contract {
  return new ethers.Contract(config.SYNTHEKE_CONTRACT, ABI, getProvider());
}

export async function fetchPactState(pactId: string): Promise<PactData> {
  const contract = getPactContractRead();
  const raw = await contract.getPactState(pactId);
  return {
    state: Number(raw.state),
    partyA: raw.partyA,
    partyB: raw.partyB,
    terms: {
      amount: raw.terms.amount,
      settlementAsset: raw.terms.settlementAsset,
      duration: raw.terms.duration,
      collateralRatio: raw.terms.collateralRatio,
      liquidationThreshold: raw.terms.liquidationThreshold,
      interestRate: raw.terms.interestRate,
      penaltyBps: raw.terms.penaltyBps,
      breachGraceBlocks: raw.terms.breachGraceBlocks,
      renegotiationWindow: raw.terms.renegotiationWindow,
      maxRenegotiationRounds: raw.terms.maxRenegotiationRounds,
      monitoredConditions: raw.terms.monitoredConditions,
    },
    activationBlock: raw.activationBlock,
    degradationCounter: raw.degradationCounter,
    consecutiveDegradation: raw.consecutiveDegradation,
    breachTier: Number(raw.breachTier),
    breachBlock: raw.breachBlock,
    attestationCount: raw.attestationCount,
    partyADeposited: raw.partyADeposited,
    partyBDeposited: raw.partyBDeposited,
    closed: raw.closed,
  };
}

export async function fetchActivePacts(): Promise<string[]> {
  const contract = getPactContractRead();
  const ids: string[] = await contract.getPactIds();
  const active: string[] = [];
  for (const id of ids) {
    try {
      const state = await fetchPactState(id);
      // Monitor everything except CLOSED(12), EXPIRED(13), TERMINATED(14)
      if (state.state < 12) {
        active.push(id);
      }
    } catch { /* skip pacts that fail to load */ }
  }
  return active;
}

export async function recordAttestation(
  signer: ethers.Wallet,
  pactId: string,
  conditionBitmap: bigint,
  recommendedState: number,
  dataHash: string,
  reason: string,
): Promise<ethers.TransactionReceipt> {
  const contract = getPactContract(signer);
  const tx = await contract.recordAttestation(
    pactId, conditionBitmap, recommendedState, dataHash, reason,
    { gasLimit: 500_000 },
  );
  return tx.wait();
}

export async function escalateUncuredBreach(
  signer: ethers.Wallet,
  pactId: string,
): Promise<ethers.TransactionReceipt> {
  const contract = getPactContract(signer);
  const tx = await contract.escalateUncuredBreach(pactId, { gasLimit: 300_000 });
  return tx.wait();
}

export async function resolvePact(
  signer: ethers.Wallet,
  pactId: string,
  settlementAmount: bigint,
  partyAPayout: bigint,
  partyBPayout: bigint,
  reasoningHash: string,
): Promise<ethers.TransactionReceipt> {
  const contract = getPactContract(signer);
  const tx = await contract.resolvePact(
    pactId, settlementAmount, partyAPayout, partyBPayout, reasoningHash,
    { gasLimit: 500_000 },
  );
  return tx.wait();
}

export async function finalizeSettlement(
  signer: ethers.Wallet,
  pactId: string,
): Promise<ethers.TransactionReceipt> {
  const contract = getPactContract(signer);
  const tx = await contract.finalizeSettlement(pactId, { gasLimit: 300_000 });
  return tx.wait();
}


