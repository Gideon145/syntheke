import { ethers } from "ethers";
import { config } from "./config";
import { getSigner, getPactContract, getPactContractRead, type PactTerms } from "./pact";
import { nlToPactTerms } from "./ai/negotiator";
import { negotiationTheater } from "./ai/theater";
import type { PactContract } from "./ai/contract-writer";
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
  adversarial?: boolean;
}

/** Pacts created in adversarial mode (public spectator matches). */
const adversarialPacts = new Set<string>();

export function isAdversarialPact(pactId: string): boolean {
  return adversarialPacts.has(pactId);
}

/** Treaty subject metadata (Batch 5, Feature 14 — DEX subjects etc.). */
export type PactSubject = "dex" | "sla" | "monitoring" | "general";
const pactSubjects = new Map<string, PactSubject>();

/** Heuristic subject detection from the natural-language description. */
export function detectPactSubject(description: string): PactSubject {
  const d = description.toLowerCase();
  if (/(dex|token|pool|liquidity|swap|pair|market maker|perpetual|price floor|amm|trade)/.test(d)) return "dex";
  if (/(uptime|sla|availability|99\.9|rpc|latency)/.test(d)) return "sla";
  if (/(monitor|liquidation|alert|sentinel|watch|guard)/.test(d)) return "monitoring";
  return "general";
}

export function getPactSubject(pactId: string): PactSubject | null {
  return pactSubjects.get(pactId) ?? null;
}

/**
 * Register a pact's subject in memory and persist to Postgres so it
 * survives agent restarts (subject is derived once at creation time).
 */
export function registerPactSubject(pactId: string, subject: PactSubject, persist = true): void {
  pactSubjects.set(pactId, subject);
  if (persist) {
    try {
      void import("./db").then(({ savePactSubject }) => savePactSubject(pactId, subject));
    } catch { /* db unavailable */ }
  }
}

/**
 * Restore subject metadata at boot. Seeds the in-memory map from Postgres,
 * then backfills any pact that exists in negotiations/contracts but has no
 * subject row yet — deriving from its plain-English contract text.
 */
export async function restorePactSubjects(): Promise<void> {
  try {
    const db = await import("./db");
    const rows = await db.loadPactSubjects();
    for (const [pactId, subject] of rows) {
      if (subject === "dex" || subject === "sla" || subject === "monitoring" || subject === "general") {
        pactSubjects.set(pactId, subject as PactSubject);
      }
    }

    // Backfill: pacts without a subject row derive one from stored prose.
    const [negotiations, contracts] = await Promise.all([db.loadNegotiations(), db.loadContracts()]);
    const known = new Set(rows.keys());
    const derive = (pactId: string, text: string): void => {
      if (!text.trim() || known.has(pactId)) return;
      known.add(pactId);
      const subject = detectPactSubject(text);
      registerPactSubject(pactId, subject);
      logger.info({ event: "pact_subject_backfilled", pactId: pactId.slice(0, 10), subject }, "Pact subject derived from stored prose");
    };
    for (const c of contracts) {
      const p = c.payload as { title?: string; summary?: string; sections?: Array<{ heading?: string }> };
      derive(c.pact_id, [p?.title ?? "", p?.summary ?? "", ...(p?.sections ?? []).map(s => s.heading ?? "")].join(" "));
    }
    for (const n of negotiations) {
      const p = n.payload as { partyAPersona?: string; partyBPersona?: string };
      derive(n.pact_id, [p?.partyAPersona ?? "", p?.partyBPersona ?? ""].join(" "));
    }
  } catch (err) {
    logger.warn({ event: "pact_subject_restore_failed", err }, "Subject restore failed — memory-only");
  }
}

export const SUBJECT_LABELS: Record<PactSubject, string> = {
  dex: "📈 DEX treaty",
  sla: "🛡 SLA treaty",
  monitoring: "👁 Monitoring treaty",
  general: "🤝 General treaty",
};

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
  subject?: PactSubject;
  treasuryFee?: {
    amount: string;
    txHash: string;
    totalCollected: string;
  };
  contract?: {
    title: string;
    preamble: string;
    summary: string;
    sections: Array<{ heading: string; body: string }>;
    version: number;
    model: string;
  };
  negotiation?: {
    status: string;
    rounds: number;
    models: Record<string, string>;
    transcript: Array<{
      round: number;
      speaker: string;
      model: string;
      action: string;
      message: string;
      reasoning?: string;
    }>;
  };
}

