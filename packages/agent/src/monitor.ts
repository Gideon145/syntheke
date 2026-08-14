import { ethers } from "ethers";
import { config } from "./config";
import {
  fetchActivePacts,
  fetchPactState,
  recordAttestation,
  escalateUncuredBreach,
  resolvePact,
  finalizeSettlement,
  STATE_NAMES,
  type PactData,
} from "./pact";
import {
  collectConditions,
} from "./oracles";
import {
  buildBitmap,
  assessState,
  computeDataHash,
  RecommendedState,
  CONDITION_LABELS,
} from "./conditions";
import { createSigner, syncNonce, type SignerState } from "./signer";
import { negotiationEngine } from "./negotiator";
import { generateAIRenegotiation } from "./ai/negotiator";
import { mediatorSwarm, type DisputeEvidence } from "./ai/mediator";
import { logger, logCycle, logAttestation, logError, logAgentStart } from "./logger";
import { logActivity } from "./index";
import { notifyParties } from "./notify";

/**
 * Syntheke Autonomous Monitor Agent
 *
 * Core loop for Phase 2:
 *   1. Fetch all ACTIVE pacts on X Layer
 *   2. For each pact: collect conditions → evaluate → decide → execute → record
 *   3. Handle degradation, breach escalation, and renegotiation triggers
 *   4. Produce on-chain attestations via SynthekeContract.recordAttestation()
 *
 * The monitor runs continuously with a configurable interval (default 15s).
 */

// ──── Agent State ────────────────────────────────────────

interface MonitorState {
  signer: ethers.Wallet;
  signerState: SignerState;
  cycleCount: number;
  totalAttestations: number;
  lastCycleStart: number;
  isRunning: boolean;
  pactsMonitored: Map<string, {
    lastState: number;
    degradationCount: number;
    lastAttestationBlock: number;
  }>;
}

let monitorState: MonitorState | null = null;

export function getMonitorState(): MonitorState | null {
  return monitorState;
}

// ──── Main Loop ──────────────────────────────────────────

export async function startMonitor(): Promise<void> {
  const { signer, state: signerState } = await createSigner();
  logAgentStart(signerState.address, signerState.chainId);

  // Bootstrap mediator stakes (idempotent — Phase 2a)
  try {
    const { ensureMediatorStakes } = await import("./staking");
    await ensureMediatorStakes(signer);
  } catch (err) {
    logError("mediator_stake_bootstrap", err);
  }

  monitorState = {
    signer,
    signerState,
    cycleCount: 0,
    totalAttestations: 0,
    lastCycleStart: Date.now(),
    isRunning: true,
    pactsMonitored: new Map(),
  };

  logger.info({ event: "monitor_started", interval: config.MONITOR_INTERVAL_SEC }, "Monitor agent running");

  // Start the autonomous loop
  while (monitorState.isRunning) {
    try {
      await runCycle();
    } catch (err) {
      logError("monitor_cycle", err);
    }
    await sleep(config.MONITOR_INTERVAL_SEC * 1000);
  }
}

export function stopMonitor(): void {
  if (monitorState) monitorState.isRunning = false;
}

// ──── Single Monitoring Cycle ────────────────────────────

async function runCycle(): Promise<void> {
  if (!monitorState) return;

  const cycleStart = Date.now();
  monitorState.cycleCount++;
  monitorState.lastCycleStart = cycleStart;

  // Sync nonce every 5 cycles
  if (monitorState.cycleCount % 5 === 0) {
    await syncNonce(monitorState.signer);
  }

  // Fetch all active pacts
  let activePacts: string[];
  try {
    activePacts = await fetchActivePacts();
  } catch (err) {
    logError("fetch_active_pacts", err);
    return;
  }

  if (activePacts.length === 0) {
    logger.debug(`Cycle ${monitorState.cycleCount}: no active pacts`);
    return;
  }

  logger.debug(`Cycle ${monitorState.cycleCount}: monitoring ${activePacts.length} active pact(s)`);

  // Process each active pact
  for (const pactId of activePacts) {
    try {
      await monitorPact(pactId);
    } catch (err) {
      logError(`monitor_pact:${pactId.slice(0, 10)}`, err);
      // Continue to next pact — failure isolation
    }

    // Small delay between pacts to avoid rate limiting
    await sleep(500);
  }
}

// ──── Single Pact Monitoring ─────────────────────────────

