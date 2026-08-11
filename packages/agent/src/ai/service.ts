import { createHash } from "node:crypto";
import { config } from "../config";
import { logger } from "../logger";
import { sanitizeAgentInput, type SanitizedInput } from "./guard";
import type { ZodSchema } from "zod";

/**
 * AI Service — GPT-4o gateway with structured output validation.
 *
 * Core principles:
 *   - AI recommends, protocol enforces — outputs always validated
 *   - Reasoning commitments — keccak256(prompt + response) stored on-chain
 *   - Confidence thresholds — low-confidence outputs rejected
 *   - Graceful fallback — AI unavailable → return null, caller uses heuristic
 */

// ──── Types ──────────────────────────────────────────────

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  responseSchema: ZodSchema;
  temperature?: number;
  maxTokens?: number;
  requireConfidence?: boolean;
}

export interface AIResponse<T> {
  data: T;
  reasoning: string;
  confidence: number;
  commitmentHash: string; // keccak256(systemPrompt + userPrompt + rawResponse)
  model: string;
  latencyMs: number;
}

// ──── Core Service ────────────────────────────────────────

export class AIService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.AI_API_KEY ?? "";
    this.model = config.AI_MODEL;
    this.baseUrl = config.AI_BASE_URL ?? "https://api.openai.com/v1";
  }

  get isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Send a structured request to the AI model.
   * Returns null if AI is unavailable — caller MUST fall back to heuristic.
   */
  async query<T>(request: AIRequest): Promise<AIResponse<T> | null> {
    if (!this.isAvailable) {
      logger.warn({ event: "ai_unavailable" }, "AI service not configured — no API key");
      return null;
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxTokens ?? 2000,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "unknown");
        logger.error({ event: "ai_api_error", status: response.status, body: errText.slice(0, 200) });
        return null;
      }

      const json = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        model: string;
      };

      const rawContent = json.choices[0]?.message?.content;
      if (!rawContent) {
        logger.error({ event: "ai_empty_response" });
        return null;
      }

      // Parse JSON from AI response
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        logger.error({ event: "ai_json_parse_error", raw: rawContent.slice(0, 200) });
        return null;
      }

      // Validate against schema
      const validation = request.responseSchema.safeParse(parsed);
      if (!validation.success) {
        logger.error({
          event: "ai_schema_validation_failed",
          errors: validation.error.issues.slice(0, 5),
        }, `AI output failed schema validation: ${validation.error.issues.map(i => i.path.join(".") + ": " + i.message).join(", ")}`);
        return null;
      }

      const data = validation.data as T & { confidence?: number; reasoning?: string };

      // Confidence check
      const confidence = data.confidence ?? 0.5;
      if (request.requireConfidence && confidence < 0.7) {
        logger.warn({
          event: "ai_low_confidence",
          confidence,
          threshold: 0.7,
        }, `AI confidence ${confidence} below threshold`);
        return null;
      }

      // Compute reasoning commitment hash
      const commitmentHash = "0x" + createHash("sha256")
        .update(request.systemPrompt + request.userPrompt + rawContent)
        .digest("hex");

      const latencyMs = Date.now() - startTime;
      logger.info({
        event: "ai_query_complete",
        model: json.model,
        confidence,
        latencyMs,
        commitmentHash: commitmentHash.slice(0, 18),
      }, `AI query: ${json.model} in ${latencyMs}ms (confidence: ${confidence})`);

      return {
        data,
        reasoning: data.reasoning ?? "",
        confidence,
        commitmentHash,
        model: json.model,
        latencyMs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ event: "ai_query_error", error: msg });
      return null;
    }
  }

  /**
   * Sanitize agent-provided input before sending to AI.
   */
  sanitizeInput(raw: string, context: string): SanitizedInput {
    return sanitizeAgentInput(raw, context);
  }
}

// Singleton
export const aiService = new AIService();

/**
 * Compute a commitment hash for any AI interaction.
 * Can be stored on-chain for verifiability.
 */
export function computeCommitment(prompt: string, response: string): string {
  return "0x" + createHash("sha256").update(prompt + response).digest("hex");
}
