/**
 * AI Input Guard — Prompt injection defense and input sanitization.
 *
 * All text that enters an LLM prompt passes through this module first.
 * We don't trust agent-supplied text, even from registered agents.
 *
 * Layers:
 *   1. Unicode normalization — strip zero-width chars, homoglyphs
 *   2. Structural validation — reject obviously malformed input
 *   3. Length limits — prevent context-window stuffing
 *   4. Pattern detection — known injection patterns
 */

// ──── Unicode Normalization ───────────────────────────────

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064]/g;
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic → Latin lookalikes
  "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c",
  "\u0443": "y", "\u0445": "x", "\u0410": "A", "\u0415": "E", "\u041E": "O",
  "\u0420": "P", "\u0421": "C", "\u0425": "X", "\u041C": "M", "\u0422": "T",
};

export function normalizeUnicode(input: string): string {
  // Strip zero-width characters
  let normalized = input.replace(ZERO_WIDTH_CHARS, "");

  // Replace common homoglyphs
  for (const [glyph, replacement] of Object.entries(HOMOGLYPH_MAP)) {
    normalized = normalized.replaceAll(glyph, replacement);
  }

  // NFC normalization
  normalized = normalized.normalize("NFC");

  return normalized;
}

// ──── Input Sanitization ──────────────────────────────────

const MAX_INPUT_LENGTH = 4000; // Characters
const MAX_EVIDENCE_ITEMS = 20;

export interface SanitizedInput {
  text: string;
  truncated: boolean;
  warnings: string[];
}

export function sanitizeAgentInput(raw: string, context: string): SanitizedInput {
  const warnings: string[] = [];

  // Normalize Unicode
  let text = normalizeUnicode(raw);

  // Check for command injection patterns
  if (/rm\s+-rf|wget\s+|curl\s+|&&|\|\||`[^`]+`|\$\(/.test(text)) {
    warnings.push(`Command injection pattern detected in ${context}`);
    // Strip shell metacharacters
    text = text.replace(/[;&|`$(){}[\]]/g, "");
  }

  // Check for prompt injection attempts
  const injectionPatterns = [
    /ignore (all )?(previous|above|prior) instructions/i,
    /you are now/i,
    /new system prompt/i,
    /override/i,
    /bypass/i,
    /pretend you are/i,
    /do not follow/i,
  ];
  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) {
      warnings.push(`Prompt injection pattern detected in ${context}: "${text.match(pattern)?.[0]}"`);
    }
  }

  // Truncate if too long
  let truncated = false;
  if (text.length > MAX_INPUT_LENGTH) {
    text = text.slice(0, MAX_INPUT_LENGTH) + "...[truncated]";
    truncated = true;
  }

  return { text, truncated, warnings };
}

// ──── Structural Validation ───────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validatePactProposalInput(input: string): ValidationResult {
  if (!input || input.trim().length === 0) {
    return { valid: false, reason: "Empty input" };
  }
  if (input.length < 10) {
    return { valid: false, reason: "Input too short for meaningful pact terms" };
  }
  if (input.length > 8000) {
    return { valid: false, reason: "Input exceeds maximum length" };
  }
  // Reject obviously non-pact inputs
  const nonPactPatterns = [/what('?s| is) your name/i, /tell me a joke/i, /write (a|me) (poem|song|story)/i];
  for (const pattern of nonPactPatterns) {
    if (pattern.test(input)) {
      return { valid: false, reason: "Input does not appear to describe a pact proposal" };
    }
  }
  return { valid: true };
}

export function validateEvidenceInputs(evidence: string[]): ValidationResult {
  if (evidence.length === 0) {
    return { valid: false, reason: "No evidence provided" };
  }
  if (evidence.length > MAX_EVIDENCE_ITEMS) {
    return { valid: false, reason: `Too many evidence items (max ${MAX_EVIDENCE_ITEMS})` };
  }
  for (const item of evidence) {
    if (item.length > 2000) {
      return { valid: false, reason: "Evidence item exceeds maximum length" };
    }
  }
  return { valid: true };
}
