/**
 * x402.ts — OKX Agent Payments Protocol server side (Batch 2, Feature 4)
 *
 * Syntheke's premium API endpoints are payment-gated with the x402 protocol
 * ("exact" scheme, EIP-3009 transfer-with-authorization):
 *
 *   1. Client requests a premium resource without payment
 *      → HTTP 402 with a base64-encoded `PAYMENT-REQUIRED` header (x402 v2)
 *   2. Client signs an EIP-3009 authorization (OKX onchainos CLI does this
 *      via `payment pay` / `pay-local`) and replays the request with the
 *      `PAYMENT-SIGNATURE` header
 *   3. Server verifies + settles the authorization on-chain (calls
 *      transferWithAuthorization from payer → treasury), then serves the
 *      resource and returns a base64 `PAYMENT-RESPONSE` header
 *
 * Asset: TestUSDC3009 on X Layer testnet (chain 1952), 6 decimals.
 */

import { ethers } from "ethers";
import { config } from "./config";
import { logger } from "./logger";
import TestUSDC3009ABI from "./abis/TestUSDC3009.json" with { type: "json" };

export interface PaymentOffer {
  x402Version: number;
  resource: { method: string; path: string };
  accepts: Array<{
    scheme: "exact";
    network: string;
    asset: string;
    payTo: string;
    amount: string;
    maxPrice: string;
    maxTimeoutSeconds?: number;
    extra: {
      assetTransferMethod?: "eip-3009";
      name: string;    // EIP-712 domain name the payer signs
      version: string; // EIP-712 domain version
    } & Record<string, unknown>;
  }>;
}

export interface Settlement {
  payer: string;
  amount: string;
  txHash: string;
  resource: string;
  timestamp: number;
}

// Treasury = the agent wallet itself (payment collector)
const TREASURY = config.AGENT_ADDRESS ?? (config.AGENT_PRIVATE_KEY ? ethers.computeAddress(config.AGENT_PRIVATE_KEY) : "");

/** In-memory payments log (persisted via activity log too). */
const paymentsLog: Settlement[] = [];

export function priceUnits(): bigint {
  const usd = Number(config.PREMIUM_PRICE_USDC);
  if (!Number.isFinite(usd) || usd <= 0) return 1_000_000n; // 1 TUSD9
  return BigInt(Math.round(usd * 1e6));
}

