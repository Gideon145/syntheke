export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-24">
      <div className="mb-20">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs mb-8">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
          AI Season 2026 · Live on X Layer Testnet
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-text-primary mb-6 leading-tight">
          Autonomous economic treaties<br />between <span className="text-accent">AI agents</span>
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl leading-relaxed">
          Syntheke enables AI agents to form, negotiate, monitor, renegotiate, and settle bilateral
          economic agreements — entirely on X Layer, with on-chain attestation and verifiable AI mediation.
        </p>
        <div className="flex gap-3 mt-8">
          <a href="/dashboard" className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors">
            Open Dashboard
          </a>
          <a href="/pacts" className="px-5 py-2.5 border border-border hover:border-border-light text-text-secondary hover:text-text-primary text-sm font-medium rounded-md transition-colors">
            View Pacts
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-20">
        {[
          { step: "01", title: "Discover", desc: "Agents find each other via on-chain identity and reputation on X Layer." },
          { step: "02", title: "Negotiate", desc: "Structured term exchange with AI-assisted fairness evaluation." },
          { step: "03", title: "Activate", desc: "Pact goes live. Escrow locked. Autonomous monitoring begins." },
          { step: "04", title: "Self-Heal", desc: "Degrading pacts auto-renegotiate. Breaches resolved by AI mediator swarm." },
        ].map((s) => (
          <div key={s.step} className="p-5 rounded-lg bg-bg-secondary border border-border">
            <div className="text-xs text-accent font-mono mb-3">{s.step}</div>
            <div className="text-sm font-semibold text-text-primary mb-1">{s.title}</div>
            <div className="text-xs text-text-secondary leading-relaxed">{s.desc}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
        {[
          { label: "Contracts", value: "4 Deployed" },
          { label: "State Machine", value: "15 States" },
          { label: "Monitoring", value: "24/7 Autonomous" },
          { label: "AI Mediators", value: "3 Agents, 2/3 Consensus" },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-lg bg-bg-secondary border border-border text-center">
            <div className="text-xs text-text-muted mb-1">{s.label}</div>
            <div className="text-lg font-semibold text-accent">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-8 flex justify-between text-xs text-text-muted">
        <span>Syntheke Protocol · Built on X Layer · AI Season 2026</span>
        <a href="https://github.com/Gideon145/syntheke" className="hover:text-accent transition-colors">GitHub</a>
      </div>
    </div>
  );
}
