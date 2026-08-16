// Register the flagship pact's derived party keys in Postgres so the agent
// can perform party-side actions (self-heal + cure) after restarts.
import { ethers } from "ethers";
import pg from "pg";

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;
const PACTOBJ = ethers.getCreateAddress; // unused; keep imports light
const DESC = "DEX liquidity guardian: Provider A maintains Client B's ETH-USDT liquidity depth on the OKX DEX within 2 percent of target and alerts within 60 seconds of any deviation, verified against live OKX market data every 15 seconds";
const PACT_ID = process.argv[2];

if (!AGENT_KEY || !PACT_ID) {
  console.error("usage: node insert_keys.js <pactId> (AGENT_PRIVATE_KEY from env)");
  process.exit(1);
}

const descHash = ethers.keccak256(ethers.toUtf8Bytes(DESC));
const keyA = ethers.keccak256(ethers.toUtf8Bytes(`${AGENT_KEY}:pact:${descHash}:A`));
const keyB = ethers.keccak256(ethers.toUtf8Bytes(`${AGENT_KEY}:pact:${descHash}:B`));

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query(
  `INSERT INTO syntheke_pact_keys (pact_id, party_a_key, party_b_key)
   VALUES ($1, $2, $3)
   ON CONFLICT (pact_id) DO UPDATE SET party_a_key = EXCLUDED.party_a_key, party_b_key = EXCLUDED.party_b_key`,
  [PACT_ID, keyA, keyB],
);
await client.end();
console.log("keys registered for", PACT_ID.slice(0, 12), "| A:", new ethers.Wallet(keyA).address, "| B:", new ethers.Wallet(keyB).address);
