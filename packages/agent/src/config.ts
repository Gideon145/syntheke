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
