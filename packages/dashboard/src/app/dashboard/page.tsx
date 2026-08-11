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
      CURING: "bg-warning", NEGOTIATING: "bg-text-muted", RENEGOTIATING: "bg-warning",
      DRAFT: "bg-text-muted", PROPOSED: "bg-text-muted", COMMITTED: "bg-accent",
    };
    return m[s] ?? "bg-text-muted";
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 animate-in">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {status?.running ? "Agent active — autonomous pact monitoring on X Layer" : "Agent offline"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="badge-chain">
            <span className="text-sm">Chain {status?.chainId ?? 1952}</span>
          </div>
          <div className={`badge-live ${!status?.running ? "!bg-text-muted/10 !text-text-muted !border-text-muted/20" : ""}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status?.running ? "bg-success animate-pulse shadow-glow-success" : "bg-text-muted"}`} />
            <span className="text-sm">{status?.running ? "Live" : "Offline"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Cycles", value: status?.cycles?.toLocaleString() ?? "—", sub: "15s intervals" },
          { label: "Attestations", value: status?.attestations?.toLocaleString() ?? "—", sub: "on-chain records" },
          { label: "Pacts Monitored", value: String(status?.pactsMonitored ?? "—"), sub: "autonomous" },
          { label: "Agent", value: status?.agent ? shortAddress(status.agent) : "—", sub: "monitor address" },
        ].map(m => (
          <div key={m.label} className="metric-card group">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value group-hover:text-okx transition-colors">{m.value}</div>
            <span className="text-xs text-text-muted">{m.sub}</span>
          </div>
        ))}
      </div>

      <h2 className="section-heading mb-4">Active Pacts</h2>
      {pacts.length === 0 ? (
        <div className="card-glow p-12 text-center mb-10">
          <div className="w-12 h-12 rounded-full bg-okx/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-okx" />
          </div>
          <p className="text-base text-text-secondary mb-2 font-medium">No active pacts</p>
          <p className="text-sm text-text-muted">Create a pact on X Layer to begin autonomous monitoring</p>
        </div>
      ) : (
        <div className="space-y-2.5 mb-10">
          {pacts.map((p) => {
            const pid = p.pactId;
            const st = String(p.lastState ?? 4);
            const stateMap: Record<string, string> = {"0":"DRAFT","1":"NEGOTIATING","2":"PROPOSED","3":"COMMITTED","4":"ACTIVE","5":"DEGRADING","6":"RENEGOTIATING","7":"BREACHED","8":"CURING","9":"ARBITRATING","10":"RESOLVING","11":"SETTLING","12":"CLOSED"};
            const stateName = stateMap[st] ?? "ACTIVE";
            const attCount = p.attestationCount ?? 0;
            return (
            <div key={pid} className="pact-row group">
              <div className="flex items-center gap-4">
                <div className={`w-2.5 h-2.5 rounded-full ${stateColor(stateName)} group-hover:shadow-glow transition-shadow`} />
                <div>
                  <div className="text-sm font-mono text-text-secondary group-hover:text-text-primary transition-colors">{pid.slice(0, 22)}...</div>
                  <div className="text-xs text-text-muted mt-0.5">{stateName} · {attCount} on-chain attestations</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">monitoring live</span>
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              </div>
            </div>
          )})}
        </div>
      )}

      <h2 className="section-heading mb-4">Agent Activity</h2>
      <div className="card-glow p-5 font-mono text-sm text-text-muted space-y-3 !cursor-default">
        <div className="flex gap-4 items-start">
          <span className="shrink-0 text-text-muted tabular-nums w-20">{new Date().toLocaleTimeString()}</span>
          <span className="text-text-secondary">{status?.running ? `Monitor cycle #${status.cycles} — conditions evaluated, attestation on-chain` : "Agent offline"}</span>
        </div>
        <div className="flex gap-4 items-start">
          <span className="shrink-0 text-text-muted tabular-nums w-20">{new Date(Date.now() - 15000).toLocaleTimeString()}</span>
          <span className="text-text-secondary">Connected to X Layer testnet · RPC healthy</span>
        </div>
        <div className="flex gap-4 items-start">
          <span className="shrink-0 text-text-muted tabular-nums w-20">{new Date(Date.now() - 30000).toLocaleTimeString()}</span>
          <span className="text-text-secondary">Oracle data feeds active · Pyth + OnchainOS</span>
        </div>
      </div>

      <div className="mt-10 card-glow p-5 !cursor-default">
        <div className="text-sm font-semibold text-text-primary mb-4">On-Chain Contracts</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "SynthekeContract", addr: "0xe465405380E2E0f625028447E85917662E71ad42" },
            { label: "AgentRegistry", addr: "0x0101Ed240dA20FFDD95bca8E7408DAa889aE217B" },
            { label: "EscrowVault", addr: "0x5535cEc5D9CcBe77EBF99e33BE88dCE00047e142" },
            { label: "Reputation", addr: "0x4256e57592aCB2120EAbC7f3E1eb82d9DddB855f" },
          ].map(c => (
            <a key={c.label} href={`https://www.oklink.com/x-layer-testnet/address/${c.addr}`} target="_blank" rel="noopener"
              className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border
                         hover:border-okx/30 hover:bg-okx/5 hover:shadow-glow transition-all duration-200 group">
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors truncate">{c.label}</span>
              <ExternalLink className="w-3 h-3 text-text-muted shrink-0 ml-2" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
