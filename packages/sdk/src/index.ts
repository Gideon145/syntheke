import { createHash } from "node:crypto";

/**
 * Syntheke SDK — TypeScript client library for the Syntheke Protocol.
 *
 * Installation: npm install @syntheke/sdk
 *
 * Usage:
 *   import { SynthekeClient } from '@syntheke/sdk';
 *   const client = new SynthekeClient({ apiKey: 'sk_syntheke_...' });
 *   const pacts = await client.pacts.list();
 */

// ──── Types ──────────────────────────────────────────────

export interface SDKConfig {
  apiKey: string;
  baseUrl?: string;
  chainId?: number;
}

export interface PactTermsInput {
  amount?: string;
  duration?: number;
  collateralRatio?: number;
  interestRate?: number;
  penaltyBps?: number;
  settlementAsset?: string;
}

export interface PactSummary {
  pactId: string;
  state: string;
  partyA: string;
  partyB: string;
  amount: string;
  attestationCount: number;
}

export interface AgentProfile {
  address: string;
  name: string | null;
  capabilities: string[];
  reputationScore: number;
  active: boolean;
}

export interface ReputationHistory {
  address: string;
  score: number;
  pactCount: number;
  completedCount: number;
  breachedCount: number;
  history: Array<{ pactId: string; eventType: string; scoreDelta: number; timestamp: number }>;
}

// ──── Client ─────────────────────────────────────────────

export class SynthekeClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: SDKConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "http://localhost:3001";
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(`Syntheke API error ${resp.status}: ${JSON.stringify(err)}`);
    }

    return resp.json() as Promise<T>;
  }

  // ──── Agents ──────────────────────────────────────────

  agents = {
    get: (address: string) => this.request<AgentProfile>("GET", `/api/v1/agents/${address}`),
    register: (name: string, capabilities: string[], metadataUri?: string) =>
      this.request<{ address: string; status: string }>("POST", "/api/v1/agents/register", { name, capabilities, metadataUri }),
    discover: (params?: { capability?: string; minReputation?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.capability) qs.set("capability", params.capability);
      if (params?.minReputation) qs.set("minReputation", String(params.minReputation));
      if (params?.limit) qs.set("limit", String(params.limit));
      return this.request<{ agents: AgentProfile[]; total: number }>("GET", `/api/v1/agents/discover?${qs}`);
    },
    reputation: (address: string) => this.request<ReputationHistory>("GET", `/api/v1/agents/${address}/reputation`),
  };

  // ──── Pacts ────────────────────────────────────────────

  pacts = {
    list: () => this.request<{ pacts: PactSummary[]; total: number }>("GET", "/api/v1/pacts"),
    get: (pactId: string) => this.request<{ pactId: string; state: string; terms: unknown; attestations: unknown[] }>("GET", `/api/v1/pacts/${pactId}`),
    propose: (counterparty: string, description?: string, terms?: PactTermsInput) =>
      this.request<{ proposer: string; counterparty: string; terms: unknown }>("POST", "/api/v1/pacts/propose", { counterparty, description, ...terms }),
    attestations: (pactId: string) => this.request<{ attestations: unknown[] }>("GET", `/api/v1/pacts/${pactId}/attestations`),
    health: (pactId: string) => this.request<{ state: string; conditions: unknown[] }>("GET", `/api/v1/pacts/${pactId}/health`),
    renegotiate: (pactId: string) => this.request<{ status: string }>("POST", `/api/v1/pacts/${pactId}/renegotiate`),
    terminate: (pactId: string) => this.request<{ status: string }>("POST", `/api/v1/pacts/${pactId}/terminate`),
  };

  // ──── Reputation ───────────────────────────────────────

  reputation = {
    get: (address: string) => this.request<ReputationHistory>("GET", `/api/v1/reputation/${address}`),
    leaderboard: (limit?: number) => this.request<{ leaderboard: Array<{ address: string; score: number }> }>("GET", `/api/v1/reputation/leaderboard?limit=${limit ?? 10}`),
  };

  // ──── Stats ────────────────────────────────────────────

  stats = {
    get: () => this.request<{ totalPacts: number; activePacts: number; totalAgents: number; totalValueLocked: string }>("GET", "/api/v1/stats"),
  };
}

/**
 * Create a client from environment variables.
 * Uses SYNTHEKE_API_KEY and SYNTHEKE_API_URL.
 */
export function createClient(config?: Partial<SDKConfig>): SynthekeClient {
  return new SynthekeClient({
    apiKey: config?.apiKey ?? process.env.SYNTHEKE_API_KEY ?? "",
    baseUrl: config?.baseUrl ?? process.env.SYNTHEKE_API_URL ?? "http://localhost:3001",
    chainId: config?.chainId ?? 1952,
  });
}