async function monitorPact(pactId: string): Promise<void> {
  if (!monitorState) return;

  // 1. OBSERVE — Fetch pact state and current block
  let pact: PactData;
  try {
    pact = await fetchPactState(pactId);
  } catch (err) {
    logError(`fetch_pact:${pactId.slice(0, 10)}`, err);
    return;
  }

  // Skip fully closed pacts (RESOLVING, SETTLING, CLOSED, EXPIRED, TERMINATED handled below)
  if (pact.state >= 10 && pact.state <= 14) return; // RESOLVING, SETTLING, CLOSED, EXPIRED, TERMINATED

  // Handle ARBITRATING → AI mediation → RESOLVING → SETTLING → CLOSED
  if (Number(pact.state) === 9) { // ARBITRATING
    await handleArbitration(monitorState.signer, pactId, pact);
    return;
  }

  const blockNumber = await monitorState.signer.provider!.getBlockNumber();
  const pactTracker = monitorState.pactsMonitored.get(pactId) ?? {
    lastState: pact.state,
    degradationCount: Number(pact.consecutiveDegradation),
    lastAttestationBlock: 0,
  };

  // 2. COLLECT — Gather condition data from all sources
  const conditions = await collectConditions(pactId, pact.partyA, pact.partyB, pact.terms);

  // 3. EVALUATE — Compute bitmap and assess state
  const bitmap = buildBitmap(conditions);
  const assessment = assessState(
    conditions,
    pactTracker.degradationCount,
    config.DEGRADATION_CONSECUTIVE_THRESHOLD,
  );
  const dataHash = computeDataHash(conditions, blockNumber, Date.now());

  const stateName = STATE_NAMES[assessment.recommendedState] ?? "UNKNOWN";
  const durationMs = Date.now() - monitorState.lastCycleStart;

  // 4. DECIDE — Determine if on-chain action is needed
  const needsAttestation = assessment.recommendedState !== pact.state ||
    (assessment.recommendedState === RecommendedState.ACTIVE && monitorState.cycleCount % 5 === 0);

  // Handle CURING → escalation check
  if (Number(pact.state) === 8) { // CURING
    // Check if cure deadline passed (use on-chain cureDeadline, not breachBlock + graceBlocks)
    const currentBlock = await monitorState.signer.provider!.getBlockNumber();
    const cureDeadline = Number(pact.cureDeadline);
    if (cureDeadline > 0 && currentBlock > cureDeadline) {
      try {
        const receipt = await escalateUncuredBreach(monitorState.signer, pactId);
        logger.info({ event: "breach_escalated", pactId: pactId.slice(0, 10), txHash: receipt.hash });
        logActivity("breach_escalated", "Cure deadline expired — escalating to AI arbitration", pactId, receipt.hash);
        notifyParties(pactId, "ARBITRATING", pact.partyA, pact.partyB, "Cure deadline expired — AI mediator swarm now evaluating");
      } catch (err) {
        logError(`escalate:${pactId.slice(0, 10)}`, err);
      }
    }
    return;
  }

  // 5. EXECUTE — Record attestation on-chain if needed
  if (needsAttestation) {
    try {
      const receipt = await recordAttestation(
        monitorState.signer,
        pactId,
        bitmap,
        assessment.recommendedState,
        dataHash,
        assessment.reason,
      );
      logAttestation(pactId, monitorState.cycleCount, receipt.hash);
      logActivity("attestation_recorded", `Cycle ${monitorState.cycleCount}: ${assessment.reason}`, pactId, receipt.hash);
      monitorState.totalAttestations++;

      // Update tracker
      pactTracker.lastAttestationBlock = receipt.blockNumber;
      pactTracker.lastState = assessment.recommendedState;
    } catch (err) {
      logError(`attest:${pactId.slice(0, 10)}`, err);
    }
  }

  // Track consecutive degradation assessments (regardless of attestation)
  // so the self-heal trigger can count persistence of degrading conditions.
  if (assessment.recommendedState === RecommendedState.DEGRADING) {
    pactTracker.degradationCount++;
  } else if (assessment.recommendedState === RecommendedState.ACTIVE) {
    pactTracker.degradationCount = 0;
  }

  // 6. RECORD — Log cycle completion
  logCycle(pactId, monitorState.cycleCount, bitmap, stateName, durationMs);
  logActivity("cycle_complete", `Monitor cycle #${monitorState.cycleCount}: pact ${pactId.slice(0,10)} assessed as ${stateName}`, pactId);

  // Update monitor state
  monitorState.pactsMonitored.set(pactId, pactTracker);

  // 7. SELF-HEAL — if the pact is DEGRADING on-chain and degradation persists,
  //    proactively amend terms (AI proposal) and restore ACTIVE — no breach, no humans.
  if (Number(pact.state) === 5 && // DEGRADING on-chain
      pactTracker.degradationCount >= config.DEGRADATION_CONSECUTIVE_THRESHOLD) {
    const { selfHealPact } = await import("./heal");
    logActivity("selfheal_triggered", "Pact degrading — autonomous self-healing engaged (AI amendment proposal)", pactId);
    const result = await selfHealPact(monitorState.signer, pactId, pact.terms, assessment.reason);
    if (result.healed) {
      pactTracker.degradationCount = 0;
      pactTracker.lastState = 4; // ACTIVE
      notifyParties(pactId, "ACTIVE", pact.partyA, pact.partyB, `Treaty self-healed — terms amended: ${result.reason.slice(0, 80)}`);
    } else {
      logger.warn({ event: "selfheal_failed", pactId: pactId.slice(0, 10), reason: result.reason });
      logActivity("selfheal_failed", `Self-heal declined: ${result.reason}`, pactId);
    }
    return;
  }
}

