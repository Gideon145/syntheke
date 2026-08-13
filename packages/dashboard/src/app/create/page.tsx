"use client";

import { useState } from "react";
import { shortAddress } from "@/lib/api";

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:3005";

interface PactResult {
  success: boolean;
  pactId?: string;
  terms?: Record<string, string>;
  partyA?: string;
  partyB?: string;
  state?: string;
  txHash?: string;
  reasoning?: string;
  error?: string;
  treasuryFee?: {
    amount: string;
    txHash: string;
    totalCollected: string;
  };
  contract?: {
    title: string;
    preamble: string;
    summary: string;
    sections: Array<{ heading: string; body: string }>;
    version: number;
    model: string;
  };
  negotiation?: {
    status: string;
    rounds: number;
    models: Record<string, string>;
    transcript: Array<{
      round: number;
      speaker: string;
      model: string;
      action: string;
      message: string;
      reasoning?: string;
    }>;
  };
}

export default function CreatePactPage() {
  const [partyADesc, setPartyADesc] = useState("");
  const [partyBDesc, setPartyBDesc] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PactResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!description || description.length < 10) {
      setError("Pact description must be at least 10 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const r = await fetch(`${AGENT_API}/pacts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyADesc: partyADesc || "Agent Alpha",
          partyBDesc: partyBDesc || "Agent Beta",
          description,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data: PactResult = await r.json();
      setResult(data);
      if (!data.success) setError(data.error ?? "Creation failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  const termLabels: Record<string, string> = {
    amount: "Escrow Amount (wei)",
    settlementAsset: "Settlement Asset",
    duration: "Duration (blocks)",
    collateralRatio: "Collateral Ratio (bps)",
    liquidationThreshold: "Liquidation Threshold (bps)",
    interestRate: "Interest Rate (bps)",
    penaltyBps: "Penalty (bps)",
    breachGraceBlocks: "Breach Grace (blocks)",
    renegotiationWindow: "Renegotiation Window (blocks)",
    maxRenegotiationRounds: "Max Renegotiation Rounds",
    monitoredConditions: "Monitored Conditions (bitmap)",
  };

  function formatTermValue(key: string, val: string): string {
    if (key === "settlementAsset" && val === "0x0000000000000000000000000000000000000000") return "ETH (native)";
    if (["collateralRatio", "liquidationThreshold", "interestRate", "penaltyBps"].includes(key)) {
      return `${(Number(val) / 100).toFixed(2)}%`;
    }
    return val;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 animate-fade-in">
      <h1 className="page-title mb-2 text-2xl sm:text-3xl">Create a Pact</h1>
      <p className="page-subtitle mb-8 sm:mb-10 text-sm sm:text-base">
        Describe two AI agents and the economic treaty they want to form.
        Syntheke&apos;s AI negotiator generates terms, then the pact goes live on X Layer.
      </p>

      <form onSubmit={handleCreate} className="space-y-5 sm:space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Party A (Initiator)
            </label>
            <input
              type="text"
              value={partyADesc}
              onChange={(e) => setPartyADesc(e.target.value)}
              placeholder="e.g. DeFi yield optimizer agent"
              className="w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:ring-2 focus:ring-okx/40 focus:border-okx/30 transition-all duration-200
                         hover:border-border-glow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Party B (Counterparty)
            </label>
            <input
              type="text"
              value={partyBDesc}
              onChange={(e) => setPartyBDesc(e.target.value)}
              placeholder="e.g. Liquidity provisioning agent"
              className="w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:ring-2 focus:ring-okx/40 focus:border-okx/30 transition-all duration-200
                         hover:border-border-glow"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            What should the pact do?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Agent Alpha pays 100 USDC monthly to Agent Beta for real-time liquidation monitoring of their Aave positions. If Beta misses 3 consecutive checks, Alpha can claim 50% of escrow."
            rows={5}
            className="w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:ring-2 focus:ring-okx/40 focus:border-okx/30 transition-all duration-200
                       hover:border-border-glow resize-y"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3.5 !text-base"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2.5">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI negotiating terms...
            </span>
          ) : (
            "Create Pact on X Layer"
          )}
        </button>
      </form>

      {result?.success && (
        <div className="mt-10 space-y-6 animate-slide-up">
          {/* Success Banner */}
          <div className="card-glow p-6 border-l-2 border-l-success !cursor-default">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🏛️</span>
              <span className="text-lg font-bold text-success">Pact Created!</span>
            </div>
            <p className="text-sm text-text-secondary">
              State: <code className="text-text-primary font-mono">{result.state}</code> ·{" "}
              <a
                href={`https://www.oklink.com/xlayer/address/${result.partyA}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-okx hover:underline"
              >
                View on X Layer Explorer →
              </a>
            </p>
            {result.txHash && (
              <p className="text-xs text-text-muted mt-2 font-mono break-all">
                TX: {result.txHash}
              </p>
            )}
            {result.treasuryFee && (
              <p className="text-xs text-amber mt-2">
                🏦 Treasury fee paid: {Number(BigInt(result.treasuryFee.amount)) / 1e18} OKB · total collected: {Number(BigInt(result.treasuryFee.totalCollected)) / 1e18} OKB
              </p>
            )}
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card-glow p-4 !cursor-default">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Party A (Initiator)</div>
              <code className="text-sm font-mono text-text-primary">{result.partyA ? shortAddress(result.partyA) : "—"}</code>
              <div className="text-xs text-text-muted mt-1.5">{partyADesc || "Agent Alpha"}</div>
            </div>
            <div className="card-glow p-4 !cursor-default">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Party B (Counterparty)</div>
              <code className="text-sm font-mono text-text-primary">{result.partyB ? shortAddress(result.partyB) : "—"}</code>
              <div className="text-xs text-text-muted mt-1.5">{partyBDesc || "Agent Beta"}</div>
            </div>
          </div>

          {/* Pact ID */}
          <div className="card-glow p-4 !cursor-default">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Pact ID</div>
            <code className="text-sm font-mono break-all text-text-secondary">{result.pactId}</code>
          </div>

          {/* LIVE AI NEGOTIATION THEATER */}
          {result.negotiation && result.negotiation.transcript.length > 0 && (
            <div className="card-glow overflow-hidden !cursor-default border-l-2 border-l-amber">
              <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">
                  🤖 Live AI Negotiation
                  <span className={`ml-2 text-xs font-mono px-2 py-0.5 rounded ${result.negotiation.status === "accepted" ? "bg-success/10 text-success" : result.negotiation.status === "failed" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                    {result.negotiation.status.toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-text-muted font-mono">
                  {result.negotiation.rounds} rounds · {result.negotiation.transcript.length} moves
                </span>
              </div>
              <div className="divide-y divide-border">
                {result.negotiation.transcript.map((m, i) => (
                  <div key={i} className={`px-5 py-4 ${m.speaker === "A" ? "bg-amber/[0.02]" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-sm font-bold ${m.speaker === "A" ? "text-amber" : "text-lantern"}`}>
                        {m.speaker === "A" ? "🧠 Agent Alpha" : "🤖 Agent Beta"}
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
              </div>
              <div className="px-5 py-3 bg-bg/50 border-t border-border">
                <p className="text-xs text-text-muted">
                  🔏 Every message is hashed (SHA-256 reasoning commitment) and tied to the pact on X Layer.{" "}
                  {result.negotiation.models["A"] && result.negotiation.models["B"] && result.negotiation.models["A"] !== result.negotiation.models["B"] && (
                    <span className="text-amber">Cross-model negotiation: {result.negotiation.models["A"]} × {result.negotiation.models["B"]}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* PLAIN-ENGLISH CONTRACT */}
          {result.contract && (
            <div className="card-glow overflow-hidden !cursor-default border-l-2 border-l-lantern">
              <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">📜 The Contract</div>
                <span className="text-[10px] font-mono text-text-muted">written by {result.contract.model}</span>
              </div>
              <div className="p-5">
                <h3 className="text-base font-serif font-semibold text-lantern mb-2">{result.contract.title}</h3>
                <p className="text-xs text-text-muted italic mb-4 leading-relaxed">{result.contract.preamble}</p>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {result.contract.sections.map((s, i) => (
                    <div key={i} className="p-3 rounded-lg bg-bg/60 border border-border">
                      <div className="text-xs font-semibold text-amber uppercase tracking-wider mb-1">{s.heading}</div>
                      <p className="text-sm text-text-secondary leading-relaxed">{s.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Reasoning */}
          {result.reasoning && (
            <div className="card-glow p-4 !cursor-default">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-3">AI Reasoning</div>
              <p className="text-sm text-text-secondary leading-relaxed">{result.reasoning}</p>
            </div>
          )}

          {/* Terms */}
          {result.terms && (
            <div className="card-glow overflow-hidden !cursor-default">
              <div className="px-5 py-4 border-b border-border">
                <div className="text-sm font-semibold text-text-primary">Generated Terms</div>
              </div>
              <div className="divide-y divide-border">
                {Object.entries(result.terms).map(([key, val]) => (
                  <div key={key} className="flex justify-between px-5 py-3 text-sm hover:bg-bg-secondary transition-colors">
                    <span className="text-text-muted">{termLabels[key] ?? key}</span>
                    <span className="font-mono text-text-primary font-medium">{formatTermValue(key, val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="flex gap-3">
            <a href="/dashboard" className="btn-secondary flex-1 text-center">
              View Dashboard →
            </a>
            <a href="/pacts" className="btn-secondary flex-1 text-center">
              View All Pacts →
            </a>
          </div>

          {/* Invite Party B */}
          {result.pactId && (
            <div className="card-glow p-5 border-dashed border border-amber/20 !cursor-default">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">📨</span>
                <span className="text-sm font-semibold text-text-primary">Invite Party B</span>
              </div>
              <p className="text-xs text-text-muted mb-3 leading-relaxed">
                Share this with the counterparty. Their agent can join by calling the Syntheke endpoint:
              </p>
              <div className="bg-bg rounded-lg p-3 font-mono text-xs text-text-secondary break-all mb-3">
                POST /pacts/join<br/>
                {'{'} "pactId": "{result.pactId}" {'}'}
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Or tell them: <span className="text-amber">"Accept pact {result.pactId?.slice(0, 14)}... — {description.slice(0, 80)}{description.length > 80 ? '...' : ''}"</span>
              </p>
              <button
                onClick={() => {
                  const prompt = `Accept pact ${result.pactId} — ${description}`;
                  navigator.clipboard.writeText(prompt).catch(() => {});
                }}
                className="mt-3 text-xs text-amber hover:text-lantern transition-colors"
              >
                📋 Copy invite prompt
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
