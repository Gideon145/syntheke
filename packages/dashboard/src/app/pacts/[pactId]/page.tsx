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
  adversarial?: boolean;
  error?: string;
}

interface NegotiationTranscript {
  status: string;
  round: number;
  partyAPersona: string;
  partyBPersona: string;
  transcript: Array<{
    round: number;
    speaker: string;
    model: string;
    action: string;
    message: string;
    reasoning?: string;
  }>;
}

interface PactContract {
  title: string;
  preamble: string;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
  version: number;
  model: string;
}

interface EscrowPosition {
  pactId: string;
  amountAFormatted: string;
  amountBFormatted: string;
  totalFormatted: string;
  settled: boolean;
}

interface VoteRound {
  address: string;
  pactId: string;
  mediators: Array<{ address: string; committed: boolean; commitment: string; revealed: boolean }>;
  votes: Array<{ mediator: string; verdict: string; fairnessScore: number; reasonHash: string }>;
  commitCount: number;
  roundComplete: boolean;
}

interface PaymentsState {
  priceFormatted: string;
  asset: string;
  settledCount: number;
  totalCollected: string;
}

interface FeedbackPending {
  pending: Array<{ id: number; pactId: string; party: string; score: number; okxAgentId: string | null; submitted?: boolean }>;
  total: number;
}

