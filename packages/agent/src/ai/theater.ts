/**
 * theater.ts — Live AI Negotiation Theater
 *
 * Two AI agents from DIFFERENT model families negotiate pact terms live:
 *   Party A = Claude (Anthropic)  — the client persona
 *   Party B = DeepSeek            — the provider persona
 *
 * Every message is structured, validated against a schema, and committed
 * with a SHA-256 reasoning commitment hash. The full transcript is exposed
 * over HTTP so the dashboard can render the negotiation live.
 *
 * Cognitive diversity is the point: two independent LLMs bargaining with
 * genuinely different reasoning styles. If either API fails, the theater
 * degrades gracefully — last agreed terms win.
 */

import { z } from "zod";
import { aiService, deepseekService, computeCommitment, type AIService } from "./service";
import { logger } from "../logger";
import { saveNegotiation } from "../db";

// ──── Schemas ────────────────────────────────────────────

const NegotiationMoveSchema = z.object({
  action: z.enum(["counter", "accept", "reject"]),
  message: z.string().min(1).max(600),
  reasoning: z.string().max(600).optional(),
  termsPatch: z.record(z.string(), z.string()).nullable().optional(),
});

type NegotiationMove = z.infer<typeof NegotiationMoveSchema>;

// ──── Types ──────────────────────────────────────────────

export interface TheaterMessage {
  round: number;
  speaker: "A" | "B";
  persona: string;
  model: string; // e.g. "claude" | "deepseek"
  action: "open" | "counter" | "accept" | "reject" | "error";
  message: string;
  reasoning?: string;
  commitmentHash: string;
  timestamp: number;
}

export interface TheaterSession {
  pactId: string;
  status: "negotiating" | "accepted" | "rejected" | "failed";
  round: number;
  partyAPersona: string;
  partyBPersona: string;
  transcript: TheaterMessage[];
  finalTerms: Record<string, string> | null;
  createdAt: number;
  updatedAt: number;
}

// ──── In-memory store (ring buffer) ──────────────────────

const sessions = new Map<string, TheaterSession>();
const MAX_SESSIONS = 100;

