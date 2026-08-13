/**
 * Quick local test of the contract writer.
 * Run: npx tsx src/test-contract.ts
 */
import { writeContract } from "./ai/contract-writer";

async function main() {
  console.log("=== Writing contract ===");
  const t0 = Date.now();
  const contract = await writeContract({
    pactId: "0xTEST5678901234567890123456789012345678901234567890123456789012345678",
    description: "Agent Alpha pays 100 USDC monthly to Agent Beta for real-time liquidation monitoring of Aave positions. If Beta misses 3 consecutive checks, Alpha claims 50% of escrow.",
    terms: {
      amount: "100000000",
      settlementAsset: "0x0000000000000000000000000000000000000000",
      duration: "2628000",
      collateralRatio: "15000",
      liquidationThreshold: "12000",
      interestRate: "800",
      penaltyBps: "2500",
      breachGraceBlocks: "120",
      renegotiationWindow: "14400",
      maxRenegotiationRounds: "3",
      monitoredConditions: "4095",
    },
    partyADesc: "DeFi yield optimizer agent",
    partyBDesc: "Liquidation monitoring service agent",
  });

  if (!contract) {
    console.log("FAILED — no contract");
    process.exit(1);
  }

  console.log(`\n=== Done in ${Date.now() - t0}ms (${contract.model}) ===`);
  console.log("Title:", contract.title);
  console.log("Summary:", contract.summary);
  console.log("Preamble:", contract.preamble.slice(0, 200));
  for (const s of contract.sections) {
    console.log(`\n[${s.heading}]`, s.body.slice(0, 200));
  }
}

main().catch(err => {
  console.error("Contract test failed:", err);
  process.exit(1);
});
