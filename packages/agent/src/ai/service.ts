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

export type AIProvider = "anthropic" | "openai" | "deepseek";

export interface AIServiceOptions {
  provider?: AIProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class AIService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private provider: AIProvider;

  constructor(options: AIServiceOptions = {}) {
    this.apiKey = options.apiKey ?? config.AI_API_KEY ?? "";
    this.model = options.model ?? config.AI_MODEL;
    this.baseUrl = options.baseUrl ?? config.AI_BASE_URL ?? "https://api.openai.com/v1";
    this.provider = options.provider ?? this.detectProvider(this.apiKey, this.baseUrl);
  }

  private detectProvider(key: string, baseUrl: string): AIProvider {
    if (key.startsWith("sk-ant") || baseUrl.includes("anthropic")) return "anthropic";
    if (baseUrl.includes("deepseek")) return "deepseek";
    return "openai";
  }

  get isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  get providerName(): AIProvider {
    return this.provider;
  }

  /**
   * Send a structured request to the AI model.
   * Supports Anthropic Claude, OpenAI, and DeepSeek (OpenAI-compatible) APIs.
   * Returns null if AI is unavailable — caller MUST fall back to heuristic.
   */
  async query<T>(request: AIRequest & { timeoutMs?: number }): Promise<AIResponse<T> | null> {
    if (!this.isAvailable) {
      logger.warn({ event: "ai_unavailable", provider: this.provider }, `AI service (${this.provider}) not configured — no API key`);
      return null;
    }

    const timeoutMs = request.timeoutMs ?? 30_000;
    const startTime = Date.now();

    try {
      let rawContent: string;
      let modelUsed: string;

      if (this.provider === "anthropic") {
        // Anthropic Claude API
        const response = await fetch(`${this.baseUrl}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: request.maxTokens ?? 2000,
            system: request.systemPrompt,
            messages: [
              { role: "user", content: request.userPrompt + "\n\nRespond with valid JSON only, no markdown formatting." },
            ],
            temperature: request.temperature ?? 0.3,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown");
          logger.error({ event: "ai_api_error", provider: "anthropic", status: response.status, body: errText.slice(0, 200) });
          return null;
        }

        const json = await response.json() as {
          content: Array<{ type: string; text: string }>;
          model: string;
          usage?: { input_tokens: number; output_tokens: number };
        };
        rawContent = json.content?.[0]?.text ?? "";
        modelUsed = json.model;
        if (json.usage) {
          logger.info({
            event: "ai_usage",
            provider: "anthropic",
            model: modelUsed,
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
          }, `Claude: ${json.usage.input_tokens} in / ${json.usage.output_tokens} out`);
        }
      } else {
        // OpenAI API
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
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown");
          logger.error({ event: "ai_api_error", provider: this.provider, status: response.status, body: errText.slice(0, 200) });
          return null;
        }

        const json = await response.json() as {
          choices: Array<{ message: { content: string } }>;
          model: string;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        rawContent = json.choices[0]?.message?.content ?? "";
        modelUsed = json.model;
        if (json.usage) {
          logger.info({
            event: "ai_usage",
            provider: this.provider,
            model: modelUsed,
            inputTokens: json.usage.prompt_tokens,
            outputTokens: json.usage.completion_tokens,
          }, `${this.provider}: ${json.usage.prompt_tokens} in / ${json.usage.completion_tokens} out`);
        }
      }

      if (!rawContent) {
        logger.error({ event: "ai_empty_response" });
        return null;
      }

      // Strip markdown code fences if present (Claude sometimes wraps in ```json)
      rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();

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
        model: modelUsed,
        confidence,
        latencyMs,
        commitmentHash: commitmentHash.slice(0, 18),
      }, `AI query: ${modelUsed} in ${latencyMs}ms (confidence: ${confidence})`);

      return {
        data,
        reasoning: data.reasoning ?? "",
        confidence,
        commitmentHash,
        model: modelUsed,
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

// Singletons — dual-model swarm
// Claude: primary reasoning model (Themis, negotiation Party A)
export const aiService = new AIService();

// DeepSeek: second model family (Athena, Solon, negotiation Party B)
export const deepseekService = new AIService({
  provider: "deepseek",
  apiKey: config.DEEPSEEK_API_KEY ?? "",
  model: config.DEEPSEEK_MODEL,
  baseUrl: config.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
});

/** All configured model services in priority order. */
export const modelServices: AIService[] = [aiService, deepseekService].filter(s => s.isAvailable);

/**
 * Compute a commitment hash for any AI interaction.
 * Can be stored on-chain for verifiability.
 */
export function computeCommitment(prompt: string, response: string): string {
  return "0x" + createHash("sha256").update(prompt + response).digest("hex");
}
