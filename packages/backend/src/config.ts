import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default("postgres://syntheke:syntheke@localhost:5432/syntheke"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  XLAYER_RPC_URL: z.string().default("http://localhost:8545"),
  XLAYER_CHAIN_ID: z.coerce.number().default(1952),
  MONITOR_AGENT_KEY: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  PYTH_ENDPOINT: z.string().default("https://hermes.pyth.network"),
});

export const config = configSchema.parse(process.env);
export type Config = z.infer<typeof configSchema>;
