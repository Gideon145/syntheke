/**
 * artifact.ts — Verifiable AI artifacts on-chain (Batch 3, Feature 7)
 *
 * Every AI artifact the protocol produces — negotiation moves, plain-English
 * contracts, mediation reasoning — is SHA-256 hashed and recorded in the
 * on-chain ArtifactRegistry. The dashboard verifies what it renders against
 * what's on chain: hash match = provable AI provenance, tamper-evident.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import ArtifactRegistryABI from "./abis/ArtifactRegistry.json" with { type: "json" };

export interface ChainArtifact {
  hash: string;
  kind: string;
  producer: string;
  version: number;
  timestamp: number;
}

export interface PactArtifacts {
  address: string;
  pactId: string;
  count: number;
  artifacts: ChainArtifact[];
}

function getRegistry(signerOrProvider: ethers.Wallet | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    config.ARTIFACT_REGISTRY,
    ArtifactRegistryABI as unknown as ethers.InterfaceAbi,
    signerOrProvider,
  );
}

/** Nonce-safe send (the monitor loop shares the owner wallet). */
async function sendOwnerTx(
  owner: ethers.Wallet,
  fn: () => Promise<ethers.TransactionResponse>,
  label: string,
): Promise<ethers.TransactionReceipt> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const tx = await fn();
      const receipt = await tx.wait();
      if (!receipt) throw new Error(`${label}: not confirmed`);
      return receipt;
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (
        msg.includes("NONCE_EXPIRED") || msg.includes("nonce too low") ||
        msg.includes("nonce has already been used") || msg.includes("REPLACEMENT_UNDERPRICED")
      ) {
        logger.warn({ event: "artifact_tx_retry", label, attempt, err: msg.slice(0, 100) });
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: all retries exhausted`);
}

/**
 * Record an AI artifact hash on-chain. Fire-and-forget from the owner wallet —
 * failures log a warning but never break the AI flow.
 */
export function recordArtifact(
  pactId: string,
  kind: string,
  hash: string,
  producer: string,
  version = 1,
): void {
  void (async () => {
    try {
      const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
      const owner = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
      const registry = getRegistry(owner);
      const receipt = await sendOwnerTx(
        owner,
        () => registry.recordArtifact(ethers.getBytes(pactId), kind, hash, producer, version),
        `artifact:${kind}`,
      );
      logger.info({ event: "artifact_recorded", pactId: pactId.slice(0, 10), kind, hash: hash.slice(0, 18), txHash: receipt.hash },
        `AI artifact on-chain: ${kind} ${hash.slice(0, 18)}…`);
      logActivity("artifact_recorded",
        `🔏 AI artifact verified on-chain: ${kind} (${producer} v${version})`,
        pactId, receipt.hash);
    } catch (err) {
      logger.warn({ event: "artifact_record_failed", pactId: pactId.slice(0, 10), kind, err },
        `Artifact record failed for ${kind}`);
    }
  })();
}

/** Read all artifacts for a pact from the chain. */
export async function getPactArtifacts(pactId: string): Promise<PactArtifacts> {
  try {
    const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
    const registry = getRegistry(provider);
    const bytes = ethers.getBytes(pactId);
    const [list, count] = await Promise.all([
      registry.getArtifacts(bytes) as Promise<Array<{
        hash: string; kind: string; producer: string; version: bigint; timestamp: bigint;
      }>>,
      registry.getArtifactCount(bytes) as Promise<bigint>,
    ]);
    return {
      address: config.ARTIFACT_REGISTRY,
      pactId,
      count: Number(count),
      artifacts: list.map(a => ({
        hash: String(a.hash),
        kind: String(a.kind),
        producer: String(a.producer),
        version: Number(a.version),
        timestamp: Number(a.timestamp),
      })),
    };
  } catch (err) {
    logger.warn({ event: "artifact_read_failed", pactId: pactId.slice(0, 10), err });
    return { address: config.ARTIFACT_REGISTRY, pactId, count: 0, artifacts: [] };
  }
}

/** Check whether a local hash exists on-chain (true = provable provenance). */
export async function verifyArtifactOnChain(pactId: string, hash: string): Promise<{ found: boolean; version: number }> {
  try {
    const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
    const registry = getRegistry(provider);
    const [found, version] = await registry.verifyArtifact(ethers.getBytes(pactId), hash) as [boolean, bigint];
    return { found, version: Number(version) };
  } catch {
    return { found: false, version: 0 };
  }
}