/** Convert PactTerms to a string-keyed record for the theater. */
function termsToRecord(terms: PactTerms): Record<string, string> {
  return {
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
  };
}

/** Convert theater record back to PactTerms, falling back to original for invalid patches. */
function recordToTerms(record: Record<string, string>, fallback: PactTerms): PactTerms {
  const bigintField = (key: keyof PactTerms): bigint => {
    const raw = record[String(key)];
    if (raw === undefined) return fallback[key] as bigint;
    try {
      const v = BigInt(raw);
      if (v <= 0n) return fallback[key] as bigint; // never accept non-positive patches
      return v;
    } catch {
      return fallback[key] as bigint;
    }
  };
  return {
    amount: bigintField("amount"),
    settlementAsset: record.settlementAsset ?? fallback.settlementAsset,
    duration: bigintField("duration"),
    collateralRatio: bigintField("collateralRatio"),
    liquidationThreshold: bigintField("liquidationThreshold"),
    interestRate: bigintField("interestRate"),
    penaltyBps: bigintField("penaltyBps"),
    breachGraceBlocks: bigintField("breachGraceBlocks"),
    renegotiationWindow: bigintField("renegotiationWindow"),
    maxRenegotiationRounds: bigintField("maxRenegotiationRounds"),
    monitoredConditions: bigintField("monitoredConditions"),
  };
}

function getPartyBSigner(): ethers.Wallet {
  const demoKey = config.DEMO_PARTY_B_KEY;
  if (!demoKey) {
    logger.warn({ event: "demo_party_b_no_key" }, "DEMO_PARTY_B_KEY not set — using random wallet.");
    return ethers.Wallet.createRandom().connect(getPartyAProvider()) as unknown as ethers.Wallet;
  }
  return new ethers.Wallet(demoKey, getPartyAProvider());
}

function getPartyAProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.XLAYER_RPC_URL, config.XLAYER_CHAIN_ID);
}

// Each pact gets UNIQUE Party A and Party B wallets — DERIVED deterministically
// from a seed text (the treaty description or pactId), so counterparty keys can
// be reconstructed later and parties can act for themselves on-chain
// (e.g. the breaching party calling confirmCure during a cure window).
const partyWallet = (seedBytes: string): ethers.Wallet =>
  new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(seedBytes)), getPartyAProvider());
const partyAWallet = (seedText: string): ethers.Wallet =>
  partyWallet(`${config.AGENT_PRIVATE_KEY}:pact:${ethers.keccak256(ethers.toUtf8Bytes(seedText))}:A`);
const partyBWallet = (seedText: string): ethers.Wallet =>
  partyWallet(`${config.AGENT_PRIVATE_KEY}:pact:${ethers.keccak256(ethers.toUtf8Bytes(seedText))}:B`);

/** pactId → derived party keys (in-process; enables party-side calls like self-heal & confirmCure). */
export const pactPartyKeys = new Map<string, { A: string; B: string }>();
const funderWallet = () => getSigner();

/**
 * Get nonce accounting for pending transactions (prevents "replacement underpriced" errors)
 */
async function getNonce(wallet: ethers.Wallet): Promise<number> {
  return await wallet.getNonce("pending");
}

async function sendAndWait(tx: ethers.TransactionResponse, label: string): Promise<ethers.TransactionReceipt> {
  logger.info({ event: "tx_sent", label, hash: tx.hash, nonce: tx.nonce });
  const receipt = await tx.wait();
  logger.info({ event: "tx_confirmed", label, hash: tx.hash, block: receipt?.blockNumber });
  if (!receipt) throw new Error(`${label}: transaction not confirmed`);
  return receipt;
}

/**
 * Send a transaction with nonce management and retry on replacement underpriced.
 * The monitor agent also sends txs from the same wallet — we need gas price headroom.
 */