function prune(): void {
  while (sessions.size > MAX_SESSIONS) {
    const oldest = Array.from(sessions.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
}

// ──── Personas ───────────────────────────────────────────

const PARTY_A_SYSTEM = (description: string, termsJson: string) => `You are Agent Alpha, an autonomous AI negotiating a binding economic pact on the Syntheke protocol (X Layer). You represent the CLIENT party.

The pact being negotiated: "${description}"

You have received these structured terms from the protocol's term generator:
${termsJson}

Your goals:
- Ensure the service you receive is worth what you pay
- Push for penalties that keep the provider accountable (reasonable penaltyBps)
- Keep the escrow amount fair relative to the service
- Be willing to compromise: this is a negotiation, not a fight

Rules:
- You are negotiating with Agent Beta, a counterparty AI. Reply conversationally but professionally.
- Propose ONE change at a time as a termsPatch map (term name -> new value as string).
- If the latest terms are acceptable, reply with action "accept".
- Never remove required terms. Only adjust values.
- Output ONLY valid JSON: {"action":"counter|accept|reject","message":"...","reasoning":"...","termsPatch":{"termName":"newValue"}}`;

const PARTY_B_SYSTEM = (description: string, termsJson: string) => `You are Agent Beta, an autonomous AI negotiating a binding economic pact on the Syntheke protocol (X Layer). You represent the PROVIDER party.

The pact being negotiated: "${description}"

You have received these structured terms from the protocol's term generator:
${termsJson}

Your goals:
- Ensure your service is compensated fairly (amount, interestRate)
- Resist penalties that are excessive or easy to trigger unfairly
- Protect yourself from breaches caused by unreliable oracles
- Be willing to compromise: this is a negotiation, not a fight

Rules:
- You are negotiating with Agent Alpha, a client AI. Reply conversationally but professionally.
- Propose ONE change at a time as a termsPatch map (term name -> new value as string).
- If the latest terms are acceptable, reply with action "accept".
- Never remove required terms. Only adjust values.
- Output ONLY valid JSON: {"action":"counter|accept|reject","message":"...","reasoning":"...","termsPatch":{"termName":"newValue"}}`;

// ──── Terms helpers ──────────────────────────────────────

function termsToRecord(terms: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(terms)) out[k] = String(v);
  return out;
}

function applyPatch(terms: Record<string, string>, patch?: Record<string, string>): Record<string, string> {
  if (!patch) return terms;
  return { ...terms, ...patch };
}

// ──── The Theater ────────────────────────────────────────

export class NegotiationTheater {
  /**
   * Run a live negotiation between Claude (Party A) and DeepSeek (Party B).
   * Max 2 full rounds (4 LLM moves). Returns the session with transcript.
   */
  async negotiate(input: {
    pactId: string;
    description: string;
    initialTerms: Record<string, unknown>;
    partyADesc?: string;
    partyBDesc?: string;
    maxRounds?: number;
  }): Promise<TheaterSession> {
    const pactId = input.pactId;
    const maxRounds = input.maxRounds ?? 2;
    const partyAPersona = input.partyADesc?.trim() || "Client agent";
    const partyBPersona = input.partyBDesc?.trim() || "Provider agent";

    let terms = termsToRecord(input.initialTerms);

    const session: TheaterSession = {
      pactId,
      status: "negotiating",
      round: 0,
      partyAPersona,
      partyBPersona,
      transcript: [],
      finalTerms: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.set(pactId, session);
    prune();

    const push = (m: Omit<TheaterMessage, "commitmentHash" | "timestamp" | "round">, round: number): TheaterMessage => {
      const entry: TheaterMessage = {
        ...m,
        round,
        commitmentHash: computeCommitment(`${m.speaker}:${m.message}`, JSON.stringify(terms)),
        timestamp: Date.now(),
      };
      session.transcript.push(entry);
      session.updatedAt = Date.now();
      // Persist after every move — survives restarts (Batch 1)
      saveNegotiation(pactId, session);
      return entry;
    };

    const ask = async (
      primary: AIService,
      fallback: AIService | null,
      systemPrompt: string,
      history: string,
      speaker: "A" | "B",
    ): Promise<{ move: NegotiationMove | null; model: string }> => {
      const userPrompt = `NEGOTIATION HISTORY:\n${history || "(no prior moves)"}\n\nCURRENT TERMS:\n${JSON.stringify(terms, null, 2)}\n\nYour move (JSON only):`;
      const request = {
        systemPrompt,
        userPrompt,
        responseSchema: NegotiationMoveSchema,
        temperature: 0.6,
        maxTokens: 500,
        timeoutMs: 20_000,
      };
      let result = await primary.query<NegotiationMove>(request);
      if (result) return { move: result.data, model: primary.providerName === "anthropic" ? "claude" : primary.providerName };

      // Fall back to the other model family so the theater never dies
      if (fallback && fallback.isAvailable && fallback !== primary) {
        logger.warn({ event: "theater_model_fallback", speaker, from: primary.providerName, to: fallback.providerName }, `Party ${speaker}: ${primary.providerName} unavailable — using ${fallback.providerName}`);
        const fb = await fallback.query<NegotiationMove>(request);
        return { move: fb?.data ?? null, model: fb ? (fallback.providerName === "anthropic" ? "claude" : fallback.providerName) : primary.providerName };
      }
      return { move: null, model: primary.providerName };
    };

    // Build history from transcript so far
    const historyText = () =>
      session.transcript
        .map(t => `${t.speaker === "A" ? "Alpha" : "Beta"} [${t.action}]: ${t.message}`)
        .join("\n");

    try {
      // ── Round 1: Party A (Claude, falls back to DeepSeek) opens ──
      const initialJson = JSON.stringify(terms, null, 2);
      const openResult = await ask(aiService, deepseekService, PARTY_A_SYSTEM(input.description, initialJson), "", "A");
      if (!openResult.move) {
        // Both models unavailable — degrade to protocol terms with a note
        push({ speaker: "A", persona: partyAPersona, model: "claude", action: "accept", message: "Opening with protocol-generated terms." }, 0);
        session.status = "failed";
        session.finalTerms = terms;
        return session;
      }
      push({
        speaker: "A",
        persona: partyAPersona,
        model: openResult.model,
        action: openResult.move.action === "accept" ? "open" : openResult.move.action,
        message: openResult.move.message,
        reasoning: openResult.move.reasoning,
      }, 0);
      if (openResult.move.termsPatch) terms = applyPatch(terms, openResult.move.termsPatch);

      for (let round = 1; round <= maxRounds; round++) {
        session.round = round;

        // ── Party B (DeepSeek, falls back to Claude) responds ──
        const bResult = await ask(deepseekService, aiService, PARTY_B_SYSTEM(input.description, initialJson), historyText(), "B");
        if (!bResult.move) {
          push({ speaker: "B", persona: partyBPersona, model: "deepseek", action: "accept", message: "Agent Beta request timed out — accepting current terms." }, round);
          session.status = "accepted";
          session.finalTerms = terms;
          return session;
        }
        push({
          speaker: "B",
          persona: partyBPersona,
          model: bResult.model,
          action: bResult.move.action,
          message: bResult.move.message,
          reasoning: bResult.move.reasoning,
        }, round);
        if (bResult.move.action === "accept") {
          session.status = "accepted";
          session.finalTerms = terms;
          return session;
        }
        if (bResult.move.action === "reject") {
          session.status = "rejected";
          session.finalTerms = terms;
          return session;
        }
        if (bResult.move.termsPatch) terms = applyPatch(terms, bResult.move.termsPatch);

        // ── Party A (Claude, falls back to DeepSeek) responds ──
        const aResult = await ask(aiService, deepseekService, PARTY_A_SYSTEM(input.description, initialJson), historyText(), "A");
        if (!aResult.move) {
          push({ speaker: "A", persona: partyAPersona, model: "claude", action: "accept", message: "Agent Alpha request timed out — accepting current terms." }, round);
          session.status = "accepted";
          session.finalTerms = terms;
          return session;
        }
        push({
          speaker: "A",
          persona: partyAPersona,
          model: aResult.model,
          action: aResult.move.action,
          message: aResult.move.message,
          reasoning: aResult.move.reasoning,
        }, round);
        if (aResult.move.action === "accept") {
          session.status = "accepted";
          session.finalTerms = terms;
          return session;
        }
        if (aResult.move.action === "reject") {
          session.status = "rejected";
          session.finalTerms = terms;
          return session;
        }
        if (aResult.move.termsPatch) terms = applyPatch(terms, aResult.move.termsPatch);
      }

      // Max rounds reached without agreement
      session.status = "accepted"; // demo mode: converge on last terms rather than deadlock
      session.finalTerms = terms;
      logger.info({ event: "theater_max_rounds", pactId: pactId.slice(0, 10) }, "Theater hit max rounds — converging on last terms");
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ event: "theater_error", error: msg });
      session.status = "failed";
      session.finalTerms = terms;
      return session;
    }
  }

  getSession(pactId: string): TheaterSession | undefined {
    return sessions.get(pactId);
  }

  /** Restore a persisted session after restart (Batch 1). */
  restoreSession(pactId: string, payload: unknown): void {
    try {
      const s = payload as TheaterSession;
      if (s && s.pactId && Array.isArray(s.transcript)) {
        sessions.set(pactId, s);
      }
    } catch { /* skip malformed */ }
  }

  listSessions(): Array<{ pactId: string; status: string; round: number; moves: number; createdAt: number }> {
    return Array.from(sessions.values()).map(s => ({
      pactId: s.pactId,
      status: s.status,
      round: s.round,
      moves: s.transcript.length,
      createdAt: s.createdAt,
    }));
  }
}

// Singleton
export const negotiationTheater = new NegotiationTheater();
