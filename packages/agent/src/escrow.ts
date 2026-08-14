/**
 * escrow.ts — REAL escrow custody (Batch 1)
 *
 * Wires EscrowVaultV2 + TestUSDC (6 decimals) into pact lifecycle:
 *   - creation: mint TestUSDC to both parties → approve vault → vault.deposit
 *   - arbitration settlement: distribute real funds per the mediator verdict
 *
 * The monitor agent is the vault owner; every movement emits an on-chain
 * event and TVL is verifiable at any time.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import { logActivity } from "./index";
import VaultABI from "./abis/EscrowVaultV2.json" with { type: "json" };

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export const TEST_USDC_DECIMALS = 6;

/** Terms `amount` is generated in 18-dec wei semantics; escrow token is 6-dec
 *  and reads naturally as whole USDC (e.g. amount 1e14 → 100 USDC). */
export function toUSDCUnits(amount18: bigint): bigint {
  return amount18 / 10n ** 6n;
}

/**
 * Send a tx from the owner wallet with nonce retries — the monitor loop
 * shares this wallet, so single-shot sends lose nonce races.
 */
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
        logger.warn({ event: "escrow_tx_retry", label, attempt, err: msg.slice(0, 100) });
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: all retries exhausted`);
}

function vaultContract(signer: ethers.Wallet): ethers.Contract {
  return new ethers.Contract(config.ESCROW_VAULT_V2, VaultABI as unknown as ethers.InterfaceAbi, signer);
}

function usdcContract(signer: ethers.Wallet): ethers.Contract {
  return new ethers.Contract(config.TEST_USDC, ERC20_ABI, signer);
}

/**
 * Deposit real TestUSDC escrow for one party of a pact.
 * Owner (agent wallet) pulls after the party approves.
 */
export async function depositEscrowReal(
  owner: ethers.Wallet,
  pactId: string,
  partyWallet: ethers.Wallet,
  amount: bigint,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const usdc = usdcContract(owner);
    // 1. Mint TestUSDC to the party (owner wallet, retried on nonce races)
    await sendOwnerTx(owner, () => usdc.mint(partyWallet.address, amount), "mintUSDC");

    // 2. Party approves the vault (fresh wallet — no contention)
    const partyUsdc = usdcContract(partyWallet);
    const approveTx = await partyUsdc.approve(config.ESCROW_VAULT_V2, amount);
    await approveTx.wait();

    // 3. Vault owner pulls the deposit (retried on nonce races)
    const vault = vaultContract(owner);
    const depTx = await sendOwnerTx(
      owner,
      () => vault.deposit(pactId, partyWallet.address, config.TEST_USDC, amount),
      "vaultDeposit",
    );

    logger.info({
      event: "escrow_deposited_real",
      pactId: pactId.slice(0, 10),
      party: partyWallet.address.slice(0, 10),
      amount: ethers.formatUnits(amount, TEST_USDC_DECIMALS),
    }, `Real escrow: ${ethers.formatUnits(amount, TEST_USDC_DECIMALS)} TestUSDC locked from ${partyWallet.address.slice(0, 10)}`);
    return { success: true, txHash: depTx.hash };
  } catch (err) {
    logger.warn({ event: "escrow_deposit_failed", pactId: pactId.slice(0, 10), err });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Distribute escrow on settlement per the mediator verdict payouts.
 */
export async function settleEscrow(
  owner: ethers.Wallet,
  pactId: string,
  partyA: string,
  amountA: bigint,
  partyB: string,
  amountB: bigint,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const vault = vaultContract(owner);
    const tx = await sendOwnerTx(
      owner,
      () => vault.settle(pactId, partyA, amountA, partyB, amountB),
      "vaultSettle",
    );
    logger.info({
      event: "escrow_settled",
      pactId: pactId.slice(0, 10),
      amountA: ethers.formatUnits(amountA, TEST_USDC_DECIMALS),
      amountB: ethers.formatUnits(amountB, TEST_USDC_DECIMALS),
      txHash: tx.hash,
    }, `Escrow settled: ${ethers.formatUnits(amountA, TEST_USDC_DECIMALS)} → A, ${ethers.formatUnits(amountB, TEST_USDC_DECIMALS)} → B`);
    logActivity(
      "escrow_settled",
      `Real escrow distributed — A received ${ethers.formatUnits(amountA, TEST_USDC_DECIMALS)} TestUSDC, B received ${ethers.formatUnits(amountB, TEST_USDC_DECIMALS)} TestUSDC`,
      pactId,
      tx.hash,
    );
    return { success: true, txHash: tx.hash };
  } catch (err) {
    logger.warn({ event: "escrow_settle_failed", pactId: pactId.slice(0, 10), err });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface EscrowState {
  address: string;
  token: string;
  tvl: string;
  tvlFormatted: string;
  settledCount: number;
  positions: Array<{
    pactId: string;
    partyA: string;
    partyB: string;
    amountA: string;
    amountB: string;
    amountAFormatted: string;
    amountBFormatted: string;
    totalDeposited: string;
    totalFormatted: string;
    settled: boolean;
  }>;
}

/**
 * Read vault state for the API + dashboard.
 */
export async function getEscrowState(_pactIds: string[] = []): Promise<EscrowState> {
  const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
  const vault = new ethers.Contract(config.ESCROW_VAULT_V2, VaultABI as unknown as ethers.InterfaceAbi, provider);
  const [tvl, settledCount, pactIds] = await Promise.all([
    vault.getTVL(),
    vault.settledCount(),
    vault.getPactIds(),
  ]);

  const positions: EscrowState["positions"] = [];
  for (const pid of (pactIds as string[]).slice(-25)) {
    try {
      const p = await vault.getPosition(pid);
      if (!p || p.totalDeposited === 0n) continue;
      positions.push({
        pactId: pid,
        partyA: p.partyA,
        partyB: p.partyB,
        amountA: p.amountA.toString(),
        amountB: p.amountB.toString(),
        amountAFormatted: ethers.formatUnits(p.amountA, TEST_USDC_DECIMALS),
        amountBFormatted: ethers.formatUnits(p.amountB, TEST_USDC_DECIMALS),
        totalDeposited: p.totalDeposited.toString(),
        totalFormatted: ethers.formatUnits(p.totalDeposited, TEST_USDC_DECIMALS),
        settled: p.settled,
      });
    } catch { /* skip */ }
  }

  return {
    address: config.ESCROW_VAULT_V2,
    token: config.TEST_USDC,
    tvl: tvl.toString(),
    tvlFormatted: ethers.formatUnits(tvl, TEST_USDC_DECIMALS),
    settledCount: Number(settledCount),
    positions,
  };
}
