import { ethers } from "ethers";
import { config } from "./config";
import {
  fetchActivePacts,
  fetchPactState,
  recordAttestation,
  escalateUncuredBreach,
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
import { logger, logCycle, logAttestation, logError, logAgentStart } from "./logger";

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

  // Skip fully settled/closed pacts
  if (pact.state === 12 || pact.state === 13 || pact.state === 14) return; // CLOSED, EXPIRED, TERMINATED

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
    // Check if cure deadline passed
    const currentBlock = await monitorState.signer.provider!.getBlockNumber();
      const graceEnd = Number(pact.terms.breachGraceBlocks) + Number(pact.breachBlock);
      if (currentBlock > graceEnd) {
      try {
        const receipt = await escalateUncuredBreach(monitorState.signer, pactId);
        logger.info({ event: "breach_escalated", pactId: pactId.slice(0, 10), txHash: receipt.hash });
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
      monitorState.totalAttestations++;

      // Update tracker
      pactTracker.lastAttestationBlock = receipt.blockNumber;
      pactTracker.lastState = assessment.recommendedState;

      if (assessment.recommendedState === RecommendedState.DEGRADING) {
        pactTracker.degradationCount++;
      } else if (assessment.recommendedState === RecommendedState.ACTIVE) {
        pactTracker.degradationCount = 0;
      }
    } catch (err) {
      logError(`attest:${pactId.slice(0, 10)}`, err);
    }
  }

  // 6. RECORD — Log cycle completion
  logCycle(pactId, monitorState.cycleCount, bitmap, stateName, durationMs);

  // Update monitor state
  monitorState.pactsMonitored.set(pactId, pactTracker);

  // 7. TRIGGER — Auto-initiate renegotiation if appropriate
  if (assessment.recommendedState === RecommendedState.DEGRADING &&
      pactTracker.degradationCount >= config.DEGRADATION_CONSECUTIVE_THRESHOLD &&
      pact.state === 4) { // Currently ACTIVE but degrading
    // Use AI for smarter renegotiation proposals when available
    let proposalReason: string;
    let fairness: number;

    const aiResult = await generateAIRenegotiation(
      pact.terms,
      assessment.reason,
      "X Layer market conditions — Phase 3 AI monitoring active",
    );

    if (aiResult.terms && aiResult.fairnessScore > 0) {
      proposalReason = aiResult.reasoning;
      fairness = aiResult.fairnessScore;
    } else {
      // Fall back to deterministic heuristic
      const proposal = negotiationEngine.generateRenegotiationProposal(
        pact.terms,
        "collateral_ratio_approaching",
      );
      proposalReason = proposal.reason;
      fairness = negotiationEngine.evaluateFairness(pact.terms, proposal.newTerms);
    }

    logger.info({
      event: "renegotiation_proposed",
      pactId: pactId.slice(0, 10),
      fairness,
      reason: proposalReason,
    }, `Renegotiation proposed (fairness: ${fairness}/100)`);
  }
}

// ──── Utilities ──────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
