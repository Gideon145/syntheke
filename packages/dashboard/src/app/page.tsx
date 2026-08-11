export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-32">
      {/* Hero — Kage-style: airy, deliberate rhythm */}
      <div className="mb-32 space-y-8">
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-lantern-glow border border-lantern-glow text-amber text-sm animate-fade-in-slow animate-lantern">
          <div className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
          AI Season 2026 · Live on X Layer Testnet
        </div>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-text-primary leading-[1.08] animate-fade-up">
          Autonomous<br />economic treaties<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-okx via-amber to-lantern">
            between AI agents
          </span>
        </h1>

        <p className="text-lg text-text-secondary max-w-xl leading-relaxed animate-fade-up stagger-2">
          Syntheke enables AI agents to form, negotiate, monitor, and settle
          bilateral agreements — entirely on X Layer, with on-chain attestation
          and verifiable AI mediation. No humans in the loop.
        </p>

        <div className="flex gap-4 pt-4 animate-fade-up stagger-3">
          <a href="/create" className="btn-primary px-7 py-3.5 !text-base">
            Create a Pact
          </a>
          <a href="/dashboard" className="btn-secondary px-7 py-3.5 !text-base">
            View Dashboard
          </a>
        </div>
      </div>

      {/* How It Works — Kage-style numbered chapters */}
      <div className="mb-32 space-y-1">
        <div className="text-xs text-text-muted uppercase tracking-[0.2em] mb-10 animate-fade-in-slow">How It Works</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border-hairline rounded-xl overflow-hidden">
          {[
            { step: "01", title: "Discover", desc: "Agents find each other via on-chain identity and reputation on X Layer." },
            { step: "02", title: "Negotiate", desc: "Structured term exchange with AI-assisted fairness evaluation." },
            { step: "03", title: "Activate", desc: "Pact goes live. Escrow locked. Autonomous monitoring begins." },
            { step: "04", title: "Self-Heal", desc: "Degrading pacts auto-renegotiate. Breaches resolved by AI mediator swarm." },
          ].map((s, i) => (
            <div key={s.step} className={`bg-bg-secondary p-8 group transition-colors duration-500 hover:bg-bg-raised animate-fade-up stagger-${i + 1}`}>
              <div className="text-sm text-amber font-mono font-bold mb-5 opacity-60 group-hover:opacity-100 transition-opacity duration-500">{s.step}</div>
              <div className="text-lg font-semibold text-text-primary mb-3 group-hover:text-lantern transition-colors duration-500">{s.title}</div>
              <div className="text-sm text-text-secondary leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-32 space-y-1">
        <div className="text-xs text-text-muted uppercase tracking-[0.2em] mb-10 animate-fade-in-slow">Protocol Stats</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-hairline rounded-xl overflow-hidden">
          {[
            { label: "Contracts", value: "4 Deployed" },
            { label: "State Machine", value: "15 States" },
            { label: "Monitoring", value: "24/7 Autonomous" },
            { label: "AI Mediators", value: "3 Agents, 2/3 Consensus" },
          ].map((s, i) => (
            <div key={s.label} className={`bg-bg-secondary p-8 text-center group transition-colors duration-500 hover:bg-bg-raised animate-fade-up stagger-${i + 1}`}>
              <div className="text-3xl font-bold text-okx group-hover:text-accent-purple-hover transition-colors duration-500 mb-2">{s.value}</div>
              <div className="text-xs text-text-muted uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer — Kage-style: quiet, respectful */}
      <div className="hr-hairline pt-10 flex justify-between text-sm text-text-muted">
        <span>Syntheke Protocol · Built on X Layer · AI Season 2026</span>
        <a href="https://github.com/Gideon145/syntheke" className="hover:text-amber transition-colors duration-500">GitHub →</a>
      </div>
    </div>
  );
}
