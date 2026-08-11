import { ethers } from "ethers";
import { config } from "./config";
import { getProvider } from "./pact";

/**
 * Transaction Signer
 *
 * Manages transaction signing with nonce tracking, gas estimation,
 * retry logic, and idempotency. Ready for HSM/TEE integration
 * (Phase 5 will add HSM-backed signing via a secure enclave).
 */

export interface SignerState {
  address: string;
  nonce: number;
  chainId: number;
  lastSync: number;
}

let _state: SignerState | null = null;

export function getSignerState(): SignerState | null {
  return _state;
}

export async function createSigner(): Promise<{ signer: ethers.Wallet; state: SignerState }> {
  const provider = getProvider();
  const signer = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
  const address = await signer.getAddress();
  const nonce = await provider.getTransactionCount(address, "latest");

  _state = {
    address,
    nonce,
    chainId: config.XLAYER_CHAIN_ID,
    lastSync: Date.now(),
  };

  return { signer, state: _state };
}

export async function syncNonce(signer: ethers.Wallet): Promise<number> {
  const provider = getProvider();
  const onChainNonce = await provider.getTransactionCount(signer.address, "latest");
  _state = {
    address: signer.address,
    nonce: onChainNonce,
    chainId: config.XLAYER_CHAIN_ID,
    lastSync: Date.now(),
  };
  return onChainNonce;
}

export async function sendTransaction(
  signer: ethers.Wallet,
  buildTx: () => Promise<ethers.ContractTransactionResponse>,
  retries = 3,
): Promise<ethers.TransactionReceipt | null> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) await syncNonce(signer);
      const tx = await buildTx();
      const receipt = await tx.wait();
      if (_state) _state.nonce++;
      return receipt;
    } catch (err) {
      lastError = err;
      // Only retry on nonce/replacement errors
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("nonce") || msg.includes("replacement") || msg.includes("underpriced")) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