/** Settlements from previous deployments (kept accurate via env). */
export function settledBaseline(): number {
  const n = Number(config.X402_SETTLED_BASELINE);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Marketplace service fee units (OKX.AI ASP). 0 = free endpoint. */
export function servicePriceUnits(): bigint {
  const usd = Number(config.SERVICE_PRICE_USD);
  if (!Number.isFinite(usd) || usd <= 0) return 0n;
  return BigInt(Math.round(usd * 1e6));
}

function x402Asset(): string {
  return config.X402_ASSET ?? config.TEST_USDC_3009;
}

function x402Domain(): { name: string; version: string } {
  return {
    name: config.X402_DOMAIN_NAME ?? "TestUSD3009",
    version: config.X402_DOMAIN_VERSION ?? "2",
  };
}

/**
 * Build the x402 v2 payment-required payload for a paid resource.
 */
export function buildPaymentOffer(method: string, path: string, units: bigint): PaymentOffer {
  const amount = units.toString();
  const domain = x402Domain();
  return {
    x402Version: 2,
    resource: { method, path },
    accepts: [
      {
        scheme: "exact",
        network: `eip155:${config.XLAYER_CHAIN_ID}`,
        asset: x402Asset(),
        payTo: TREASURY,
        amount,
        maxPrice: amount,
        maxTimeoutSeconds: 300,
        extra: {
          // Flat fields — our own clients (factory, MCP) read these.
          name: domain.name,
          version: domain.version,
          assetTransferMethod: "eip-3009",
          // Nested fields — the official OKX x402 SDK reads extra.eip712.*.
          eip712: {
            name: domain.name,
            version: domain.version,
          },
        },
      },
    ],
  };
}

/** HTTP 402 response helper. */
export function respond402(res: import("http").ServerResponse, method: string, path: string, units: bigint): void {
  const offer = buildPaymentOffer(method, path, units);
  const b64 = Buffer.from(JSON.stringify(offer)).toString("base64");
  res.writeHead(402, {
    "Content-Type": "application/json",
    "PAYMENT-REQUIRED": b64,
  });
  res.end(JSON.stringify({ error: "payment_required", ...offer }));
}

interface EIP3009Fields {
  from: string;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: string; // bytes32 hex
  v: number;
  r: string;
  s: string;
}

/**
 * Parse a PAYMENT-SIGNATURE header (base64 JSON, x402 v2) into EIP-3009
 * fields. Tolerant of nesting (payload/authorization/signature wrappers)
 * so any OKX CLI output shape works.
 */
function parsePaymentHeader(header: string | undefined): EIP3009Fields | null {
  if (!header) return null;
  try {
    const raw = Buffer.from(header.trim(), "base64").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Flatten known wrappers
    const collect = (obj: unknown, depth = 0): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      if (!obj || typeof obj !== "object" || depth > 6) return out;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, collect(v, depth + 1));
        out[k] = v;
      }
      return out;
    };

    const flat = collect(parsed);
    const getNum = (key: string): bigint | null => {
      const v = flat[key];
      if (typeof v === "string") {
        const n = v.startsWith("0x") ? BigInt(v) : BigInt(v);
        return n;
      }
      if (typeof v === "number") return BigInt(Math.round(v));
      return null;
    };
    const getStr = (key: string): string | null => {
      const v = flat[key];
      return typeof v === "string" ? v : null;
    };

    const from = getStr("from");
    const value = getNum("value") ?? getNum("amount");
    const validAfter = getNum("validAfter");
    const validBefore = getNum("validBefore") ?? getNum("deadline");
    const nonce = getStr("nonce");

    // Signature comes either as split r/s/v or as a single 65-byte hex string
    let r = getStr("r");
    let s = getStr("s");
    let v = getNum("v");
    if (!r || !s || v === null) {
      const sig = getStr("signature");
      if (sig && sig.length >= 132) {
        const body = sig.startsWith("0x") ? sig.slice(2) : sig;
        r = "0x" + body.slice(0, 64);
        s = "0x" + body.slice(64, 128);
        const rawV = parseInt(body.slice(128, 130), 16);
        v = BigInt(rawV < 27 ? rawV + 27 : rawV);
      }
    }

    if (!from || value === null || validAfter === null || validBefore === null || !nonce || v === null || !r || !s) {
      return null;
    }
    const vInt = Number(v) < 27 ? Number(v) + 27 : Number(v);
    return {
      from,
      value,
      validAfter,
      validBefore,
      nonce: nonce.startsWith("0x") ? nonce : "0x" + nonce,
      v: vInt,
      r: r.startsWith("0x") ? r : "0x" + r,
      s: s.startsWith("0x") ? s : "0x" + s,
    };
  } catch {
    return null;
  }
}

/**
 * Verify the EIP-3009 authorization locally (recover signer) and settle it
 * on-chain: the agent wallet (relayer) submits transferWithAuthorization so
 * the payer's funds move to the treasury.
 */
