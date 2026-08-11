import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  // Chain
  XLAYER_RPC_URL: z.string().default("https://testrpc.xlayer.tech"),
  XLAYER_CHAIN_ID: z.coerce.number().default(1952),

  // Agent identity
  AGENT_PRIVATE_KEY: z.string().min(1, "AGENT_PRIVATE_KEY is required"),
  AGENT_ADDRESS: z.string().optional(),

  // Syntheke contracts (Phase 1 deployed addresses)
  SYNTHEKE_CONTRACT: z.string().default("0xe465405380E2E0f625028447E85917662E71ad42"),
  AGENT_REGISTRY: z.string().default("0x0101Ed240dA20FFDD95bca8E7408DAa889aE217B"),
  ESCROW_VAULT: z.string().default("0x5535cEc5D9CcBe77EBF99e33BE88dCE00047e142"),
  REPUTATION_REGISTRY: z.string().default("0x4256e57592aCB2120EAbC7f3E1eb82d9DddB855f"),

  // Monitoring
  MONITOR_INTERVAL_SEC: z.coerce.number().default(15),
  DEGRADATION_CONSECUTIVE_THRESHOLD: z.coerce.number().default(3),
  ATTEST_BATCH_SIZE: z.coerce.number().default(10),

  // Oracles
  PYTH_ENDPOINT: z.string().default("https://hermes.pyth.network"),
  ONCHAINOS_ENABLED: z.coerce.boolean().default(false),

  // AI (Phase 3)
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_BASE_URL: z.string().default("https://api.openai.com/v1"),

  // Database
  DATABASE_URL: z.string().default("postgres://syntheke:syntheke@localhost:5432/syntheke"),

  // Server
  PORT: z.coerce.number().default(3002),
  DEMO_MODE: z.coerce.boolean().default(false),
});

export const config = configSchema.parse(process.env);
export type Config = z.infer<typeof configSchema>;
