import { createPublicClient, http, parseAbi } from "viem";

const XLAYER_RPC = process.env.XLAYER_RPC_URL || "http://localhost:8545";

const SYNTKEKE_ABI = parseAbi([
  "event DraftCreated(bytes32 indexed pactId, address indexed partyA)",
  "event Negotiating(bytes32 indexed pactId, address indexed partyB, uint256 round)",
  "event Proposed(bytes32 indexed pactId, bytes32 termsHash)",
  "event Activated(bytes32 indexed pactId, uint256 amount, uint256 duration)",
  "event AttestationRecorded(bytes32 indexed pactId, uint256 cycleNumber, uint256 bitmap, uint8 state)",
  "event Degrading(bytes32 indexed pactId, uint256 bitmap, string reason)",
  "event Breached(bytes32 indexed pactId, uint8 tier, string reason)",
  "event Closed(bytes32 indexed pactId)",
  "event ReputationUpdated(address indexed agent, bytes32 indexed pactId, string eventType)",
]);

async function main() {
  const SYNTKEKE_ADDRESS = process.env.SYNTKEKE_ADDRESS;
  if (!SYNTKEKE_ADDRESS) {
    console.error("SYNTKEKE_ADDRESS not set");
    process.exit(1);
  }

  const client = createPublicClient({
    transport: http(XLAYER_RPC),
  });

  console.log(`🔍 Syntheke Event Indexer`);
  console.log(`   RPC: ${XLAYER_RPC}`);
  console.log(`   Contract: ${SYNTKEKE_ADDRESS}`);

  // Watch all Syntheke events
  client.watchContractEvent({
    address: SYNTKEKE_ADDRESS as `0x${string}`,
    abi: SYNTKEKE_ABI,
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(`📦 ${log.eventName}:`, log.args);
        // TODO: Write to PostgreSQL via Drizzle
      }
    },
    onError: (err) => {
      console.error("Indexer error:", err);
    },
  });

  console.log("✅ Indexer watching for events...");
}

main().catch(console.error);
