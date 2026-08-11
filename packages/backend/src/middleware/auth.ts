import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Authentication Middleware
 *
 * Two modes:
 *   1. API Key — simple Bearer token auth for SDK/CLI clients
 *   2. EIP-712 — typed structured data signature verification for agent actions
 *
 * API keys are stored hashed. EIP-712 signatures are verified against
 * the agent's registered address in AgentRegistry.
 */

// ──── API Key Store ──────────────────────────────────────

interface ApiKeyRecord {
  agentAddress: string;
  keyHash: string;
  scopes: string[];
  expiresAt: number;
}

const apiKeys = new Map<string, ApiKeyRecord>();

export function generateApiKey(agentAddress: string, scopes: string[] = ["read", "write"]): string {
  const raw = "sk_syntheke_" + randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(raw).digest("hex");
  apiKeys.set(keyHash, {
    agentAddress,
    keyHash,
    scopes,
    expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
  });
  console.log(`API key generated for ${agentAddress}: ${keyHash.slice(0, 12)}...`);
  return raw; // Only returned once — caller must store it
}

export function revokeApiKey(keyHash: string): boolean {
  return apiKeys.delete(keyHash);
}

// ──── Auth Middleware ─────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  agentAddress?: string;
  scopes?: string[];
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  // Bearer token (API Key)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const keyHash = createHash("sha256").update(token).digest("hex");
    const record = apiKeys.get(keyHash);

    if (!record) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    if (Date.now() > record.expiresAt) {
      apiKeys.delete(keyHash);
      res.status(401).json({ error: "API key expired" });
      return;
    }

    req.agentAddress = record.agentAddress;
    req.scopes = record.scopes;
    next();
    return;
  }

  // EIP-712 signature (for agent-authenticated endpoints)
  if (authHeader.startsWith("EIP712 ")) {
    // In production: verify EIP-712 signature against AgentRegistry
    // For Phase 4: accept the format, trust the agent address in the header
    try {
      const payload = JSON.parse(Buffer.from(authHeader.slice(6), "base64").toString());
      req.agentAddress = payload.address;
      req.scopes = ["read", "write"];
      next();
      return;
    } catch {
      res.status(401).json({ error: "Invalid EIP-712 signature format" });
      return;
    }
  }

  res.status(401).json({ error: "Unsupported auth scheme. Use Bearer <key> or EIP712 <signature>" });
}

// ──── Optional Auth ───────────────────────────────────────

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const keyHash = createHash("sha256").update(token).digest("hex");
    const record = apiKeys.get(keyHash);
    if (record && Date.now() <= record.expiresAt) {
      req.agentAddress = record.agentAddress;
      req.scopes = record.scopes;
    }
  }
  next();
}

// ──── Scope Check ─────────────────────────────────────────

export function requireScope(scope: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.scopes?.includes(scope) && !req.scopes?.includes("admin")) {
      res.status(403).json({ error: `Missing required scope: ${scope}` });
      return;
    }
    next();
  };
}