export async function settlePayment(
  header: string | undefined,
  resourcePath: string,
  units: bigint,
): Promise<Settlement | null> {
  const fields = parsePaymentHeader(header);
  if (!fields) return null;

  const expected = units;
  if (fields.value < expected) {
    logger.warn({ event: "x402_underpaid", got: fields.value.toString(), want: expected.toString() },
      "Payment below required amount");
    return null;
  }

  // ── OKX official SDK path (facilitator-verified + settled) ──────────────
  const { sdkInitialized, sdkVerifyAndSettle } = await import("./sdk-x402");
  if (sdkInitialized()) {
    const offer = buildPaymentOffer("POST", resourcePath, units).accepts[0];
    const sdkResult = await sdkVerifyAndSettle(
      {
        from: fields.from,
        value: fields.value.toString(),
        validAfter: fields.validAfter.toString(),
        validBefore: fields.validBefore.toString(),
        nonce: fields.nonce,
        v: fields.v,
        r: fields.r,
        s: fields.s,
      },
      {
        x402Version: 2,
        resource: { method: "POST", path: resourcePath },
        ...offer,
      },
    );
    if (sdkResult.ok) {
      const settlement: Settlement = {
        payer: sdkResult.payer ?? fields.from,
        amount: expected.toString(),
        txHash: sdkResult.tx ?? "okx-facilitator",
        resource: resourcePath,
        timestamp: Date.now(),
      };
      paymentsLog.push(settlement);
      logger.info({
        event: "x402_sdk_settled",
        payer: settlement.payer,
        amount: settlement.amount,
        txHash: settlement.txHash,
      }, `x402 payment settled via OKX SDK: ${ethers.formatUnits(settlement.amount, 6)} USDT from ${settlement.payer}`);
      return settlement;
    }
    logger.warn({ event: "sdk_verify_failed", detail: sdkResult.detail },
      "OKX SDK verification failed — falling back to native EIP-3009 settlement");
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
    const token = new ethers.Contract(
      x402Asset(),
      TestUSDC3009ABI as unknown as ethers.InterfaceAbi,
      provider,
    );

    // Local verification: recover signer from EIP-712 digest
    const DOMAIN = await token.DOMAIN_SEPARATOR();
    const TYPEHASH = await token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH();
    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
        [TYPEHASH, fields.from, TREASURY, expected, fields.validAfter, fields.validBefore, fields.nonce],
      ),
    );
    const digest = ethers.keccak256(
      ethers.concat([ethers.toUtf8Bytes("\x19\x01"), DOMAIN, structHash]),
    );
    const recovered = ethers.recoverAddress(
      digest,
      { r: fields.r, s: fields.s, v: fields.v },
    );
    if (recovered.toLowerCase() !== fields.from.toLowerCase()) {
      logger.warn({ event: "x402_bad_signature", recovered }, "EIP-3009 signature does not match payer");
      return null;
    }

    // Settle on-chain as relayer (agent wallet) — nonce-safe retries because
    // the monitor loop shares this wallet (learned in Batch 2).
    const signer = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
    const writer = token.connect(signer) as ethers.Contract;
    let receipt: ethers.TransactionReceipt | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 6 && !receipt; attempt++) {
      try {
        const tx = await writer.transferWithAuthorization(
          fields.from,
          TREASURY,
          expected,
          fields.validAfter,
          fields.validBefore,
          fields.nonce,
          fields.v,
          fields.r,
          fields.s,
        );
        receipt = await tx.wait();
        if (!receipt) throw new Error("settlement not confirmed");
      } catch (err) {
        lastErr = err;
        const msg = (err as Error).message ?? "";
        if (
          msg.includes("NONCE_EXPIRED") || msg.includes("nonce too low") ||
          msg.includes("nonce has already been used") || msg.includes("REPLACEMENT_UNDERPRICED")
        ) {
          logger.warn({ event: "x402_settle_retry", attempt, err: msg.slice(0, 100) });
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        throw err;
      }
    }
    if (!receipt) throw new Error(`settlement failed: ${String(lastErr).slice(0, 120)}`);
    if (receipt.status !== 1) {
      logger.warn({ event: "x402_settle_reverted", txHash: receipt.hash }, "Payment settlement reverted");
      return null;
    }

    const settlement: Settlement = {
      payer: fields.from,
      amount: expected.toString(),
      txHash: receipt.hash,
      resource: resourcePath,
      timestamp: Date.now(),
    };
    paymentsLog.push(settlement);
    logger.info({
      event: "x402_payment_settled",
      payer: settlement.payer,
      amount: settlement.amount,
      txHash: settlement.txHash,
    }, `x402 payment settled: ${ethers.formatUnits(settlement.amount, 6)} TUSD9 from ${settlement.payer}`);
    return settlement;
  } catch (err) {
    logger.warn({ event: "x402_settle_failed", err }, "Payment settlement failed");
    return null;
  }
}

/** Build the PAYMENT-RESPONSE header value (base64 JSON). */
export function paymentResponseHeader(s: Settlement): string {
  return Buffer.from(JSON.stringify({
    status: "settled",
    transaction: s.txHash,
    amount: s.amount,
    payer: s.payer,
  })).toString("base64");
}

export function getPaymentsState(): {
  enabled: boolean;
  asset: string;
  price: string;
  priceFormatted: string;
  treasury: string;
  network: string;
  settledCount: number;
  totalCollected: string;
  recent: Settlement[];
} {
  const total = paymentsLog.reduce((acc, p) => acc + BigInt(p.amount), 0n);
  // Mainnet service settlements are priced by SERVICE_PRICE_USD (0.1);
  // testnet premium endpoints use PREMIUM_PRICE_USDC. The display price
  // follows whichever rail this instance settles.
  const serviceUnits = servicePriceUnits();
  const priceUnitsForDisplay = serviceUnits > 0n ? serviceUnits : priceUnits();
  return {
    enabled: true,
    asset: config.TEST_USDC_3009,
    price: priceUnitsForDisplay.toString(),
    priceFormatted: ethers.formatUnits(priceUnitsForDisplay, 6),
    treasury: TREASURY,
    network: `eip155:${config.XLAYER_CHAIN_ID}`,
    settledCount: settledBaseline() + paymentsLog.length,
    totalCollected: total.toString(),
    recent: paymentsLog.slice(-10),
  };
}
