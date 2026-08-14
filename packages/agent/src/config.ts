import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  // Chain
  XLAYER_RPC_URL: z.string().default("https://testrpc.xlayer.tech"),
  XLAYER_CHAIN_ID: z.coerce.number().default(1952),

  // Agent identity
  AGENT_PRIVATE_KEY: z.string().min(1, "AGENT_PRIVATE_KEY is required"),
  AGENT_ADDRESS: z.string().optional(),
  DEMO_PARTY_B_KEY: z.string().optional(), // Demo wallet for Party B in create-pact flow

  // Mediator wallets (funded on testnet for on-chain voting)
  THEMIS_PRIVATE_KEY: z.string().optional(),
  THEMIS_ADDRESS: z.string().optional(),
  ATHENA_PRIVATE_KEY: z.string().optional(),
  ATHENA_ADDRESS: z.string().optional(),
  SOLON_PRIVATE_KEY: z.string().optional(),
  SOLON_ADDRESS: z.string().optional(),

  // Syntheke contracts (Phase 1 deployed addresses)
  SYNTHEKE_CONTRACT: z.string().default("0xE17c79c138bdE2ABfAfbBd2c3bBdD5511735B6E6"),
  /**
   * Previous pact-contract versions (comma-separated). Pacts on these
   * contracts still count toward all-time totals shown on the dashboard
   * ("treaties formed"). When the protocol is redeployed again, append the
   * old address here so the cumulative number keeps growing.
   */
  LEGACY_SYNTHEKE_CONTRACTS: z.string().default("0xe465405380E2E0f625028447E85917662E71ad42"),
  AGENT_REGISTRY: z.string().default("0x0101Ed240dA20FFDD95bca8E7408DAa889aE217B"),
  ESCROW_VAULT: z.string().default("0x5535cEc5D9CcBe77EBF99e33BE88dCE00047e142"),
  REPUTATION_REGISTRY: z.string().default("0x4256e57592aCB2120EAbC7f3E1eb82d9DddB855f"),
  TREASURY_VAULT: z.string().default("0xe23721edbf637e080a2ec70d89faa2f5956943d7"),
  MEDIATOR_STAKING: z.string().default("0xc3387efd100cc22b94ad7f68b55039daf0cf9caa"),
  ESCROW_VAULT_V2: z.string().default("0x13be96c8a71628d41e80755f4027aa51a9014e08"),
  TEST_USDC: z.string().default("0xfc8423bf39a5be5c38961ae83ef56e0f680374aa"),
  // Batch 2
  TEST_USDC_3009: z.string().default("0x9436031671c96726126fad7E72AAfB4e9ed2A92b"),
  MEDIATOR_VOTES: z.string().default("0x921691a7151ab1478045096B9a3ecE25C51A9D43"),
  ARTIFACT_REGISTRY: z.string().default("0x1c36bf1B975448BbABa9E9d3be828b45e3c466cb"),
  PREMIUM_PRICE_USDC: z.string().default("1"), // TUSD9 units for x402 premium endpoints
  OKX_AGENT_IDS: z.string().default("Themis:10920,Athena:10921,Solon:10922"),
  REPUTATION_ORACLE: z.string().default("0xfd61828f15fc98e1dcfe0dd6498abee6e003c1cf"),
  TREATY_SYNDICATE: z.string().default("0xc8665453576bdba28aa72abb12152fed639cff12"),
  MEDIATOR_STAKE_AMOUNT: z.string().default("0.003"), // OKB per mediator

  // Monitoring
  MONITOR_INTERVAL_SEC: z.coerce.number().default(15),
  DEGRADATION_CONSECUTIVE_THRESHOLD: z.coerce.number().default(3),
  ATTEST_BATCH_SIZE: z.coerce.number().default(10),

  // Oracles
  PYTH_ENDPOINT: z.string().default("https://hermes.pyth.network"),
  ONCHAINOS_ENABLED: z.coerce.boolean().default(true),

  // AI (Phase 3) — dual-model swarm: Claude (Themis) + DeepSeek (Athena/Solon)
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),

  // Database
  DATABASE_URL: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3002),
  AGENT_PUBLIC_URL: z.string().optional(),
  DEMO_MODE: z.coerce.boolean().default(false),
});

export const config = configSchema.parse(process.env);
export type Config = z.infer<typeof configSchema>;

// ── Mainnet profile (chain 196) ─────────────────────────────────────────
// X Layer mainnet deployment (contracts/script/DeployMainnet.s.sol,
// deployed 2026-08-14 from 0xE95489…6440De). When the agent runs with
// XLAYER_CHAIN_ID=196, every contract address switches to the mainnet set.
// Individual MAINNET_* env vars can override any single address.
const MAINNET_CONTRACTS: Record<string, string> = {
  SYNTHEKE_CONTRACT: process.env.MAINNET_SYNTHEKE_CONTRACT ?? "0x2693Bab68Fa76b9DF585416672c1363FA5b0fE7A",
  AGENT_REGISTRY: process.env.MAINNET_AGENT_REGISTRY ?? "0xc6cfFA52bDC4f5bc10f4d15805F8dD372b6507Cb",
  ESCROW_VAULT: process.env.MAINNET_ESCROW_VAULT ?? "0xAa2821e2aC393c9258FeC9dD3614358Db0f2994f",
  ESCROW_VAULT_V2: process.env.MAINNET_ESCROW_VAULT_V2 ?? "0xAa2821e2aC393c9258FeC9dD3614358Db0f2994f",
  REPUTATION_REGISTRY: process.env.MAINNET_REPUTATION_REGISTRY ?? "0x01C9E7f8B976f11090E32AeB248891Dd21980c76",
  REPUTATION_ORACLE: process.env.MAINNET_REPUTATION_ORACLE ?? "0x6D5A6d11E32Ca3fD137daE1958c7C7DD97788866",
  TREASURY_VAULT: process.env.MAINNET_TREASURY_VAULT ?? "0x8fFCC37900133e173b91ac7f1425152F646e6F8D",
  MEDIATOR_STAKING: process.env.MAINNET_MEDIATOR_STAKING ?? "0x1eB320CC08DD481559174d073C12106F8Dc52082",
  MEDIATOR_VOTES: process.env.MAINNET_MEDIATOR_VOTES ?? "0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c",
  ARTIFACT_REGISTRY: process.env.MAINNET_ARTIFACT_REGISTRY ?? "0xE2A1C0A534B2bcfAfc8269F4251968FB80104EA6",
  TREATY_SYNDICATE: process.env.MAINNET_TREATY_SYNDICATE ?? "0x2D22A0513DE808fbDd68A7d3F64792F8B72198D1",
  // Escrow asset on mainnet: real USDT (EscrowVaultV2 accepts any ERC20).
  TEST_USDC: process.env.MAINNET_ESCROW_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  TEST_USDC_3009: process.env.MAINNET_ESCROW_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736",
};

if (config.XLAYER_CHAIN_ID === 196) {
  Object.assign(config, MAINNET_CONTRACTS);
}
