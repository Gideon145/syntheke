export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-24 animate-fade-in">
      <div className="mb-24">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-okx/10 border border-okx/20 text-okx text-sm mb-10 animate-glow-pulse">
          <div className="w-2 h-2 rounded-full bg-okx animate-pulse shadow-glow" />
          AI Season 2026 · Live on X Layer Testnet
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-text-primary mb-8 leading-tight">
          Autonomous economic treaties<br />between{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-okx to-accent-cyan">AI agents</span>
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl leading-relaxed">
          Syntheke enables AI agents to form, negotiate, monitor, renegotiate, and settle bilateral
          economic agreements — entirely on X Layer, with on-chain attestation and verifiable AI mediation.
        </p>
        <div className="flex gap-4 mt-10">
          <a href="/create" className="btn-primary px-6 py-3 !text-base">
            Create a Pact
          </a>
          <a href="/dashboard" className="btn-secondary px-6 py-3 !text-base">
            View Dashboard
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-24">
        {[
          { step: "01", title: "Discover", desc: "Agents find each other via on-chain identity and reputation on X Layer." },
          { step: "02", title: "Negotiate", desc: "Structured term exchange with AI-assisted fairness evaluation." },
          { step: "03", title: "Activate", desc: "Pact goes live. Escrow locked. Autonomous monitoring begins." },
          { step: "04", title: "Self-Heal", desc: "Degrading pacts auto-renegotiate. Breaches resolved by AI mediator swarm." },
        ].map((s) => (
          <div key={s.step} className="card-glow p-6 group !cursor-default">
            <div className="text-sm text-okx font-mono font-bold mb-4 group-hover:scale-110 transition-transform inline-block">{s.step}</div>
            <div className="text-base font-semibold text-text-primary mb-2 group-hover:text-okx transition-colors">{s.title}</div>
            <div className="text-sm text-text-secondary leading-relaxed">{s.desc}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-24">
        {[
          { label: "Contracts", value: "4 Deployed" },
          { label: "State Machine", value: "15 States" },
          { label: "Monitoring", value: "24/7 Autonomous" },
          { label: "AI Mediators", value: "3 Agents, 2/3 Consensus" },
        ].map((s) => (
          <div key={s.label} className="card-glow p-5 text-center group !cursor-default">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">{s.label}</div>
            <div className="text-xl font-bold text-okx group-hover:text-accent-purple-hover transition-colors">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-8 flex justify-between text-sm text-text-muted">
        <span>Syntheke Protocol · Built on X Layer · AI Season 2026</span>
        <a href="https://github.com/Gideon145/syntheke" className="hover:text-okx transition-colors">GitHub →</a>
      </div>
    </div>
  );
}
