/**
 * OKX official x402 SDK integration (service-seller path).
 *
 * When OKX Developer Portal credentials are present, incoming payments are
 * verified and settled through the OKX facilitator using the official
 * @okxweb3/x402 SDK — the on-chain verification path OKX recommends for
 * A2MCP service sellers. The native direct EIP-3009 relay in x402.ts remains
 * the fallback for payers who settle peer-to-peer without the facilitator.
 *
 * Config: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE,
 *         OKX_FACILITATOR_BASE_URL (default https://www.okx.com)
 */
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { x402ResourceServer } from "@okxweb3/x402-core/server";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { config } from "./config";
import { logger } from "./logger";

type ResourceServer = InstanceType<typeof x402ResourceServer>;

let server: ResourceServer | null = null;
let initialized = false;
let lastError = "";

export function sdkEnabled(): boolean {
  return Boolean(config.OKX_API_KEY && config.OKX_SECRET_KEY && config.OKX_PASSPHRASE);
}

export async function initSdkX402(): Promise<boolean> {
  if (initialized) return true;
  if (!sdkEnabled()) {
    logger.info({ event: "okx_sdk_x402_skipped" }, "No OKX Developer Portal credentials — SDK path disabled, native EIP-3009 active");
    return false;
  }
  try {
    const facilitator = new OKXFacilitatorClient({
      apiKey: config.OKX_API_KEY,
      secretKey: config.OKX_SECRET_KEY,
      passphrase: config.OKX_PASSPHRASE,
      baseUrl: config.OKX_FACILITATOR_BASE_URL,
      syncSettle: true,
    });
    server = new x402ResourceServer(facilitator).register("eip155:196", new ExactEvmScheme());
    await server.initialize();
    initialized = true;
    const supported = server.getSupportedKind(2, "eip155:196", "exact");
    logger.info(
      { event: "okx_sdk_x402_initialized", supported },
      "OKX x402 SDK initialized — facilitator connected, exact scheme registered on eip155:196",
    );
    return true;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: "okx_sdk_x402_init_failed", err: lastError },
      "OKX x402 SDK init failed — native EIP-3009 path remains active",
    );
    return false;
  }
}

export function sdkInitialized(): boolean {
  return initialized;
}

export function sdkStatus(): { enabled: boolean; initialized: boolean; lastError: string } {
  return { enabled: sdkEnabled(), initialized, lastError };
}

/**
 * Verify + settle a payment through the OKX facilitator with the official SDK.
 * Returns { ok: false } on any failure — the caller falls back to the native
 * direct EIP-3009 settlement path.
 */
export async function sdkVerifyAndSettle(
  paymentPayload: Record<string, unknown>,
  requirements: Record<string, unknown>,
): Promise<{ ok: boolean; tx?: string; payer?: string; detail?: string }> {
  if (!server || !initialized) return { ok: false, detail: "sdk not initialized" };
  try {
    const verification = await server.verifyPayment(
      paymentPayload as never,
      requirements as never,
    );
    if (!verification.isValid) {
      return {
        ok: false,
        detail: verification.invalidMessage ?? verification.invalidReason ?? "invalid payment",
      };
    }
    const settlement = await server.settlePayment(
      paymentPayload as never,
      requirements as never,
    );
    if (!settlement.success) {
      return {
        ok: false,
        detail: settlement.errorMessage ?? settlement.errorReason ?? "settlement failed",
      };
    }
    return { ok: true, tx: settlement.transaction, payer: settlement.payer };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 160) : String(err) };
  }
}
