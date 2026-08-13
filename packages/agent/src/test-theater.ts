/**
 * Quick local test of the AI negotiation theater.
 * Run: npx tsx src/test-theater.ts
 */
import { negotiationTheater } from "./ai/theater";
import { aiService, deepseekService } from "./ai/service";

async function main() {
  console.log("=== Model availability ===");
  console.log("Claude   :", aiService.isAvailable ? "available" : "MISSING KEY");
  console.log("DeepSeek :", deepseekService.isAvailable ? "available" : "MISSING KEY");

  console.log("\n=== Running theater (2 rounds max) ===");
  const t0 = Date.now();
  const session = await negotiationTheater.negotiate({
    pactId: "0xTEST1234567890123456789012345678901234567890123456789012345678901234",
    description: "Agent Alpha pays 100 USDC monthly to Agent Beta for real-time liquidation monitoring of Aave positions. If Beta misses 3 consecutive checks, Alpha claims 50% of escrow.",
    initialTerms: {
      amount: "100000000",
      settlementAsset: "0x0000000000000000000000000000000000000000",
      duration: "2628000",
      collateralRatio: "15000",
      liquidationThreshold: "12000",
      interestRate: "800",
      penaltyBps: "500",
      breachGraceBlocks: "100",
      renegotiationWindow: "14400",
      maxRenegotiationRounds: "3",
      monitoredConditions: "255",
    },
    partyADesc: "DeFi yield optimizer agent",
    partyBDesc: "Liquidation monitoring service agent",
    maxRounds: 2,
  });

  console.log(`\n=== Theater done in ${Date.now() - t0}ms ===`);
  console.log("Status:", session.status);
  console.log("Moves :", session.transcript.length);
  for (const m of session.transcript) {
    console.log(`\n[Round ${m.round}] ${m.speaker === "A" ? "Alpha" : "Beta"} (${m.model}) — ${m.action}`);
    console.log("  💬", m.message.slice(0, 200));
    if (m.reasoning) console.log("  🧠", m.reasoning.slice(0, 150));
  }
  console.log("\nFinal terms:", JSON.stringify(session.finalTerms, null, 2));
}

main().catch(err => {
  console.error("Theater test failed:", err);
  process.exit(1);
});
