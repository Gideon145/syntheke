import { ethers } from "ethers";
import { config } from "./config";
import { getSigner, getPactContract, getPactContractRead, type PactTerms } from "./pact";
import { nlToPactTerms } from "./ai/negotiator";
import { logger } from "./logger";

/**
 * create-pact.ts — User-facing pact creation flow
 *
 * Takes natural language descriptions of two parties and their pact intent,
 * generates structured terms via AI, and executes the full on-chain creation flow:
 *   Draft → Join → Negotiate (AI terms) → Finalize → (optional deposit)
 *
 * For the hackathon demo, the agent controls both Party A and Party B wallets
 * to enable a single-click demo experience. In production, each party signs independently.
 */

interface CreatePactInput {
  partyADesc: string;
  partyBDesc: string;
  description: string;
}

interface CreatePactResult {
  success: boolean;
  pactId?: string;
  terms?: Record<string, unknown>;
  partyA?: string;
  partyB?: string;
  state?: string;
  txHash?: string;
  reasoning?: string;
  error?: string;
}

function getPartyBSigner(): ethers.Wallet {
  const demoKey = config.DEMO_PARTY_B_KEY;
  if (!demoKey) {
    // Generate a random wallet on first use (no funds, but works for draft creation on testnet)
    logger.warn({ event: "demo_party_b_no_key" }, "DEMO_PARTY_B_KEY not set — using random wallet. Fund it on testnet for full flow.");
    return ethers.Wallet.createRandom().connect(getPartyAProvider());
  }
  return new ethers.Wallet(demoKey, getPartyAProvider());
}

function getPartyAProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
}

const partyAWallet = () => getSigner(); // monitor agent wallet
const partyBWallet = () => getPartyBSigner();

/**
 * Full pact creation flow: NL description → AI terms → on-chain creation
 */
export async function createPactFromNL(input: CreatePactInput): Promise<CreatePactResult> {
  const { partyADesc, partyBDesc, description } = input;

  if (!description || description.length < 10) {
    return { success: false, error: "Description must be at least 10 characters" };
  }

  try {
    // 1. Generate terms via AI (with deterministic fallback)
    logger.info({ event: "create_pact_generating_terms" }, "Generating terms via AI...");
    const aiResult = await nlToPactTerms(description);

    let terms;
    if (aiResult.terms) {
      terms = aiResult.terms;
      logger.info({ event: "create_pact_terms_ai", terms }, "AI-generated terms");
    } else {
      // Fallback: generate sensible defaults from description heuristics
      terms = generateDefaultTerms(description);
      logger.info({ event: "create_pact_terms_fallback", terms }, "Using deterministic fallback terms (AI unavailable)");
    }

    if (!terms) {
      return {
        success: false,
        error: aiResult.reasoning || "Failed to generate pact terms",
      };
    }

    // 2. Create draft on-chain (Party A = agent wallet)
    const signerA = partyAWallet();
    const contractA = getPactContract(signerA);

    logger.info({ event: "create_pact_draft", partyA: signerA.address });
    const txDraft = await contractA.createDraft();
    const receiptDraft = await txDraft.wait();

    // Extract pactId from DraftCreated event
    const draftEvent = receiptDraft.logs
      .map((log: ethers.Log) => {
        try { return contractA.interface.parseLog({ topics: [...log.topics], data: log.data }); }
        catch { return null; }
      })
      .find((parsed: ethers.LogDescription | null) => parsed?.name === "DraftCreated");

    if (!draftEvent) {
      return { success: false, error: "Failed to extract pactId from DraftCreated event" };
    }
    const pactId = draftEvent.args.pactId as string;
    logger.info({ event: "create_pact_draft_created", pactId });

    // 3. Fund Party B wallet from Party A (so it can pay gas for joinDraft)
    const signerB = partyBWallet();
    const contractB = getPactContract(signerB);

    const gasTransfer = await signerA.sendTransaction({
      to: signerB.address,
      value: ethers.parseEther("0.01"), // Enough for ~100 transactions
    });
    await gasTransfer.wait();
    logger.info({ event: "create_pact_funded_party_b", partyB: signerB.address });

    // 4. Join draft (Party B = demo wallet)
    logger.info({ event: "create_pact_joining", partyB: signerB.address });
    const txJoin = await contractB.joinDraft(pactId);
    await txJoin.wait();
    logger.info({ event: "create_pact_joined", pactId });

    // 4. Propose terms (Party A proposes)
    const txPropose = await contractA.proposeTerms(pactId, {
      amount: terms.amount,
      settlementAsset: terms.settlementAsset || "0x0000000000000000000000000000000000000000",
      duration: terms.duration,
      collateralRatio: terms.collateralRatio,
      liquidationThreshold: terms.liquidationThreshold,
      interestRate: terms.interestRate,
      penaltyBps: terms.penaltyBps,
      breachGraceBlocks: terms.breachGraceBlocks,
      renegotiationWindow: terms.renegotiationWindow,
      maxRenegotiationRounds: terms.maxRenegotiationRounds,
      monitoredConditions: terms.monitoredConditions,
    });
    await txPropose.wait();

    // 5. Finalize negotiation
    const txFinalize = await contractA.finalizeNegotiation(pactId);
    await txFinalize.wait();
    logger.info({ event: "create_pact_finalized", pactId, state: "PROPOSED" });

    // 6. Read back pact state to confirm
    const contractRead = getPactContractRead();
    const pactData = await contractRead.getPactState(pactId);

    return {
      success: true,
      pactId,
      terms: {
        amount: terms.amount.toString(),
        settlementAsset: terms.settlementAsset,
        duration: terms.duration.toString(),
        collateralRatio: terms.collateralRatio.toString(),
        liquidationThreshold: terms.liquidationThreshold.toString(),
        interestRate: terms.interestRate.toString(),
        penaltyBps: terms.penaltyBps.toString(),
        breachGraceBlocks: terms.breachGraceBlocks.toString(),
        renegotiationWindow: terms.renegotiationWindow.toString(),
        maxRenegotiationRounds: terms.maxRenegotiationRounds.toString(),
        monitoredConditions: terms.monitoredConditions.toString(),
      },
      partyA: signerA.address,
      partyB: signerB.address,
      state: "PROPOSED",
      txHash: txFinalize.hash,
      reasoning: aiResult.reasoning || "Terms generated from description heuristics (AI unavailable — deterministic fallback)",
    };
  } catch (err) {
    logger.error({ err }, "createPactFromNL failed");
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error creating pact",
    };
  }
}

