import { ethers } from "ethers";
import { config } from "../config";
import { logger } from "../logger";

/**
 * OKX Wallet Integration
 *
 * Handles escrow deposits, settlement payouts, and token operations
 * through the OKX Wallet ecosystem on X Layer.
 *
 * Settlement flow:
 *   1. Pact reaches SETTLING state on SynthekeContract
 *   2. Monitor agent computes payout amounts
 *   3. This module constructs and signs the settlement transaction
 *   4. Transaction sent to EscrowVault.release() or .slash()
 *
 * For Phase 5, escrow operations use direct contract calls.
 * Future: integrate OKX Wallet SDK for MPC/TEE-backed signing.
 */

// ──── Token Addresses on X Layer ─────────────────────────

export const XLAYER_TOKENS: Record<string, string> = {
  OKB: "0x0000000000000000000000000000000000000000", // Native
  USDT: "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USD₮0 on X Layer
  USDC: "0x542eEC0232e5DF3C96E9E6a7Bf1D2C0c606A1286",
  WETH: "0xE62cBb29cFEbA319DfB6ab557763475A384f3F8D",
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

const ESCROW_VAULT_ABI = [
  "function deposit(bytes32 pactId, address party, address asset, uint256 amount) external",
  "function release(bytes32 pactId, address recipient, uint256 amount) external",
  "function refund(bytes32 pactId, address party, uint256 amount) external",
  "function slash(bytes32 pactId, address from, address to, uint256 amount) external",
  "function getPosition(bytes32 pactId) view returns (tuple(bytes32,address,address,address,uint256,uint256,uint256,bool,bool))",
];

// ──── Wallet Client ──────────────────────────────────────

export class OKXWalletClient {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private escrowContract: ethers.Contract;

  constructor(signer: ethers.Wallet) {
    this.provider = signer.provider as ethers.JsonRpcProvider;
    this.signer = signer;
    this.escrowContract = new ethers.Contract(
      config.ESCROW_VAULT,
      ESCROW_VAULT_ABI,
      signer,
    );
  }

  // ──── Escrow ──────────────────────────────────────────

  /**
   * Deposit funds into escrow for a pact.
   * Requires prior ERC-20 approval to EscrowVault.
   */
  async depositEscrow(
    pactId: string,
    party: string,
    asset: string,
    amount: bigint,
  ): Promise<ethers.TransactionReceipt | null> {
    if (asset !== ethers.ZeroAddress) {
      // ERC-20: approve EscrowVault first
      const token = new ethers.Contract(asset, ERC20_ABI, this.signer);
      const approveTx = await token.approve(config.ESCROW_VAULT, amount);
      await approveTx.wait();
      logger.info({ event: "escrow_approval", asset, amount: amount.toString() });
    }

    try {
      const tx = await this.escrowContract.deposit(pactId, party, asset, amount, {
        value: asset === ethers.ZeroAddress ? amount : 0n,
      });
      const receipt = await tx.wait();
      logger.info({
        event: "escrow_deposited",
        pactId: pactId.slice(0, 10),
        party,
        amount: amount.toString(),
        txHash: receipt?.hash,
      }, `Escrow deposited: ${amount} for pact ${pactId.slice(0, 10)}`);
      return receipt;
    } catch (err) {
      logger.error({ event: "escrow_deposit_failed", error: String(err) });
      return null;
    }
  }

  /**
   * Release escrow funds to a recipient on settlement.
   */
  async releaseFunds(
    pactId: string,
    recipient: string,
    amount: bigint,
  ): Promise<ethers.TransactionReceipt | null> {
    try {
      const tx = await this.escrowContract.release(pactId, recipient, amount);
      const receipt = await tx.wait();
      logger.info({
        event: "escrow_released",
        pactId: pactId.slice(0, 10),
        recipient,
        amount: amount.toString(),
        txHash: receipt?.hash,
      }, `Escrow released: ${amount} to ${recipient}`);
      return receipt;
    } catch (err) {
      logger.error({ event: "escrow_release_failed", error: String(err) });
      return null;
    }
  }

  /**
   * Slash breaching party's escrow → counterparty.
   */
  async slashEscrow(
    pactId: string,
    from: string,
    to: string,
    amount: bigint,
  ): Promise<ethers.TransactionReceipt | null> {
    try {
      const tx = await this.escrowContract.slash(pactId, from, to, amount);
      const receipt = await tx.wait();
      logger.info({
        event: "escrow_slashed",
        pactId: pactId.slice(0, 10),
        from,
        to,
        amount: amount.toString(),
        txHash: receipt?.hash,
      }, `Escrow slashed: ${amount} from ${from} to ${to}`);
      return receipt;
    } catch (err) {
      logger.error({ event: "escrow_slash_failed", error: String(err) });
      return null;
    }
  }

  /**
   * Refund escrow on mutual termination.
   */
  async refundEscrow(
    pactId: string,
    party: string,
    amount: bigint,
  ): Promise<ethers.TransactionReceipt | null> {
    try {
      const tx = await this.escrowContract.refund(pactId, party, amount);
      const receipt = await tx.wait();
      logger.info({ event: "escrow_refunded", pactId: pactId.slice(0, 10), party });
      return receipt;
    } catch (err) {
      logger.error({ event: "escrow_refund_failed", error: String(err) });
      return null;
    }
  }

  // ──── Queries ──────────────────────────────────────────

  async getEscrowPosition(pactId: string): Promise<{
    totalDeposited: bigint;
    amountA: bigint;
    amountB: bigint;
    settled: boolean;
  }> {
    const pos = await this.escrowContract.getPosition(pactId);
    return {
      totalDeposited: pos.totalDeposited,
      amountA: pos.amountA,
      amountB: pos.amountB,
      settled: pos.settled,
    };
  }

  async getTokenBalance(token: string, address: string): Promise<bigint> {
    if (token === ethers.ZeroAddress) {
      return this.provider.getBalance(address);
    }
    const erc20 = new ethers.Contract(token, ERC20_ABI, this.provider);
    return erc20.balanceOf(address);
  }

  // ──── OKX DEX Settlement ───────────────────────────────

  /**
   * Route settlement through OKX DEX for optimal execution.
   * Generates volume for the Launch Grant ($200K available).
   */
  async settleViaOKXDEX(
    sellToken: string,
    buyToken: string,
    amount: bigint,
    recipient: string,
  ): Promise<ethers.TransactionReceipt | null> {
    // Phase 5: integrate with OKX DEX Aggregator API
    // POST /api/v5/dex/aggregator/swap → get tx data → sign → broadcast
    try {
      const okxDexUrl = "https://www.okx.com/api/v5/dex/aggregator/swap";
      const params = new URLSearchParams({
        chainId: String(config.XLAYER_CHAIN_ID),
        fromTokenAddress: sellToken,
        toTokenAddress: buyToken,
        amount: amount.toString(),
        slippage: "0.5",
        userWalletAddress: this.signer.address,
      });

      const resp = await fetch(`${okxDexUrl}?${params}`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        logger.warn({ event: "okx_dex_unavailable", status: resp.status });
        return null;
      }

      const data = await resp.json() as { data?: Array<{ tx?: { to: string; data: string; value: string } }> };
      const swapData = data.data?.[0];
      if (!swapData?.tx) return null;

      const tx = await this.signer.sendTransaction({
        to: swapData.tx.to,
        data: swapData.tx.data,
        value: BigInt(swapData.tx.value ?? "0"),
        gasLimit: 500_000,
      });

      const receipt = await tx.wait();
      logger.info({
        event: "okx_dex_swap",
        sellToken,
        buyToken,
        amount: amount.toString(),
        txHash: receipt?.hash,
      }, `OKX DEX swap: ${amount} ${sellToken} → ${buyToken}`);
      return receipt;
    } catch (err) {
      logger.warn({ event: "okx_dex_swap_failed", error: String(err) });
      return null;
    }
  }
}

/**
 * Format token amount with correct decimals for display.
 */
export async function formatTokenAmount(
  provider: ethers.JsonRpcProvider,
  token: string,
  amount: bigint,
): Promise<string> {
  if (token === ethers.ZeroAddress) {
    return ethers.formatEther(amount) + " OKB";
  }
  try {
    const erc20 = new ethers.Contract(token, ERC20_ABI, provider);
    const decimals: number = await erc20.decimals();
    return ethers.formatUnits(amount, decimals);
  } catch {
    return amount.toString();
  }
}