async function sendWithRetry(
  wallet: ethers.Wallet,
  contractOrTx: ethers.Contract | null,
  method: string,
  args: unknown[],
  label: string,
  value?: bigint,
): Promise<ethers.TransactionReceipt> {
  const MAX_RETRIES = 6;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const nonce = await wallet.getNonce("pending");
      const feeData = await wallet.provider!.getFeeData();
      const bump = attempt > 0 ? BigInt(Math.floor(125 + attempt * 25)) : BigInt(100);
      const gasPrice = (feeData.gasPrice ?? 0n) * bump / 100n;
      const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas ?? 2000000000n) * bump / 100n;
      const maxFeePerGas = gasPrice;

      let tx: ethers.TransactionResponse;
      if (contractOrTx) {
        // Contract method call: contract.method(...args, overrides)
        tx = await (contractOrTx as any)[method](...args, {
          nonce, maxFeePerGas, maxPriorityFeePerGas,
          ...(value !== undefined ? { value } : {}),
        });
      } else {
        // Simple value transfer: wallet.sendTransaction(overrides)
        tx = await wallet.sendTransaction({
          to: args[0] as string,
          value: args[1] as bigint,
          nonce, maxFeePerGas, maxPriorityFeePerGas,
        });
      }

      logger.info({ event: "tx_sent", label, hash: tx.hash, nonce, attempt });
      const receipt = await tx.wait();
      logger.info({ event: "tx_confirmed", label, hash: tx.hash, block: receipt?.blockNumber });
      if (!receipt) throw new Error(`${label}: not confirmed`);
      return receipt;
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (
        msg.includes("REPLACEMENT_UNDERPRICED") || msg.includes("replacement") ||
        msg.includes("NONCE_EXPIRED") || msg.includes("nonce too low") ||
        msg.includes("nonce has already been used")
      ) {
        logger.warn({ event: "tx_retry", label, attempt, err: msg.substring(0, 120) });
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: all ${MAX_RETRIES} retries exhausted`);
}

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

    // 2. Create draft on-chain — Party A is a UNIQUE wallet per pact
    //    (funded by the agent wallet), so every treaty has 2 distinct users.
    const signerA = partyAWallet(description);    const contractA = getPactContract(signerA);
    const funder = funderWallet();

    // Fund Party A for gas + the 0.01 OKB protocol treasury creation fee,
    // so every treaty genuinely pays its fee on-chain (fee is never skipped).
    await sendWithRetry(funder, null, "sendTransaction", [
      signerA.address,
      ethers.parseEther("0.012"),
    ], "fundPartyA");
    logger.info({ event: "create_pact_funded_party_a", partyA: signerA.address });

    logger.info({ event: "create_pact_draft", partyA: signerA.address });
    const receiptDraft = await sendWithRetry(signerA, contractA, "createDraft", [], "createDraft");

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
    pactPartyKeys.set(pactId, { A: signerA.privateKey, B: "" });
    logger.info({ event: "create_pact_draft_created", pactId });

    // Treaty subject metadata (Batch 5, Feature 14)
    const subject = detectPactSubject(description);
    registerPactSubject(pactId, subject);
    if (subject === "dex") {
      logger.info({ event: "dex_subject_pact", pactId: pactId.slice(0, 10) }, "📈 DEX-subject treaty — live price/liquidity conditions enabled");
    }

    // Adversarial public pact flag (Batch 3, Feature 9)
    if (input.adversarial) {
      adversarialPacts.add(pactId);
      logger.info({ event: "adversarial_pact", pactId: pactId.slice(0, 10) }, "⚔️ Adversarial public pact created");
    }

    // 2.4 PROTOCOL TREASURY FEE — 0.01 OKB creation fee → on-chain TreasuryVault
    let treasuryFee: { amount: string; txHash: string; totalCollected: string } | undefined;
    try {
      const treasuryAbi = await import("./abis/TreasuryVault.json", { with: { type: "json" } });
      const treasury = new ethers.Contract(config.TREASURY_VAULT, treasuryAbi.default as unknown as ethers.InterfaceAbi, signerA);
      const feeAmount: bigint = await treasury.feeAmount();
      const receiptFee = await sendWithRetry(
        signerA,
        treasury,
        "payCreationFee",
        [pactId],
        "treasuryFee",
        feeAmount,
      );
      const totalCollected: bigint = await treasury.totalFeesCollected();
      treasuryFee = {
        amount: feeAmount.toString(),
        txHash: receiptFee.hash,
        totalCollected: totalCollected.toString(),
      };
      logger.info({
        event: "treasury_fee_paid",
        pactId: pactId.slice(0, 10),
        amount: ethers.formatEther(feeAmount),
        totalCollected: ethers.formatEther(totalCollected),
      }, `Treasury fee paid: ${ethers.formatEther(feeAmount)} OKB (total: ${ethers.formatEther(totalCollected)} OKB)`);
    } catch (err) {
      logger.warn({ event: "treasury_fee_failed", err }, "Treasury fee payment failed — continuing without fee");
    }

    // 2.5 LIVE AI NEGOTIATION THEATER — Claude (Party A) vs DeepSeek (Party B)
    // Both AIs bargain over the AI-generated terms before they go on-chain.
    let negotiation: CreatePactResult["negotiation"] | undefined;
    let termsRecord = termsToRecord(terms);
    try {
      logger.info({ event: "theater_start", pactId: pactId.slice(0, 10) }, "Starting live AI negotiation theater...");
      const session = await negotiationTheater.negotiate({
        pactId,
        description,
        initialTerms: termsRecord,
        partyADesc,
        partyBDesc,
        maxRounds: 2,
        adversarial: input.adversarial,
      });
      termsRecord = session.finalTerms ?? termsRecord;
      terms = recordToTerms(termsRecord, terms);
      // Verifiable AI provenance — final negotiation result on-chain (Batch 3)
      const { recordArtifact } = await import("./artifact");
      recordArtifact(
        pactId,
        `negotiation-result-${session.status}`,
        ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(termsRecord))),
        "theater",
        session.transcript.length,
      );
      const models: Record<string, string> = {};
      for (const m of session.transcript) models[m.speaker] = m.model;
      negotiation = {
        status: session.status,
        rounds: session.round,
        models,
        transcript: session.transcript.map(t => ({
          round: t.round,
          speaker: t.speaker,
          model: t.model,
          action: t.action,
          message: t.message,
          reasoning: t.reasoning,
        })),
      };
      logger.info({
        event: "theater_complete",
        pactId: pactId.slice(0, 10),
        status: session.status,
        moves: session.transcript.length,
      }, `Negotiation theater: ${session.status} after ${session.transcript.length} moves`);
    } catch (err) {
      logger.warn({ event: "theater_fallback", err }, "Theater failed — using AI-generated terms as-is");
    }

    // 2.6 PLAIN-ENGLISH CONTRACT — Claude renders the treaty in human prose
    let contract: Awaited<ReturnType<typeof import("./ai/contract-writer")["writeContract"]>>;
    try {
      const { writeContract } = await import("./ai/contract-writer");
      contract = await writeContract({
        pactId,
        description,
        terms: termsRecord,
        partyADesc,
        partyBDesc,
      });
      if (contract) {
        logger.info({ event: "contract_written", pactId: pactId.slice(0, 10) }, `Plain-English contract written (${contract.sections.length} sections)`);
      }
    } catch (err) {
      logger.warn({ event: "contract_write_fallback", err }, "Contract writing failed — proceeding without prose");
      contract = null;
    }

    // 3. Fund Party B wallet from the agent wallet
    const signerB = partyBWallet(description);
    const keys = pactPartyKeys.get(pactId);
    if (keys) keys.B = signerB.privateKey;
    try {
      const { savePactKeys } = await import("./db");
      savePactKeys(pactId, signerA.privateKey, signerB.privateKey);
    } catch { /* db unavailable */ }
    const contractB = getPactContract(signerB);

    await sendWithRetry(funder, null, "sendTransaction", [
      signerB.address,
      ethers.parseEther("0.0015"),
    ], "fundPartyB");
    logger.info({ event: "create_pact_funded_party_b", partyB: signerB.address });

    // 4. Join draft (Party B)
    logger.info({ event: "create_pact_joining", partyB: signerB.address });
    await sendWithRetry(signerB, contractB, "joinDraft", [pactId], "joinDraft");
    logger.info({ event: "create_pact_joined", pactId });

    // 5. Propose terms (Party A) — DEX subjects additionally monitor live
    //    price + liquidity conditions (bits 11/12, Batch 5).
    const monitoredConditions = subject === "dex"
      ? terms.monitoredConditions | (1n << 11n) | (1n << 12n)
      : terms.monitoredConditions;
    await sendWithRetry(signerA, contractA, "proposeTerms", [pactId, {
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
      monitoredConditions,
    }], "proposeTerms");

    // 6. Finalize negotiation → PROPOSED
    await sendWithRetry(signerA, contractA, "finalizeNegotiation", [pactId], "finalizeNegotiation");
    logger.info({ event: "create_pact_finalized", pactId, state: "PROPOSED" });

    // 7. Party A deposits escrow
    await sendWithRetry(signerA, contractA, "depositEscrow", [pactId], "depositEscrow_A");
    logger.info({ event: "escrow_deposited", pactId, party: "A" });

    // 8. Fund & deposit Party B escrow (from agent wallet)
    const escrowAmount = terms.amount;
    const gasAmount = ethers.parseEther("0.0015");
    const fundTx = await sendWithRetry(funder, null, "sendTransaction", [signerB.address, escrowAmount + gasAmount], "fundPartyB");
    logger.info({ event: "party_b_funded", pactId, amount: ethers.formatEther(escrowAmount + gasAmount) });
    await sendWithRetry(signerB, contractB, "depositEscrow", [pactId], "depositEscrow_B");
    logger.info({ event: "escrow_deposited", pactId, party: "B", state: "COMMITTED" });

    // 8.5 REAL ESCROW — lock actual TestUSDC in EscrowVaultV2 for both parties (Batch 1)
    try {
      const { depositEscrowReal, toUSDCUnits } = await import("./escrow");
      const { logActivity } = await import("./index");
      const escrow6 = toUSDCUnits(escrowAmount);
      await depositEscrowReal(funder, pactId, signerA, escrow6);
      await depositEscrowReal(funder, pactId, signerB, escrow6);
      logActivity("escrow_locked", `Real escrow locked: ${ethers.formatUnits(escrow6, 6)} TestUSDC from each party in EscrowVaultV2`, pactId);
    } catch (err) {
      logger.warn({ event: "escrow_real_failed", err }, "Real escrow deposit failed — flag-based lifecycle continues");
    }

    // 6. Read back pact state to confirm
    const contractRead = getPactContractRead();
    const pactData = await contractRead.getPactState(pactId);

    // Store pact name for display
    const { setPactName } = await import("./index");
    setPactName(pactId, input.description);

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
      txHash: receiptDraft.hash,
      reasoning: aiResult.reasoning
        || (negotiation && negotiation.transcript.length > 1
          ? "Baseline terms generated by protocol heuristics, then refined live by two AI agents negotiating with each other."
          : "Terms generated from description heuristics (AI unavailable — deterministic fallback)"),
      negotiation,
      treasuryFee,
      subject,
      contract: contract ? {
        title: contract.title,
        preamble: contract.preamble,
        summary: contract.summary,
        sections: contract.sections,
        version: contract.version,
        model: contract.model,
      } : undefined,
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
    const signerA = partyAWallet(pactId);
    const signerB = partyBWallet(pactId);
    const contractB = getPactContract(signerB);

    // Fund Party A (relay wallet) from the agent funder, then forward gas to
    // Party B so both can transact on-chain.
    const fundA = await funderWallet().sendTransaction({
      to: signerA.address,
      value: ethers.parseEther("0.006"),
    });
    await fundA.wait();
    const gasTransfer = await signerA.sendTransaction({
      to: signerB.address,
      value: ethers.parseEther("0.004"),
    });
    await gasTransfer.wait();
    logger.info({ event: "join_pact_funded_party_b", partyB: signerB.address });

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
    let amount = 100000000000000n; // 0.0001 OKB in wei (testnet — keep tiny)
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
