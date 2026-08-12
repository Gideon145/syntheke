"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { shortAddress } from "@/lib/api";

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:3005";

interface PactDetail {
  pactId?: string;
  lastState?: number;
  degradationCount?: number;
  attestationCount?: number;
  lastAttestationHash?: string;
  lastAttestationBlock?: number;
  partyA?: string;
  partyB?: string;
  error?: string;
}

const STATE_NAMES: Record<number, string> = {
  0: "DRAFT", 1: "NEGOTIATING", 2: "PROPOSED", 3: "COMMITTED",
  4: "ACTIVE", 5: "DEGRADING", 6: "RENEGOTIATING", 7: "BREACHED",
  8: "CURING", 9: "ARBITRATING", 10: "RESOLVING", 11: "SETTLING",
  12: "CLOSED", 13: "EXPIRED", 14: "TERMINATED",
};

const STATE_DESCRIPTIONS: Record<string, string> = {
  DRAFT: "One party has initiated a pact proposal.",
  NEGOTIATING: "Both parties are exchanging and refining terms.",
  PROPOSED: "Terms are finalized and awaiting escrow deposits.",
  COMMITTED: "Escrow deposits in progress.",
  ACTIVE: "Pact is live — autonomous monitoring every 15 seconds.",
  DEGRADING: "Soft conditions trending toward breach. Monitor watching closely.",
  RENEGOTIATING: "Parties are adapting terms to restore pact health.",
  BREACHED: "A hard condition has been violated. Escrow at risk.",
  CURING: "Grace period — breaching party has time to fix the violation.",
  ARBITRATING: "AI mediator swarm evaluating the dispute (3 agents, 2/3 consensus).",
  RESOLVING: "Resolution determined. Computing fair settlement.",
  SETTLING: "Escrow being distributed based on pact outcome.",
  CLOSED: "Pact completed. Reputation scores updated on-chain.",
  EXPIRED: "Pact timed out before activation.",
  TERMINATED: "Mutually terminated by both parties.",
};

const STATE_COLORS: Record<string, string> = {
  ACTIVE: "text-success border-success/30 bg-success/5",
  DEGRADING: "text-warning border-warning/30 bg-warning/5",
  RENEGOTIATING: "text-warning border-warning/30 bg-warning/5",
  BREACHED: "text-danger border-danger/30 bg-danger/5",
  CURING: "text-warning border-warning/30 bg-warning/5",
  ARBITRATING: "text-danger border-danger/30 bg-danger/5",
  RESOLVING: "text-text-secondary border-text-secondary/30 bg-text-secondary/5",
  SETTLING: "text-text-secondary border-text-secondary/30 bg-text-secondary/5",
  CLOSED: "text-text-muted border-text-muted/30 bg-text-muted/5",
  EXPIRED: "text-text-muted border-text-muted/30 bg-text-muted/5",
  TERMINATED: "text-text-muted border-text-muted/30 bg-text-muted/5",
  DRAFT: "text-text-muted border-text-muted/30 bg-text-muted/5",
  NEGOTIATING: "text-text-muted border-text-muted/30 bg-text-muted/5",
  PROPOSED: "text-text-muted border-text-muted/30 bg-text-muted/5",
  COMMITTED: "text-amber border-amber/30 bg-amber/5",
};