interface ArtifactsState {
  address: string;
  count: number;
  artifacts: Array<{ hash: string; kind: string; producer: string; version: number }>;
  localChecks: Array<{ kind: string; hash: string; onChain: boolean }>;
  allVerified: boolean;
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

// Contextual explanations for each state transition
const STATE_TRANSITIONS: Record<string, string> = {
  DRAFT: "Pact proposal created by Party A — awaiting counterparty.",
  NEGOTIATING: "Party B joined. Claude generating terms from natural language description.",
  PROPOSED: "Terms finalized and hashed on-chain. Both parties must now commit escrow.",
  COMMITTED: "Escrow deposited by both parties. Pact is locked and irreversible.",
  ACTIVE: "Autonomous monitoring live — checking conditions every 15 seconds on X Layer.",
  DEGRADING: "Soft conditions trending toward breach. Monitor watching closely for escalation.",
  RENEGOTIATING: "AI proposed adaptive terms to restore pact health before hard breach triggers.",
  BREACHED: "Hard condition violated. Oracle data confirms SLA failure. Escrow now at risk.",
  CURING: "Grace period active — breaching party has limited blocks to restore compliance.",
  ARBITRATING: "Cure deadline expired. AI mediator swarm (Themis·Athena·Solon) evaluating dispute.",
  RESOLVING: "Mediation complete. Computing fair settlement distribution based on verdict.",
  SETTLING: "Escrow being distributed on-chain per the resolution terms.",
  CLOSED: "Pact lifecycle complete. Escrow settled, reputation scores updated on AgentRegistry.",
  EXPIRED: "Pact timed out before activation — never reached COMMITTED state.",
  TERMINATED: "Both parties mutually agreed to cancel this pact.",
};

export default function PactDetailPage() {
  const { pactId } = useParams<{ pactId: string }>();
  const [pact, setPact] = useState<PactDetail | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationTranscript | null>(null);
  const [contract, setContract] = useState<PactContract | null>(null);
  const [escrowPos, setEscrowPos] = useState<EscrowPosition | null>(null);
  const [voteRound, setVoteRound] = useState<VoteRound | null>(null);
  const [payments, setPayments] = useState<PaymentsState | null>(null);
  const [premium, setPremium] = useState<{ status: "idle" | "locked" | "unlocked"; offer?: { x402Version?: number; accepts?: Array<{ amount?: string; asset?: string; network?: string; scheme?: string }> }; data?: { attestationHistory?: unknown[]; onChain?: Record<string, unknown> } }>({ status: "idle" });
  const [feedback, setFeedback] = useState<FeedbackPending["pending"]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactsState | null>(null);
  const [liveMoves, setLiveMoves] = useState<NegotiationTranscript["transcript"]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${AGENT_API}/pacts/${pactId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) setPact(await r.json());
      } catch { /* agent offline */ }
      try {
        const r = await fetch(`${AGENT_API}/negotiations/${pactId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) setNegotiation(await r.json());
      } catch { /* no negotiation session */ }
      try {
        const r = await fetch(`${AGENT_API}/contracts/${pactId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) setContract(await r.json());
      } catch { /* no contract */ }
      try {
        const r = await fetch(`${AGENT_API}/escrow`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          const data = await r.json();
          const pos = data.positions?.find((p: EscrowPosition) => p.pactId === pactId);
          if (pos) setEscrowPos(pos);
        }
      } catch { /* no escrow */ }
      try {
        const r = await fetch(`${AGENT_API}/votes/${pactId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) setVoteRound(await r.json());
      } catch { /* no vote round */ }
      try {
        const r = await fetch(`${AGENT_API}/payments`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) setPayments(await r.json());
      } catch { /* payments unavailable */ }
      try {
        const r = await fetch(`${AGENT_API}/feedback/pending`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          const data = await r.json() as FeedbackPending;
          setFeedback(data.pending?.filter(f => f.pactId === pactId) ?? []);
        }
      } catch { /* feedback unavailable */ }
      try {
        const r = await fetch(`${AGENT_API}/artifacts/${pactId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) setArtifacts(await r.json());
      } catch { /* artifacts unavailable */ }
      setLoading(false);
    };
    if (pactId) load();
    const i = setInterval(load, 10000);

    // Live SSE theater stream (Batch 3, Feature 8) — falls back to polling above
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${AGENT_API}/theater/stream/${pactId}`);
      es.addEventListener("snapshot", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (data.status && data.status !== "not-found") setNegotiation(data);
        } catch { /* skip */ }
      });
      es.addEventListener("move", (e) => {
        try {
          const move = JSON.parse((e as MessageEvent).data);
          setLiveMoves(prev => [...prev, move]);
        } catch { /* skip */ }
      });
    } catch { es = null; }

    return () => { clearInterval(i); es?.close(); };
  }, [pactId]);

  // x402 premium unlock — first hit returns HTTP 402 with the payment offer
  const unlockPremium = async () => {
    try {
      const r = await fetch(`${AGENT_API}/premium/timeline/${pactId}`);
      if (r.status === 402) {
        const offer = await r.json();
        setPremium({ status: "locked", offer });
      } else if (r.ok) {
        const data = await r.json();
        setPremium({ status: "unlocked", data });
      }
    } catch { /* agent offline */ }
  };

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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 animate-fade-in-slow">
      <a href="/pacts" className="text-text-muted text-sm hover:text-amber transition-colors mb-6 sm:mb-8 inline-block">← Back to pacts</a>

      <div className="mb-8 sm:mb-10">
        <h1 className="page-title mb-2 text-2xl sm:text-3xl">Pact Detail</h1>
        <code className="text-xs sm:text-sm text-text-muted font-mono break-all">{pactId}</code>
        {pact.adversarial && (
          <span className="mt-3 inline-block px-3 py-1 rounded-md text-xs font-bold border border-danger/40 bg-danger/10 text-danger">
            ⚔️ Adversarial public pact
          </span>
        )}
      </div>

      {/* Real Escrow */}
      {escrowPos && (
        <div className="card-glow p-4 sm:p-6 mb-6 sm:mb-8 border-l-2 border-l-amber">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm text-text-muted uppercase tracking-wider">Escrow (EscrowVaultV2)</span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${escrowPos.settled ? "text-success border-success/30 bg-success/5" : "text-amber border-amber/30 bg-amber/5"}`}>
              {escrowPos.settled ? "✓ Settled — funds paid out" : "🔒 Locked in custody"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-bg border border-border">
              <div className="text-lg font-mono text-text-primary">{escrowPos.amountAFormatted}</div>
              <div className="text-xs text-text-muted mt-1">Party A · TestUSDC</div>
            </div>
            <div className="p-3 rounded-lg bg-bg border border-border">
              <div className="text-lg font-mono text-amber">{escrowPos.totalFormatted}</div>
              <div className="text-xs text-text-muted mt-1">Total escrow</div>
            </div>
            <div className="p-3 rounded-lg bg-bg border border-border">
              <div className="text-lg font-mono text-text-primary">{escrowPos.amountBFormatted}</div>
              <div className="text-xs text-text-muted mt-1">Party B · TestUSDC</div>
            </div>
          </div>
        </div>
      )}

      {/* On-chain mediator votes — commit-reveal (Batch 2) */}
      {voteRound && (voteRound.commitCount > 0 || voteRound.votes.length > 0) && (
        <div className="card-glow p-4 sm:p-6 mb-6 sm:mb-8 border-l-2 border-l-lantern">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm text-text-muted uppercase tracking-wider">Mediator Votes — Commit-Reveal</span>
            <span className="text-[10px] font-mono text-text-muted break-all max-w-[50%] text-right">{voteRound.address}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {voteRound.mediators.map((m, i) => (
              <div key={i} className="p-3 rounded-lg bg-bg border border-border text-xs">
                <div className="font-mono text-text-primary truncate">{m.address}</div>
                <div className="mt-1.5 space-y-1">
                  <div className={m.committed ? "text-success" : "text-text-muted"}>
                    {m.committed ? "✓ committed" : "○ not committed"}
                  </div>
                  <div className={m.revealed ? "text-success" : "text-text-muted"}>
                    {m.revealed ? "✓ revealed" : "○ not revealed"}
                  </div>
                  {m.commitment && (
                    <div className="font-mono text-[10px] text-text-muted truncate">#{m.commitment.slice(0, 18)}…</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {voteRound.votes.length > 0 && (
            <div className="space-y-2">
              {voteRound.votes.map((v, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-bg/60 border border-border text-xs">
                  <span className="font-mono text-text-primary">{v.mediator}</span>
                  <span className={`px-2 py-0.5 rounded font-semibold uppercase ${v.verdict === "approve" ? "bg-success/10 text-success" : v.verdict === "reject" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                    {v.verdict}
                  </span>
                  <span className="font-mono text-text-muted">fairness {v.fairnessScore}/100</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-text-muted mt-3">
            🔐 Commitments land before any reveal — verified on-chain, no verdict copying possible.
          </p>
        </div>
      )}

      {/* Verifiable AI artifacts on-chain (Batch 3, Feature 7) */}
      {artifacts && artifacts.count > 0 && (
        <div className="card-glow p-4 sm:p-6 mb-6 sm:mb-8 border-l-2 border-l-success">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm text-text-muted uppercase tracking-wider">AI Artifacts — On-Chain Provenance</span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${artifacts.allVerified ? "text-success border-success/30 bg-success/5" : "text-warning border-warning/30 bg-warning/5"}`}>
              {artifacts.allVerified ? "✓ All verified on-chain" : `◐ ${artifacts.localChecks.filter(c => c.onChain).length}/${artifacts.localChecks.length} verified`}
            </span>
          </div>
          <div className="space-y-1.5">
            {artifacts.artifacts.slice(-8).reverse().map((a, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-bg/60 border border-border text-xs">
                <span className="font-mono text-text-secondary">{a.kind}</span>
                <span className="font-mono text-text-muted truncate max-w-[40%]">#{a.hash.slice(0, 20)}…</span>
                <span className="text-[10px] text-text-muted">{a.producer} v{a.version}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-muted mt-3">
            🔏 Every AI output — negotiation moves, contract prose, mediation reasoning — hashed and
            recorded in the <span className="font-mono">{artifacts.address}</span> registry. What you read is provably what the AI produced.
          </p>
        </div>
      )}

      {/* Premium timeline — x402 payment-gated (Batch 2) */}
      <div className="card-glow p-4 sm:p-6 mb-6 sm:mb-8 border-l-2 border-l-amber">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs sm:text-sm text-text-muted uppercase tracking-wider">Premium Timeline</span>
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold border text-amber border-amber/30 bg-amber/5">x402 · OKX Agent Payments</span>
        </div>
        {premium.status === "idle" && (
          <button
            onClick={unlockPremium}
            className="w-full py-2.5 rounded-lg border border-amber/40 text-amber text-sm font-semibold hover:bg-amber/5 transition-colors"
          >
            🔓 Unlock full attestation history
          </button>
        )}
        {premium.status === "locked" && premium.offer && (
          <div className="text-sm">
            <p className="text-text-secondary mb-2">This endpoint is payment-gated. The agent replied with <code className="font-mono text-xs text-amber">HTTP 402 Payment Required</code>:</p>
            <div className="p-3 rounded-lg bg-bg border border-border text-xs font-mono space-y-1 text-text-secondary">
              <div>scheme: <span className="text-text-primary">{premium.offer.accepts?.[0]?.scheme}</span></div>
              <div>network: <span className="text-text-primary">{premium.offer.accepts?.[0]?.network}</span></div>
              <div>asset: <span className="text-text-primary break-all">{premium.offer.accepts?.[0]?.asset}</span></div>
              <div>price: <span className="text-amber">{payments?.priceFormatted ?? "1.0"} TUSD9</span></div>
            </div>
            <p className="text-[11px] text-text-muted mt-2">
              Pay with the **OKX Agent Payments Protocol** — any OKX.AI agent (or the onchainos CLI) signs the
              transfer authorization and replays the request with <code className="font-mono">PAYMENT-SIGNATURE</code>.
              Settlement lands on X Layer instantly.
            </p>
            <button
              onClick={unlockPremium}
              className="mt-3 w-full py-2 rounded-lg border border-border text-text-muted text-xs hover:text-amber transition-colors"
            >
              ↻ Retry (after paying)
            </button>
          </div>
        )}
        {premium.status === "unlocked" && premium.data && (
          <div className="text-sm">
            <p className="text-success font-semibold mb-2">✓ Payment settled — premium timeline unlocked</p>
            <div className="p-3 rounded-lg bg-bg border border-border text-xs font-mono text-text-secondary space-y-1">
              <div>attestationHistory: <span className="text-amber">{premium.data.attestationHistory?.length ?? 0} events</span></div>
              {premium.data.onChain && (
                <div>onChain: <span className="text-text-primary">{JSON.stringify(premium.data.onChain).slice(0, 90)}…</span></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ERC-8004 feedback dual-write badge (Batch 2) */}
      {feedback.length > 0 && (
        <div className="card-glow p-4 sm:p-5 mb-6 sm:mb-8 border-l-2 border-l-success flex items-center gap-3">
          <span className="text-xl">⭐</span>
          <div>
            <div className="text-sm font-semibold text-text-primary">
              OKX marketplace feedback queued — {feedback.length} review{feedback.length > 1 ? "s" : ""}
            </div>
            <div className="text-xs text-text-muted">
              {feedback.map(f => `${f.party.slice(0, 6)}… → ${f.score}/5`).join(" · ")} — synced to the ERC-8004 registry by the bridge runner.
            </div>
          </div>
        </div>
      )}

      {/* Current State */}
      <div className={`card-glow p-4 sm:p-6 mb-6 sm:mb-8 border-l-2 ${stateName === "ACTIVE" ? "border-l-success" : stateName === "BREACHED" ? "border-l-danger" : "border-l-amber"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4">
          <span className="text-xs sm:text-sm text-text-muted uppercase tracking-wider">Current State</span>
          <span className={`self-start sm:self-auto px-3 py-1.5 rounded-md text-sm font-semibold border ${stateColor}`}>{stateName}</span>
        </div>
        <p className="text-text-secondary text-sm leading-relaxed">{stateDesc}</p>
      </div>

      {/* Plain-English Contract */}
      {contract && (
        <div className="card-glow overflow-hidden !cursor-default border-l-2 border-l-lantern mb-8">
          <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-text-primary">
              📜 The Contract
              {contract.version > 1 && (
                <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg border border-border text-text-muted">v{contract.version}</span>
              )}
            </div>
            <span className="text-[10px] font-mono text-text-muted">written by {contract.model}</span>
          </div>
          <div className="p-5">
            <h3 className="text-base font-serif font-semibold text-lantern mb-2">{contract.title}</h3>
            <p className="text-xs text-text-muted italic mb-4 leading-relaxed">{contract.preamble}</p>
            <div className="space-y-3">
              {contract.sections.map((s, i) => (
                <div key={i} className="p-3 rounded-lg bg-bg/60 border border-border">
                  <div className="text-xs font-semibold text-amber uppercase tracking-wider mb-1">{s.heading}</div>
                  <p className="text-sm text-text-secondary leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-4 border-t border-border pt-3">
              🔏 Contract commitment: SHA-256 hashed and tied to on-chain terms.
            </p>
          </div>
        </div>
      )}

      {/* Live AI Negotiation Transcript */}
      {negotiation && negotiation.transcript.length > 0 && (
        <div className="card-glow overflow-hidden !cursor-default border-l-2 border-l-amber mb-8">
          <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-text-primary">
              🤖 Live AI Negotiation
              <span className={`ml-2 text-xs font-mono px-2 py-0.5 rounded ${negotiation.status === "accepted" ? "bg-success/10 text-success" : negotiation.status === "failed" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                {negotiation.status.toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-text-muted font-mono">
              {negotiation.round} rounds · {negotiation.transcript.length} moves
            </span>
          </div>
          <div className="divide-y divide-border">
            {negotiation.transcript.map((m, i) => (
              <div key={i} className={`px-5 py-4 ${m.speaker === "A" ? "bg-amber/[0.02]" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-sm font-bold ${m.speaker === "A" ? "text-amber" : "text-lantern"}`}>
                    {m.speaker === "A" ? `🧠 ${negotiation.partyAPersona}` : `🤖 ${negotiation.partyBPersona}`}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg border border-border text-text-muted">
                    {m.model}
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${m.action === "accept" ? "bg-success/10 text-success" : m.action === "reject" ? "bg-danger/10 text-danger" : m.action === "error" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                    {m.action}
                  </span>
                  <span className="text-[10px] text-text-muted">round {m.round}</span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{m.message}</p>
                {m.reasoning && (
                  <details className="mt-2">
                    <summary className="text-xs text-text-muted cursor-pointer hover:text-amber transition-colors">View reasoning</summary>
                    <p className="text-xs text-text-muted mt-1.5 leading-relaxed border-l border-border pl-3">{m.reasoning}</p>
                  </details>
                )}
              </div>
            ))}
            {liveMoves.map((m, i) => (
              <div key={`live-${i}`} className="px-5 py-4 border-t border-amber/20 bg-amber/[0.03]">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-sm font-bold ${m.speaker === "A" ? "text-amber" : "text-lantern"}`}>
                    {m.speaker === "A" ? `🧠 ${negotiation.partyAPersona}` : `🤖 ${negotiation.partyBPersona}`}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg border border-border text-text-muted">
                    {m.model}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase bg-success/10 text-success animate-pulse">
                    ● LIVE
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${m.action === "accept" ? "bg-success/10 text-success" : m.action === "reject" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                    {m.action}
                  </span>
                  <span className="text-[10px] text-text-muted">round {m.round}</span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{m.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-8 sm:mb-10">
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
              <a href={`https://www.oklink.com/xlayer/address/${pact.partyA}`} target="_blank" rel="noopener"
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
              <a href={`https://www.oklink.com/xlayer/address/${pact.partyB}`} target="_blank" rel="noopener"
                className="text-amber text-xs hover:underline mt-1.5 inline-block">View on Explorer →</a>
            </>
          ) : (
            <span className="text-sm text-text-muted">Not yet joined</span>
          )}
        </div>
      </div>

      {/* Invite Party B — shown for DRAFT pacts without Party B */}
      {stateName === "DRAFT" && pact.partyB === "0x0000000000000000000000000000000000000000" && (
        <div className="card-glow p-5 mb-10 border-dashed border border-amber/20 !cursor-default">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">📨</span>
            <span className="text-sm font-semibold text-text-primary">Invite Party B</span>
          </div>
          <p className="text-xs text-text-muted mb-3 leading-relaxed">
            Share this with the counterparty. Their agent can join by calling the Syntheke endpoint:
          </p>
          <div className="bg-bg rounded-lg p-3 font-mono text-xs text-text-secondary break-all mb-3">
            POST {AGENT_API}/pacts/join<br/>
            {'{'} "pactId": "{pactId}" {'}'}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`Accept pact ${pactId} — join this autonomous treaty on Syntheke. Call POST /pacts/join with the pact ID.`).catch(() => {});
            }}
            className="text-xs text-amber hover:text-lantern transition-colors"
          >
            📋 Copy invite prompt
          </button>
        </div>
      )}

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
                <span className={`text-base font-medium ${
                  step.current ? "text-amber" :
                  step.active ? "text-text-secondary" :
                  "text-text-muted"
                }`}>
                  {step.num}. {step.name}
                </span>
                {step.current && (
                  <span className="ml-2 text-xs text-amber animate-pulse">◀ current</span>
                )}
                {step.active && STATE_TRANSITIONS[step.name] && (
                  <p className={`text-sm mt-1 leading-relaxed max-w-md ${
                    step.current ? "text-text-secondary" : "text-text-muted"
                  }`}>
                    {STATE_TRANSITIONS[step.name]}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* On-chain link */}
      <div className="text-center">
        <a href={`https://www.oklink.com/xlayer/address/0xe465405380E2E0f625028447E85917662E71ad42`} target="_blank" rel="noopener"
          className="text-text-muted text-xs hover:text-amber transition-colors">
          View SynthekeContract on X Layer Explorer →
        </a>
      </div>
    </div>
  );
}
