"use client";

import { ArrowUpRight, Shield, Activity, FileText, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw, Plus, Menu, X } from "lucide-react";
import { STATE_COLORS, stateLabel } from "@/lib/api";
import { useState } from "react";

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
  const [open, setOpen] = useState(false);

  const navLinks = [
    ["Dashboard", "/dashboard"],
    ["Pacts", "/pacts"],
    ["Agents", "/agents"],
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 sm:gap-3 font-bold text-text-primary text-base sm:text-lg hover:opacity-80 transition-opacity duration-500 group shrink-0">
          <img src="/syntheke-ai.jpg" alt="Syntheke" className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover" />
          <span className="tracking-[0.12em] sm:tracking-[0.15em] text-amber font-bold text-sm sm:text-base">S Y N T H Ξ K Ξ</span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(([label, href]) => (
            <a key={href} href={href}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-text-secondary
                         hover:text-text-primary hover:bg-bg-secondary transition-all duration-200">
              {label}
            </a>
          ))}
          <a href="/create"
            className="ml-2 px-4 py-2 rounded-lg text-sm font-semibold
                       bg-amber text-bg hover:bg-amber-soft hover:shadow-glow-amber
                       transition-all duration-500 active:scale-95 flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Create
          </a>
        </div>

        {/* Right side: chain badge + hamburger */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-full text-xs font-medium bg-amber/5 border border-amber/10 text-amber">
            <div className="w-1.5 h-1.5 rounded-full bg-amber animate-lantern-pulse" />
            <span className="hidden sm:inline">X Layer Testnet</span>
            <span className="sm:hidden">Testnet</span>
          </div>
          {/* Hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border bg-bg/98 backdrop-blur-xl animate-fade-in-slow">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}
                className="block px-4 py-3 rounded-lg text-sm font-medium text-text-secondary
                           hover:text-text-primary hover:bg-bg-secondary transition-all duration-200">
                {label}
              </a>
            ))}
            <a href="/create" onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold
                         bg-amber text-bg hover:bg-amber-soft transition-all duration-300">
              <Plus className="w-4 h-4" />
              Create a Pact
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
