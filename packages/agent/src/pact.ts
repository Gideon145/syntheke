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
  cureDeadline: bigint;
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

/**
 * Per-pact contract routing.
 * New pacts live on SYNTHEKE_CONTRACT; pacts from earlier deployments live
 * on the comma-separated LEGACY_SYNTHEKE_CONTRACTS addresses. The cache is
 * keyed by pactId and resolved lazily, so redeploying the protocol never
 * orphans treaty history.
 */
const pactOwnerCache = new Map<string, string>();

export function legacyContractAddresses(): string[] {
  return (config.LEGACY_SYNTHEKE_CONTRACTS ?? "")
    .split(",")
    .map(a => a.trim())
    .filter(a => /^0x[0-9a-fA-F]{40}$/.test(a));
}

function contractAt(
  address: string,
  signerOrProvider: ethers.Signer | ethers.Provider,
): ethers.Contract {
  return new ethers.Contract(address, ABI, signerOrProvider);
}

async function resolvePactOwner(pactId: string): Promise<string> {  const cached = pactOwnerCache.get(pactId);
  if (cached) return cached;
  const provider = getProvider();
  const candidates = [config.SYNTHEKE_CONTRACT, ...legacyContractAddresses()];
  for (const addr of candidates) {
    try {
      const raw = await contractAt(addr, provider).getPactState(pactId);
      if (
        raw.partyA !== ethers.ZeroAddress ||
        raw.partyB !== ethers.ZeroAddress ||
        Number(raw.state) !== 0
      ) {
        pactOwnerCache.set(pactId, addr);
        return addr;
      }
    } catch { /* pact not on this contract */ }
  }
  return config.SYNTHEKE_CONTRACT;
}

/** Contract instance bound to whichever deployment owns the given pact. */
export async function getPactContractFor(
  pactId: string,
  signerOrProvider: ethers.Signer | ethers.Provider,
): Promise<ethers.Contract> {
  return contractAt(await resolvePactOwner(pactId), signerOrProvider);
}

export async function fetchPactState(pactId: string): Promise<PactData> {
  const owner = await resolvePactOwner(pactId);
  const contract = contractAt(owner, getProvider());
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
    cureDeadline: raw.cureDeadline,
    attestationCount: raw.attestationCount,
    partyADeposited: raw.partyADeposited,
    partyBDeposited: raw.partyBDeposited,
    closed: raw.closed,
  };
}

export async function fetchAllPactIds(): Promise<string[]> {
  const provider = getProvider();
  const candidates = [config.SYNTHEKE_CONTRACT, ...legacyContractAddresses()];
  const ids = new Set<string>();
  for (const addr of candidates) {
    try {
      const contract = contractAt(addr, provider);
      for (const id of await contract.getPactIds()) ids.add(id);
    } catch { /* skip unreachable contract */ }
  }
  return [...ids];
}

export async function fetchActivePacts(): Promise<string[]> {
  const ids = await fetchAllPactIds();
  const active: string[] = [];
  const zeroAddr = "0x" + "0".repeat(40);
  for (const id of ids) {
    try {
      const state = await fetchPactState(id);
      // Skip DRAFT (0 — no counterparty yet) and fully closed pacts
      // (CLOSED 12 / EXPIRED 13 / TERMINATED 14). A pact must also have a
      // joined Party B before the monitor attests it.
      if (state.state >= 1 && state.state < 12 &&
          state.partyB.toLowerCase() !== zeroAddr) {
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
  const contract = contractAt(await resolvePactOwner(pactId), signer);
  const tx = await contract.recordAttestation(
    pactId, conditionBitmap, recommendedState, dataHash, reason,
    { gasLimit: 500_000 },
  );
  return tx.wait();
}

/**
 * Record a breach WITH attribution (V3+ contracts). Returns null when the
 * owning contract predates breach attribution — the attestation alone then
 * carries the state transition.
 */
export async function recordBreach(
  signer: ethers.Wallet,
  pactId: string,
  conditionBitmap: bigint,
  reason: string,
  breachingParty: string,
): Promise<ethers.TransactionReceipt | null> {
  const contract = contractAt(await resolvePactOwner(pactId), signer);
  if (!contract.interface.hasFunction("recordBreach")) return null;
  const tx = await contract.recordBreach(
    pactId, conditionBitmap, reason, breachingParty,
    { gasLimit: 500_000 },
  );
  return tx.wait();
}

export async function escalateUncuredBreach(
  signer: ethers.Wallet,
  pactId: string,
): Promise<ethers.TransactionReceipt> {
  const contract = contractAt(await resolvePactOwner(pactId), signer);
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
  const contract = contractAt(await resolvePactOwner(pactId), signer);
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
  const contract = contractAt(await resolvePactOwner(pactId), signer);
  const tx = await contract.finalizeSettlement(pactId, { gasLimit: 300_000 });
  return tx.wait();
}


