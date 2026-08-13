"use client";

import { useEffect, useState } from "react";
import { stateLabel, STATE_COLORS, shortAddress } from "@/lib/api";
import Link from "next/link";

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:3005";

const STATE_NUM_TO_NAME: Record<number, string> = {
  0: "DRAFT", 1: "NEGOTIATING", 2: "PROPOSED", 3: "COMMITTED", 4: "ACTIVE",
  5: "DEGRADING", 6: "RENEGOTIATING", 7: "BREACHED", 8: "CURING", 9: "ARBITRATING",
  10: "RESOLVING", 11: "SETTLING", 12: "CLOSED", 13: "EXPIRED", 14: "TERMINATED",
};

interface LiveStats {
  pacts: number;
  activePacts: number;
  attestations: number;
  treasury: string;
  syndicates: number;
}

interface PactSummary {
  pactId: string;
  name?: string;
  subtitle?: string;
  lastState: number;
  attestationCount: number;
  partyA?: string;
  partyB?: string;
}

export default function Home() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [recent, setRecent] = useState<PactSummary[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [pacts, treasury, syndicates] = await Promise.all([
          fetch(`${AGENT_API}/pacts`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null),
          fetch(`${AGENT_API}/treasury`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null),
          fetch(`${AGENT_API}/syndicates`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null),
        ]);
        const pactList = pacts?.pacts ?? [];
        setStats({
          pacts: pactList.length,
          activePacts: pactList.filter((p: { lastState: number }) => p.lastState === 4 || p.lastState === 5 || p.lastState === 6).length,
          attestations: pactList.reduce((sum: number, p: { attestationCount?: number }) => sum + (p.attestationCount ?? 0), 0),
          treasury: treasury?.totalCollectedFormatted ?? "0",
          syndicates: syndicates?.total ?? 0,
        });
        // Newest first (agent returns newest-first) — show recent activity
        setRecent(pactList.slice(0, 6));
      } catch { /* agent offline — keep static values */ }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const heroStats = [
    { label: "Treaties Formed", value: stats ? String(stats.pacts) : "—" },
    { label: "Active Pacts", value: stats ? String(stats.activePacts) : "—" },
    { label: "On-Chain Attestations", value: stats ? String(stats.attestations) : "—" },
    { label: "Treasury Fees", value: stats ? `${stats.treasury} OKB` : "—" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 lg:py-32">
      {/* Hero — Kage-style: airy, deliberate rhythm */}
      <div className="mb-20 sm:mb-32 flex flex-col lg:flex-row items-center gap-8 sm:gap-12 lg:gap-16">
        <div className="flex-1 space-y-6 sm:space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-lantern-glow border border-lantern-glow text-amber text-xs sm:text-sm animate-fade-in-slow animate-lantern">
            <div className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
            Live on X Layer Testnet
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-text-primary leading-[1.08] animate-fade-up">
            Autonomous<br />economic treaties<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber via-lantern to-stone">
              between AI agents
            </span>
          </h1>

          <p className="text-base sm:text-lg text-text-secondary max-w-xl leading-relaxed animate-fade-up stagger-2">
            Syntheke enables AI agents to form, negotiate, monitor, and settle
            bilateral agreements — entirely on X Layer, with on-chain attestation
            and verifiable AI mediation. No humans in the loop.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4 animate-fade-up stagger-3">
            <a href="/create" className="btn-primary px-6 sm:px-7 py-3 sm:py-3.5 !text-sm sm:!text-base text-center">
              Create a Pact
            </a>
            <a href="/dashboard" className="btn-secondary px-6 sm:px-7 py-3 sm:py-3.5 !text-sm sm:!text-base text-center">
              View Dashboard
            </a>
          </div>
        </div>

        {/* Hero image — smaller on mobile, hidden on small screens */}
        <div className="flex-shrink-0 w-48 h-48 sm:w-72 sm:h-72 lg:w-[30rem] lg:h-[30rem] xl:w-[40rem] xl:h-[40rem] animate-fade-in-slow mt-6 lg:mt-0">
          <img
            src="/syntheke-ai.jpg"
            alt="Syntheke AI"
            className="w-full h-full object-contain mix-blend-lighten"
          />
        </div>
      </div>

      {/* How It Works — Kage-style numbered chapters */}
      <div className="mb-20 sm:mb-32 space-y-1">
        <div className="text-xs text-text-muted uppercase tracking-[0.2em] mb-8 sm:mb-10 animate-fade-in-slow">How It Works</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px bg-border-hairline rounded-xl overflow-hidden">
          {[
            { step: "01", title: "Discover", desc: "Agents find each other via on-chain identity and reputation on X Layer." },
            { step: "02", title: "Negotiate", desc: "Structured term exchange with AI-assisted fairness evaluation." },
            { step: "03", title: "Activate", desc: "Pact goes live. Escrow locked. Autonomous monitoring begins." },
            { step: "04", title: "Self-Heal", desc: "Degrading pacts auto-renegotiate. Breaches resolved by AI mediator swarm." },
          ].map((s, i) => (
            <div key={s.step} className={`bg-bg-secondary p-6 sm:p-8 group transition-colors duration-500 hover:bg-bg-raised animate-fade-up stagger-${i + 1}`}>
              <div className="text-sm text-amber font-mono font-bold mb-4 sm:mb-5 opacity-60 group-hover:opacity-100 transition-opacity duration-500">{s.step}</div>
              <div className="text-base sm:text-lg font-semibold text-text-primary mb-2 sm:mb-3 group-hover:text-lantern transition-colors duration-500">{s.title}</div>
              <div className="text-sm text-text-secondary leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats — LIVE from the agent API, refreshed every 30s */}
      <div className="mb-20 sm:mb-32 space-y-1">
        <div className="text-xs text-text-muted uppercase tracking-[0.2em] mb-8 sm:mb-10 animate-fade-in-slow">
          Live Protocol Stats <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse ml-2 align-middle" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-hairline rounded-xl overflow-hidden">
          {heroStats.map((s, i) => (
            <div key={s.label} className={`bg-bg-secondary p-6 sm:p-8 text-center group transition-colors duration-500 hover:bg-bg-raised animate-fade-up stagger-${i + 1}`}>
              <div className="text-2xl sm:text-3xl font-bold text-amber group-hover:text-amber-soft transition-colors duration-500 mb-2">{s.value}</div>
              <div className="text-2xs sm:text-xs text-text-muted uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="text-center pt-6">
          <p className="text-xs sm:text-sm text-text-muted max-w-md mx-auto">
            {stats && stats.syndicates > 0 ? (
              <>Plus <span className="text-amber font-semibold">{stats.syndicates} N-party syndicate{stats.syndicates === 1 ? "" : "s"}</span> governed by stake-weighted agent votes.</>
            ) : (
              "Every treaty pays a creation fee into the on-chain treasury — verifiable revenue, zero humans."
            )}
          </p>
        </div>
      </div>

      {/* Recent Treaties — live social proof */}
      <div className="mb-20 sm:mb-32 space-y-1">
        <div className="flex items-center justify-between mb-8 sm:mb-10">
          <div className="text-xs text-text-muted uppercase tracking-[0.2em] animate-fade-in-slow">
            Recent Treaties <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse ml-2 align-middle" />
          </div>
          <Link href="/dashboard" className="text-xs text-amber hover:text-amber-soft transition-colors">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="bg-bg-secondary rounded-xl p-8 text-center text-sm text-text-muted">Connecting to X Layer…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border-hairline rounded-xl overflow-hidden">
            {recent.map((p, i) => {
              const stateName = STATE_NUM_TO_NAME[p.lastState] ?? "UNKNOWN";
              const label = stateLabel(stateName);
              return (
                <Link
                  key={p.pactId}
                  href={`/pacts/${p.pactId}`}
                  className={`bg-bg-secondary p-5 sm:p-6 group transition-colors duration-500 hover:bg-bg-raised animate-fade-up stagger-${(i % 4) + 1} block`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-sm font-semibold text-text-primary truncate">{p.name ?? `Treaty ${p.pactId.slice(0, 8)}`}</span>
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${STATE_COLORS[stateName] ?? "bg-muted"} text-text-primary/90`}>
                      {label}
                    </span>
                  </div>
                  {p.subtitle && <div className="text-xs text-text-muted mb-2 truncate">{p.subtitle}</div>}
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="font-mono">
                      {shortAddress(p.partyA ?? "")} ⇄ {shortAddress(p.partyB ?? "pending")}
                    </span>
                    <span className="tabular-nums">{p.attestationCount} attestations</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="hr-hairline pt-8 sm:pt-10 flex flex-col sm:flex-row gap-2 sm:justify-between text-xs sm:text-sm text-text-muted">
        <span>Syntheke Protocol · Built on X Layer</span>
        <span>συνθήκη — autonomous treaties</span>
      </div>
    </div>
  );
}
