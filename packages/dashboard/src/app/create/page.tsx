"use client";

import { useState } from "react";
import Link from "next/link";
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
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Create a Pact</h1>
      <p className="text-text-secondary mb-8">
        Describe two AI agents and the economic treaty they want to form.
        Syntheke&apos;s AI negotiator generates terms, then the pact goes live on X Layer.
      </p>

      <form onSubmit={handleCreate} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Party A (Initiator)
            </label>
            <input
              type="text"
              value={partyADesc}
              onChange={(e) => setPartyADesc(e.target.value)}
              placeholder="e.g. DeFi yield optimizer agent"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Party B (Counterparty)
            </label>
            <input
              type="text"
              value={partyBDesc}
              onChange={(e) => setPartyBDesc(e.target.value)}
              placeholder="e.g. Liquidity provisioning agent"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            What should the pact do?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Agent Alpha pays 100 USDC monthly to Agent Beta for real-time liquidation monitoring of their Aave positions. If Beta misses 3 consecutive checks, Alpha can claim 50% of escrow."
            rows={4}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-y"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
        <div className="mt-8 space-y-6">
          {/* Success Banner */}
          <div className="rounded-xl border border-success/30 bg-success/10 px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🏛️</span>
              <span className="font-semibold text-success">Pact Created!</span>
            </div>
            <p className="text-sm text-text-secondary">
              State: <span className="text-text-primary font-mono">{result.state}</span> ·{" "}
              View on{" "}
              <a
                href={`https://www.okx.com/web3/explorer/xlayer-testnet/address/${result.partyA}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                X Layer Explorer
              </a>
            </p>
            {result.txHash && (
              <p className="text-xs text-text-muted mt-1 font-mono break-all">
                TX: {result.txHash}
              </p>
            )}
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="text-xs text-text-muted mb-1">Party A (Initiator)</div>
              <div className="font-mono text-sm">{result.partyA ? shortAddress(result.partyA) : "—"}</div>
              <div className="text-xs text-text-muted mt-1">{partyADesc || "Agent Alpha"}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="text-xs text-text-muted mb-1">Party B (Counterparty)</div>
              <div className="font-mono text-sm">{result.partyB ? shortAddress(result.partyB) : "—"}</div>
              <div className="text-xs text-text-muted mt-1">{partyBDesc || "Agent Beta"}</div>
            </div>
          </div>

          {/* Pact ID */}
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-xs text-text-muted mb-1">Pact ID</div>
            <code className="text-sm font-mono break-all">{result.pactId}</code>
          </div>

          {/* AI Reasoning */}
          {result.reasoning && (
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="text-xs text-text-muted mb-2">AI Reasoning</div>
              <p className="text-sm text-text-secondary leading-relaxed">{result.reasoning}</p>
            </div>
          )}

          {/* Terms */}
          {result.terms && (
            <div className="rounded-lg border border-border bg-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="text-sm font-semibold">Generated Terms</div>
              </div>
              <div className="divide-y divide-border">
                {Object.entries(result.terms).map(([key, val]) => (
                  <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-text-muted">{termLabels[key] ?? key}</span>
                    <span className="font-mono text-text-primary">{formatTermValue(key, val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-center text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors"
            >
              View Dashboard →
            </Link>
            <Link
              href="/pacts"
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-center text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors"
            >
              View All Pacts →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