/**
 * Join an existing draft pact as Party B
 */
export async function joinExistingPact(pactId: string): Promise<CreatePactResult> {
  try {
    const signerB = partyBWallet();
    const contractB = getPactContract(signerB);

    const txJoin = await contractB.joinDraft(pactId);
    await txJoin.wait();

    const contractRead = getPactContractRead();
    const pactData = await contractRead.getPactState(pactId);

    return {
      success: true,
      pactId,
      partyB: signerB.address,
      state: "NEGOTIATING",
      txHash: txJoin.hash,
    };
  } catch (err) {
    logger.error({ err, pactId }, "joinExistingPact failed");
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error joining pact",
    };
  }
}

/**
 * Deterministic fallback: generate sensible pact terms from description heuristics.
 * Used when AI is unavailable (no API key configured).
 */
function generateDefaultTerms(description: string): PactTerms {
  const desc = description.toLowerCase();

  // Detect payment amount from description
  let amount = 100000000000000000000n; // 100 tokens in wei (default)
  const usdcMatch = desc.match(/(\d+)\s*usdc/i);
  if (usdcMatch) amount = BigInt(usdcMatch[1]) * 1000000n; // USDC has 6 decimals

  // Detect duration from keywords
  let duration = 40320n; // ~1 week in blocks (default)
  if (desc.includes("month")) duration = 172800n;
  if (desc.includes("week")) duration = 40320n;
  if (desc.includes("day")) duration = 5760n;

  // Detect monitoring/security sensitivity
  let penaltyBps = 1000n; // 10% default
  let collateralRatio = 15000n; // 150% default
  if (desc.includes("critical") || desc.includes("catastrophic") || desc.includes("50%")) {
    penaltyBps = 5000n; // 50%
    collateralRatio = 20000n; // 200%
  }

  // Detect breach grace from "consecutive" mentions
  let breachGraceBlocks = 100n;
  const consecutiveMatch = desc.match(/(\d+)\s*consecutive/);
  if (consecutiveMatch) breachGraceBlocks = BigInt(consecutiveMatch[1]) * 20n;

  return {
    amount,
    settlementAsset: "0x0000000000000000000000000000000000000000",
    duration,
    collateralRatio,
    liquidationThreshold: 12000n,
    interestRate: 800n, // 8%
    penaltyBps,
    breachGraceBlocks,
    renegotiationWindow: 7200n,
    maxRenegotiationRounds: 3n,
    monitoredConditions: 65535n, // All 16 conditions
  };
}
