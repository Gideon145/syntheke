const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:3005";

export interface AgentStatus {
  agent: string;
  chainId: number;
  cycles: number;
  attestations: number;
  pactsMonitored: number;
  running: boolean;
  lastCycle: number | null;
}

export interface PactSummary {
  pactId: string;
  state: string;
  partyA: string;
  partyB: string;
  attestationCount: number;
}

export async function fetchAgentStatus(): Promise<AgentStatus | null> {
  try {
    const r = await fetch(`${AGENT_API}/status`, { signal: AbortSignal.timeout(5000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchPacts(): Promise<PactSummary[]> {
  try {
    const r = await fetch(`${AGENT_API}/pacts`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const data = await r.json();
    return data.pacts ?? [];
  } catch { return []; }
}

export async function fetchIntegrations(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${AGENT_API}/integrations`, { signal: AbortSignal.timeout(5000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export function shortAddress(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export const STATE_COLORS: Record<string, string> = {
  ACTIVE: "bg-success", DEGRADING: "bg-warning", RENEGOTIATING: "bg-warning",
  BREACHED: "bg-danger", CURING: "bg-warning", ARBITRATING: "bg-danger",
  RESOLVING: "bg-warning", SETTLING: "bg-success", CLOSED: "bg-muted",
  DRAFT: "bg-muted", NEGOTIATING: "bg-muted", PROPOSED: "bg-muted",
  COMMITTED: "bg-muted", EXPIRED: "bg-muted", TERMINATED: "bg-muted",
};

export function stateLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