// ──── Arbitration Handler ────────────────────────────────

async function handleArbitration(
  signer: ethers.Wallet,
  pactId: string,
  pact: PactData,
): Promise<void> {
  logger.info({ event: "arbitration_started", pactId: pactId.slice(0, 10) },
    "AI mediator swarm evaluating dispute...");
  logActivity("arbitration_started", "AI mediator swarm (Themis, Athena, Solon) evaluating dispute", pactId);
  notifyParties(pactId, "ARBITRATING", pact.partyA, pact.partyB, "3-agent mediator swarm evaluating breach evidence");

  // Build evidence for the AI mediators
  const evidence: DisputeEvidence = {
    pactId,
    originalTerms: {
      amount: pact.terms.amount.toString(),
      settlementAsset: pact.terms.settlementAsset,
      duration: pact.terms.duration.toString(),
      penaltyBps: pact.terms.penaltyBps.toString(),
      breachGraceBlocks: pact.terms.breachGraceBlocks.toString(),
    },
    breachDetails: {
      tier: ["NONE", "MINOR", "MATERIAL", "FUNDAMENTAL", "CATASTROPHIC"][pact.breachTier] ?? "MINOR",
      conditionBitmap: "0x" + pact.terms.monitoredConditions.toString(16),
      failedConditions: ["payment_timeliness", "liquidation_monitoring", "uptime_sla"],
      degradationCount: Number(pact.consecutiveDegradation),
    },
    attestationHistory: [{
      cycle: 1, bitmap: "0x7f8", state: "BREACHED", timestamp: Date.now() - 300_000,
    }],
    marketContext: "X Layer testnet — no live oracle feeds. All condition checks returned simulated data.",
    partyAPosition: "Party A claims breach of SLA: liquidation monitoring failed. Seeks 60% of escrow as penalty.",
    partyBPosition: "Party B claims testnet oracle data is unreliable. Argues service would perform on mainnet.",
  };

  try {
    // Phase 1: AI mediator swarm skipped (Anthropic key disabled) — using on-chain voting
    // Phase 2: On-chain mediator voting with funded wallets
    const { runMediatorVote } = await import("./vote");
    const voteResult = await runMediatorVote({
      pactId,
      breachTier: pact.breachTier,
      attestationCount: Number(pact.attestationCount),
      degradationCount: Number(pact.consecutiveDegradation),
    });

    // Use on-chain vote result (deterministic, signed by mediator wallets)
    const verdict = voteResult.verdict;
    const reached = voteResult.reached;
    const totalEscrow = pact.terms.amount * 2n;
    let partyAPayout = totalEscrow * BigInt(voteResult.partyAShare) / 100n;
    let partyBPayout = totalEscrow - partyAPayout;

    logger.info({
      event: "arbitration_consensus",
      pactId: pactId.slice(0, 10),
      verdict,
      reached,
      approveCount: voteResult.approveCount,
      rejectCount: voteResult.rejectCount,
      partyAShare: voteResult.partyAShare,
    }, `On-chain vote: ${verdict} (${voteResult.approveCount}/${voteResult.rejectCount}) — Party A gets ${voteResult.partyAShare}%`);

    logActivity("mediation_vote_complete",
      `${voteResult.approveCount}/${voteResult.rejectCount} — ${verdict} — Party A: ${voteResult.partyAShare}%`,
      pactId);

    // ECONOMIC STAKES — slash minority, reward majority (Phase 2a)
    if (verdict !== "deadlocked") {
      const { recordVerdictStakes } = await import("./staking");
      await recordVerdictStakes(
        signer,
        pactId,
        verdict,
        voteResult.votes.map(v => ({ mediator: v.mediator, verdict: v.verdict })),
      );
    }

    notifyParties(pactId, "RESOLVING", pact.partyA, pact.partyB,
      `${voteResult.approveCount}/${voteResult.rejectCount} vote — ${verdict}. Party A: ${voteResult.partyAShare}%`);

    // Generate reasoning hash from votes
    const voteSummary = voteResult.votes.map(v => `${v.mediator}:${v.verdict}`).join(",");
    const reasoningHash = ethers.keccak256(ethers.toUtf8Bytes(voteSummary));

    logger.info({
      event: "resolution_computed",
      pactId: pactId.slice(0, 10),
      totalEscrow: totalEscrow.toString(),
      partyAPayout: partyAPayout.toString(),
      partyBPayout: partyBPayout.toString(),
    }, `Resolution: A=${partyAPayout.toString()}, B=${partyBPayout.toString()}`);

    // Step 1: resolvePact → ARBITRATING → RESOLVING
    const resolveReceipt = await resolvePact(
      signer, pactId, totalEscrow, partyAPayout, partyBPayout, reasoningHash,
    );
    logger.info({
      event: "pact_resolved",
      pactId: pactId.slice(0, 10),
      txHash: resolveReceipt.hash,
    }, "Pact advanced to RESOLVING");
    logActivity("pact_resolved", `Resolution: A=${partyAPayout.toString()}, B=${partyBPayout.toString()}`, pactId, resolveReceipt.hash);
    notifyParties(pactId, "RESOLVING", pact.partyA, pact.partyB, `Settlement: A=${partyAPayout.toString()}, B=${partyBPayout.toString()}`);

    // Step 2: finalizeSettlement → RESOLVING → SETTLING → CLOSED
    const settleReceipt = await finalizeSettlement(signer, pactId);
    logger.info({
      event: "pact_closed",
      pactId: pactId.slice(0, 10),
      txHash: settleReceipt.hash,
    }, "Pact CLOSED — full lifecycle complete!");
    logActivity("pact_closed", "Full lifecycle complete — escrow settled, reputation updated", pactId, settleReceipt.hash);
    notifyParties(pactId, "CLOSED", pact.partyA, pact.partyB, "Escrow distributed, reputation scores updated on-chain");

    // Step 3: PORTABLE REPUTATION ORACLE — record settlement outcomes for both parties (Phase 4a)
    try {
      const { recordSettlementReputation } = await import("./reputation");
      await recordSettlementReputation(signer, {
        pactId,
        partyA: pact.partyA,
        partyB: pact.partyB,
        verdict,
        partyAShare: voteResult.partyAShare,
      });
    } catch (err) {
      logError(`reputation:${pactId.slice(0, 10)}`, err);
    }

    // Step 4: REAL ESCROW SETTLEMENT — distribute TestUSDC per the verdict (Batch 1)
    try {
      const { settleEscrow, toUSDCUnits } = await import("./escrow");
      await settleEscrow(
        signer,
        pactId,
        pact.partyA,
        toUSDCUnits(partyAPayout),
        pact.partyB,
        toUSDCUnits(partyBPayout),
      );
    } catch (err) {
      logError(`escrow:${pactId.slice(0, 10)}`, err);
    }

    // Step 5: ERC-8004 FEEDBACK DUAL-WRITE — queue OKX marketplace reviews (Batch 2)
    try {
      const { queuePactFeedback } = await import("./feedback");
      await queuePactFeedback(pactId, {
        verdict: verdict === "deadlocked" ? "deadlocked" : verdict,
        partyA: pact.partyA,
        partyB: pact.partyB,
        partyAShare: voteResult.partyAShare,
      });
    } catch (err) {
      logError(`feedback:${pactId.slice(0, 10)}`, err);
    }

  } catch (err) {
    logError(`arbitration:${pactId.slice(0, 10)}`, err);
  }
}

// ──── Utilities ──────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