export default function PactDetailPage() {
  const { pactId } = useParams<{ pactId: string }>();
  const [pact, setPact] = useState<PactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${AGENT_API}/pacts/${pactId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) setPact(await r.json());
      } catch { /* agent offline */ }
      setLoading(false);
    };
    if (pactId) load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [pactId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="animate-spin w-6 h-6 rounded-full border-2 border-amber border-t-transparent mx-auto mb-4" />
        <p className="text-text-muted text-sm">Loading pact from X Layer...</p>
      </div>
    );
  }

  if (!pact || pact.error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-text-muted">Pact not found or agent offline.</p>
        <a href="/pacts" className="text-amber text-sm hover:underline mt-4 inline-block">← Back to pacts</a>
      </div>
    );
  }

  const stateName = STATE_NAMES[pact.lastState ?? 4] ?? "ACTIVE";
  const stateDesc = STATE_DESCRIPTIONS[stateName] ?? "";
  const stateColor = STATE_COLORS[stateName] ?? "text-text-muted border-text-muted/30 bg-text-muted/5";

  // Lifecycle steps for visual timeline
  const lifecycle = Object.entries(STATE_NAMES).map(([num, name]) => ({
    num: parseInt(num),
    name,
    active: (pact.lastState ?? 4) >= parseInt(num),
    current: (pact.lastState ?? 4) === parseInt(num),
  }));

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in-slow">
      <a href="/pacts" className="text-text-muted text-sm hover:text-amber transition-colors mb-8 inline-block">← Back to pacts</a>

      <div className="mb-10">
        <h1 className="page-title mb-2">Pact Detail</h1>
        <code className="text-sm text-text-muted font-mono break-all">{pactId}</code>
      </div>

      {/* Current State */}
      <div className={`card-glow p-6 mb-8 border-l-2 ${stateName === "ACTIVE" ? "border-l-success" : stateName === "BREACHED" ? "border-l-danger" : "border-l-amber"}`}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-text-muted uppercase tracking-wider">Current State</span>
          <span className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${stateColor}`}>{stateName}</span>
        </div>
        <p className="text-text-secondary text-sm leading-relaxed">{stateDesc}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {[
          { label: "Attestations", value: String(pact.attestationCount ?? 0) },
          { label: "Degradations", value: String(pact.degradationCount ?? 0) },
          { label: "Last Block", value: pact.lastAttestationBlock ? `#${pact.lastAttestationBlock.toLocaleString()}` : "—" },
          { label: "State ID", value: String(pact.lastState ?? "—") },
        ].map(m => (
          <div key={m.label} className="metric-card">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value text-base">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="card-glow p-4">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Party A</div>
          {pact.partyA && pact.partyA !== "0x0000000000000000000000000000000000000000" ? (
            <>
              <code className="text-sm font-mono text-text-primary">{shortAddress(pact.partyA)}</code>
              <a href={`https://www.oklink.com/x-layer-testnet/address/${pact.partyA}`} target="_blank" rel="noopener"
                className="text-amber text-xs hover:underline mt-1.5 inline-block">View on Explorer →</a>
            </>
          ) : (
            <span className="text-sm text-text-muted">Not yet joined</span>
          )}
        </div>
        <div className="card-glow p-4">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Party B</div>
          {pact.partyB && pact.partyB !== "0x0000000000000000000000000000000000000000" ? (
            <>
              <code className="text-sm font-mono text-text-primary">{shortAddress(pact.partyB)}</code>
              <a href={`https://www.oklink.com/x-layer-testnet/address/${pact.partyB}`} target="_blank" rel="noopener"
                className="text-amber text-xs hover:underline mt-1.5 inline-block">View on Explorer →</a>
            </>
          ) : (
            <span className="text-sm text-text-muted">Not yet joined</span>
          )}
        </div>
      </div>

      {/* Lifecycle Timeline */}
      <div className="card-glow p-6 mb-10">
        <div className="text-sm font-semibold text-text-primary mb-6">Lifecycle Progress</div>
        <div className="space-y-0">
          {lifecycle.map((step, i) => (
            <div key={step.name} className="flex items-start gap-3">
              {/* Connector line */}
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 transition-colors ${
                  step.current ? "bg-amber border-amber" :
                  step.active ? "bg-amber/40 border-amber/60" :
                  "bg-bg border-border"
                }`} />
                {i < lifecycle.length - 1 && (
                  <div className={`w-0.5 h-8 -mb-2 ${
                    lifecycle[i + 1].active ? "bg-amber/30" : "bg-border"
                  }`} />
                )}
              </div>
              <div className="pb-5">
                <span className={`text-sm font-medium ${
                  step.current ? "text-amber" :
                  step.active ? "text-text-secondary" :
                  "text-text-muted"
                }`}>
                  {step.num}. {step.name}
                </span>
                {step.current && (
                  <span className="ml-2 text-xs text-amber animate-pulse">◀ current</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* On-chain link */}
      <div className="text-center">
        <a href={`https://www.oklink.com/x-layer-testnet/address/0xe465405380E2E0f625028447E85917662E71ad42`} target="_blank" rel="noopener"
          className="text-text-muted text-xs hover:text-amber transition-colors">
          View SynthekeContract on X Layer Explorer →
        </a>
      </div>
    </div>
  );
}
