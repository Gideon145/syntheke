/**
 * mainnet-smoke.ts — one-pact smoke test on X Layer mainnet (chain 196)
 *
 * Creates a single treaty through the real createPactFromNL flow against
 * the mainnet Syntheke deployment, then prints the pact id + a summary.
 * Does NOT boot the HTTP server or the monitor loop — one pact, then exit.
 *
 * Env requirements (in addition to the normal .env):
 *   XLAYER_RPC_URL=https://rpc.xlayer.tech
 *   XLAYER_CHAIN_ID=196
 *   AGENT_PRIVATE_KEY=<a mainnet wallet funded with OKB>
 *
 * Usage:
 *   $env:XLAYER_RPC_URL="https://rpc.xlayer.tech"
 *   $env:XLAYER_CHAIN_ID="196"
 *   $env:AGENT_PRIVATE_KEY="<key>"
 *   npx tsx scripts/mainnet-smoke.ts
 */

import { createPactFromNL } from "../src/create-pact";
import { config } from "../src/config";

async function main() {
  console.log(`Chain: ${config.XLAYER_CHAIN_ID} (mainnet profile active: ${config.XLAYER_CHAIN_ID === 196})`);
  console.log(`SynthekeContract: ${config.SYNTHEKE_CONTRACT}`);
  console.log(`EscrowVaultV2: ${config.ESCROW_VAULT_V2}`);
  console.log(`Escrow asset: ${config.TEST_USDC}`);

  const result = await createPactFromNL({
    partyADesc: "Liquidity provider (mainnet smoke test)",
    partyBDesc: "Vault client (mainnet smoke test)",
    description:
      "Provider A rebalances liquidity for Client B with 99.9% uptime; each missed cycle counts as a breach",
    adversarial: false,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("smoke test failed:", err);
  process.exitCode = 1;
});
