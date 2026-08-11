import { ArrowUpRight, Shield, Activity, FileText, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw } from "lucide-react";
import { STATE_COLORS, stateLabel } from "@/lib/api";

export function StatusBadge({ state }: { state: string }) {
  const color = STATE_COLORS[state] ?? "text-text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-raised text-xs font-medium ${color}`}>
      {state === "ACTIVE" && <Shield className="w-3 h-3" />}
      {state === "DEGRADING" && <AlertTriangle className="w-3 h-3" />}
      {state === "BREACHED" && <XCircle className="w-3 h-3" />}
      {state === "ARBITRATING" && <Activity className="w-3 h-3" />}
      {state === "CLOSED" && <CheckCircle className="w-3 h-3" />}
      {state === "SETTLING" && <RefreshCw className="w-3 h-3 animate-spin" />}
      {state === "NEGOTIATING" && <Clock className="w-3 h-3" />}
      {stateLabel(state)}
    </span>
  );
}

export function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-lg bg-bg-secondary border border-border">
      <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      <span className="text-xl font-semibold text-text-primary tabular-nums">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

export function PactCard({ id, state, partyA, partyB, attestations }: {
  id: string; state: string; partyA: string; partyB: string; attestations: number;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary border border-border hover:border-border-light transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-mono text-text-muted">{id.slice(0, 14)}...</span>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
            <span>{partyA.slice(0, 6)}...</span>
            <ArrowUpRight className="w-3 h-3" />
            <span>{partyB ? partyB.slice(0, 6) + "..." : "pending"}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-text-muted">{attestations} cycles</span>
        <StatusBadge state={state} />
      </div>
    </div>
  );
}

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-2.5 font-semibold text-text-primary">
            <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-white text-sm font-bold">S</span>
            <span className="tracking-tight text-base">Syntheke</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm text-text-secondary">
            <a href="/dashboard" className="hover:text-accent transition-colors">Dashboard</a>
            <a href="/pacts" className="hover:text-accent transition-colors">Pacts</a>
            <a href="/agents" className="hover:text-accent transition-colors">Agents</a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://github.com/Gideon145/syntheke" target="_blank" rel="noopener" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
            GitHub
          </a>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success/10 border border-success/20 text-xs text-success">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span>X Layer Testnet</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
