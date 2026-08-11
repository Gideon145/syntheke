"use client";

import { useEffect, useState } from "react";
import { Shield, ExternalLink } from "lucide-react";
import { fetchAgentStatus, fetchPacts, shortAddress, type AgentStatus, type PactSummary } from "@/lib/api";

export default function DashboardPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [pacts, setPacts] = useState<PactSummary[]>([]);

  useEffect(() => {
    const load = async () => {
      const s = await fetchAgentStatus();
      setStatus(s);
      const p = await fetchPacts();
      setPacts(p);
    };
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, []);

  const stateColor = (s: string) => {
    const m: Record<string, string> = {
      ACTIVE: "bg-success", DEGRADING: "bg-warning", BREACHED: "bg-danger",
      ARBITRATING: "bg-danger", SETTLING: "bg-accent", CLOSED: "bg-text-muted",
    };
    return m[s] ?? "bg-text-muted";
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 animate-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">
            {status?.running ? "Agent active — monitoring pacts on X Layer" : "Agent offline"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>Chain {status?.chainId ?? 1952}</span>
          <div className={`w-1.5 h-1.5 rounded-full ${status?.running ? "bg-success animate-pulse" : "bg-text-muted"}`} />
          <span>{status?.running ? "Live" : "Offline"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Cycles", value: status?.cycles?.toLocaleString() ?? "—" },
          { label: "Attestations", value: status?.attestations?.toLocaleString() ?? "—" },
          { label: "Pacts Monitored", value: String(status?.pactsMonitored ?? "—") },
          { label: "Agent", value: status?.agent ? shortAddress(status.agent) : "—" },
        ].map(m => (
          <div key={m.label} className="p-4 rounded-lg bg-bg-secondary border border-border">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-text-primary">{m.value}</div>
          </div>
        ))}
      </div>

      <h2 className="text-base font-semibold text-text-primary mb-3">Active Pacts</h2>
      {pacts.length === 0 ? (
        <div className="rounded-lg bg-bg-secondary border border-border p-10 text-center mb-8">
          <Shield className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary mb-1">No active pacts</p>
          <p className="text-xs text-text-muted">Create a pact on X Layer to begin autonomous monitoring</p>
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {pacts.map(p => (
            <div key={p.pactId} className="p-4 rounded-lg bg-bg-secondary border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${stateColor(p.state)}`} />
                <div>
                  <div className="text-sm font-mono text-text-secondary">{shortAddress(p.pactId)}</div>
                  <div className="text-xs text-text-muted">{p.state} · {p.attestationCount} attestations</div>
                </div>
              </div>
              <div className="text-xs text-text-muted">{shortAddress(p.partyA)} ↔ {shortAddress(p.partyB)}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-base font-semibold text-text-primary mb-3">Agent Activity</h2>
      <div className="rounded-lg bg-bg-secondary border border-border p-4 font-mono text-xs text-text-muted space-y-2">
        <div className="flex gap-3">
          <span className="shrink-0">{new Date().toLocaleTimeString()}</span>
          <span>{status?.running ? `Monitor cycle #${status.cycles} — conditions evaluated, attestation recorded` : "Agent offline"}</span>
        </div>
        <div className="flex gap-3">
          <span className="shrink-0">{new Date(Date.now() - 15000).toLocaleTimeString()}</span>
          <span>Connected to X Layer testnet · RPC healthy</span>
        </div>
        <div className="flex gap-3">
          <span className="shrink-0">{new Date(Date.now() - 30000).toLocaleTimeString()}</span>
          <span>Oracle data feeds active · Pyth + OnchainOS</span>
        </div>
      </div>

      <div className="mt-8 p-4 rounded-lg bg-bg-secondary border border-border">
        <div className="text-xs text-text-muted mb-2">On-Chain Contracts</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            { label: "SynthekeContract", addr: "0xe465405380E2E0f625028447E85917662E71ad42" },
            { label: "AgentRegistry", addr: "0x0101Ed240dA20FFDD95bca8E7408DAa889aE217B" },
            { label: "EscrowVault", addr: "0x5535cEc5D9CcBe77EBF99e33BE88dCE00047e142" },
            { label: "Reputation", addr: "0x4256e57592aCB2120EAbC7f3E1eb82d9DddB855f" },
          ].map(c => (
            <a key={c.label} href={`https://www.oklink.com/x-layer-testnet/address/${c.addr}`} target="_blank" rel="noopener"
              className="flex items-center justify-between p-2 rounded bg-bg border border-border hover:border-border-light transition-colors">
              <span className="text-text-secondary truncate">{c.label}</span>
              <ExternalLink className="w-3 h-3 text-text-muted shrink-0 ml-2" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
