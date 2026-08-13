"use client";

import { useEffect, useState } from "react";
import { Shield, ExternalLink, Coins } from "lucide-react";
import { fetchAgentStatus, fetchPacts, shortAddress, type AgentStatus, type PactSummary } from "@/lib/api";

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:3005";

interface TreasuryState {
  address: string;
  feeAmount: string;
  feeAmountFormatted: string;
  totalCollected: string;
  totalCollectedFormatted: string;
  feeCount: number;
  balance: string;
  balanceFormatted: string;
}

interface ActivityEvent {
  timestamp: number;
  event: string;
  detail: string;
  pactId?: string;
  txHash?: string;
}

interface NotificationEvent {
  timestamp: number;
  state: string;
  message: string;
  role: "partyA" | "partyB";
  pactId?: string;
}

export default function DashboardPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [pacts, setPacts] = useState<PactSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [treasury, setTreasury] = useState<TreasuryState | null>(null);

  useEffect(() => {
    let firstLoad = true;
    const load = async () => {
      const s = await fetchAgentStatus();
      setStatus(s);
      try {
        const t = await fetch(`${AGENT_API}/treasury`, { signal: AbortSignal.timeout(5000) });
        if (t.ok) setTreasury(await t.json());
      } catch { /* keep existing */ }
      try {
        const p = await fetchPacts();
        if (p.length > 0 || firstLoad) setPacts(p);
        firstLoad = false;
      } catch { /* keep existing */ }
      try {
        const r = await fetch(`${AGENT_API}/activity`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const data = await r.json();
          setActivity(data.events?.slice(-8).reverse() ?? []);
        }
      } catch { /* keep existing */ }
      try {
        const r = await fetch(`${AGENT_API}/notifications`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const data = await r.json();
          setNotifications(data.notifications?.slice(-6).reverse() ?? []);
        }
      } catch { /* keep existing */ }
    };
    load();
    const i = setInterval(load, 5000);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8 sm:mb-10">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle text-sm sm:text-base">
            {status?.running ? "Agent active — autonomous pact monitoring on X Layer" : "Agent offline"}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="badge-chain">
            <span className="text-xs sm:text-sm">Chain {status?.chainId ?? 1952}</span>
          </div>
          <div className={`badge-live ${!status?.running ? "!bg-text-muted/10 !text-text-muted !border-text-muted/20" : ""}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status?.running ? "bg-success animate-pulse shadow-glow-success" : "bg-text-muted"}`} />
            <span className="text-xs sm:text-sm">{status?.running ? "Live" : "Offline"}</span>
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
            <div className="metric-value group-hover:text-amber transition-colors">{m.value}</div>
            <span className="text-xs text-text-muted">{m.sub}</span>
          </div>
        ))}
      </div>

      {/* Protocol Treasury */}
      <div className="card-glow p-5 !cursor-default border-l-2 border-l-amber mb-10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber" />
            <span className="text-sm font-semibold text-text-primary">Protocol Treasury</span>
            <span className="text-xs text-text-muted font-mono">{treasury ? shortAddress(treasury.address) : "loading..."}</span>
          </div>
          {treasury && (
            <a href={`https://www.oklink.com/xlayer/address/${treasury.address}`} target="_blank" rel="noopener"
              className="text-xs text-amber hover:text-lantern transition-colors flex items-center gap-1">
              Explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-bg border border-border">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Total Collected</div>
            <div className="font-mono text-lg text-amber font-semibold">{treasury ? `${treasury.totalCollectedFormatted} OKB` : "—"}</div>
          </div>
          <div className="p-3 rounded-lg bg-bg border border-border">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Fees Paid</div>
            <div className="font-mono text-lg text-text-primary font-semibold">{treasury?.feeCount ?? "—"}</div>
          </div>
          <div className="p-3 rounded-lg bg-bg border border-border">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Creation Fee</div>
            <div className="font-mono text-lg text-text-primary font-semibold">{treasury ? `${treasury.feeAmountFormatted} OKB` : "—"}</div>
          </div>
          <div className="p-3 rounded-lg bg-bg border border-border">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Treasury Balance</div>
            <div className="font-mono text-lg text-text-primary font-semibold">{treasury ? `${treasury.balanceFormatted} OKB` : "—"}</div>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-3">
          Every AI-formed treaty pays a creation fee into the on-chain treasury — verifiable revenue, zero humans.
        </p>
      </div>

      <h2 className="section-heading mb-4">Active Pacts</h2>      {pacts.length === 0 ? (
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
            <div key={pid} className="pact-row group cursor-pointer flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-0" onClick={() => window.location.href = `/pacts/${encodeURIComponent(pid)}`}>
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${stateColor(stateName)} group-hover:shadow-glow transition-shadow`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-secondary group-hover:text-text-primary transition-colors truncate">{p.name || pid.slice(0, 22) + "..."}</div>
                  <div className="text-xs text-text-muted mt-0.5">{stateName} · {attCount} on-chain attestations</div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-text-muted hidden sm:inline">monitoring live</span>
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              </div>
            </div>
          )})}
        </div>
      )}

      <h2 className="section-heading mb-4">Agent Activity</h2>
      <div className="card-glow p-4 sm:p-5 font-mono text-xs sm:text-sm text-text-muted space-y-2.5 sm:space-y-3 !cursor-default">
        {activity.length === 0 ? (
          <div className="flex gap-3 sm:gap-4 items-start">
            <span className="shrink-0 text-text-muted tabular-nums w-14 sm:w-20 text-xs">—</span>
            <span className="text-text-secondary text-xs sm:text-sm">{status?.running ? "Monitor running — events will appear here" : "Agent offline"}</span>
          </div>
        ) : (
          activity.map((e, i) => (
            <div key={i} className="flex gap-2 sm:gap-3 items-start">
              <span className="shrink-0 text-text-muted tabular-nums w-14 sm:w-16 text-xs">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <div className="min-w-0">
                <span className="text-text-secondary text-xs line-clamp-2">{e.detail}</span>
                {e.pactId && (
                  <span className="text-text-muted text-xs ml-1">· {e.pactId.slice(0, 10)}...</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <h2 className="section-heading mb-4 mt-8">A2A Notifications</h2>
      <div className="card-glow p-5 font-mono text-sm !cursor-default space-y-2.5">
        {notifications.length === 0 ? (
          <p className="text-xs text-text-muted">No A2A pings yet — notifications fire when pacts change state.</p>
        ) : (
          notifications.map((n, i) => (
            <div key={i} className="flex gap-3 items-start border-b border-border/30 pb-2 last:border-0 last:pb-0">
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-semibold ${
                n.state === "BREACHED" ? "bg-danger/10 text-danger" :
                n.state === "DEGRADING" ? "bg-warning/10 text-warning" :
                n.state === "ARBITRATING" ? "bg-danger/10 text-danger" :
                n.state === "CLOSED" ? "bg-text-muted/10 text-text-muted" :
                "bg-amber/10 text-amber"
              }`}>{n.state}</span>
              <div className="min-w-0">
                <p className="text-xs text-text-secondary leading-relaxed">{n.message}</p>
                <span className="text-xs text-text-muted">{n.role === "partyA" ? "→ Party A" : "→ Party B"} · {new Date(n.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 sm:mt-10 card-glow p-4 sm:p-5 !cursor-default">
        <div className="text-sm font-semibold text-text-primary mb-3 sm:mb-4">On-Chain Contracts</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: "SynthekeContract", addr: "0xe465405380E2E0f625028447E85917662E71ad42" },
            { label: "AgentRegistry", addr: "0x0101Ed240dA20FFDD95bca8E7408DAa889aE217B" },
            { label: "EscrowVault", addr: "0x5535cEc5D9CcBe77EBF99e33BE88dCE00047e142" },
            { label: "Reputation", addr: "0x4256e57592aCB2120EAbC7f3E1eb82d9DddB855f" },
          ].map(c => (
            <a key={c.label} href={`https://www.oklink.com/xlayer/address/${c.addr}`} target="_blank" rel="noopener"
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
