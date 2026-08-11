import { ArrowUpRight, Shield, Activity, FileText, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw, Plus } from "lucide-react";
import { STATE_COLORS, stateLabel } from "@/lib/api";

export function StatusBadge({ state }: { state: string }) {
  const color = STATE_COLORS[state] ?? "text-text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-raised text-xs font-medium ${color}`}>
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
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

export function PactCard({ id, state, partyA, partyB, attestations }: {
  id: string; state: string; partyA: string; partyB: string; attestations: number;
}) {
  return (
    <div className="pact-row group">
      <div className="flex items-center gap-4">
        <div className="w-2 h-2 rounded-full bg-okx group-hover:shadow-glow transition-shadow" />
        <div className="flex flex-col">
          <span className="text-sm font-mono text-text-secondary group-hover:text-text-primary transition-colors">{id.slice(0, 14)}...</span>
          <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
            <span className="font-mono">{partyA.slice(0, 6)}...</span>
            <ArrowUpRight className="w-3 h-3" />
            <span className="font-mono">{partyB ? partyB.slice(0, 6) + "..." : "pending"}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-text-muted tabular-nums">{attestations} cycles</span>
        <StatusBadge state={state} />
      </div>
    </div>
  );
}

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <a href="/" className="flex items-center gap-3 font-bold text-text-primary text-lg hover:opacity-80 transition-opacity group">
            <span className="w-8 h-8 rounded-lg bg-okx flex items-center justify-center text-white text-base font-bold shadow-glow group-hover:shadow-glow transition-shadow">Σ</span>
            <span className="tracking-tight">Syntheke</span>
          </a>
          <div className="hidden md:flex items-center gap-1">
            {[
              ["Dashboard", "/dashboard"],
              ["Pacts", "/pacts"],
              ["Agents", "/agents"],
            ].map(([label, href]) => (
              <a key={href} href={href}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-text-secondary
                           hover:text-text-primary hover:bg-bg-secondary transition-all duration-200">
                {label}
              </a>
            ))}
            <a href="/create"
              className="ml-2 px-4 py-2 rounded-lg text-sm font-semibold
                         bg-okx text-white hover:bg-accent-purple-hover hover:shadow-glow
                         transition-all duration-200 active:scale-95 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Create
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://github.com/Gideon145/syntheke" target="_blank" rel="noopener"
            className="text-sm text-text-muted hover:text-text-primary transition-colors">
            GitHub
          </a>
          <div className="badge-chain">
            <div className="w-1.5 h-1.5 rounded-full bg-okx animate-pulse shadow-glow" />
            <span>X Layer Testnet</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
