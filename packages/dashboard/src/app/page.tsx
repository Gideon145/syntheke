export default function Home() {
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

      {/* Stats */}
      <div className="mb-20 sm:mb-32 space-y-1">
        <div className="text-xs text-text-muted uppercase tracking-[0.2em] mb-8 sm:mb-10 animate-fade-in-slow">Protocol Stats</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-hairline rounded-xl overflow-hidden">
          {[
            { label: "Contracts", value: "4 Deployed" },
            { label: "State Machine", value: "15 States" },
            { label: "Monitoring", value: "24/7 Autonomous" },
            { label: "AI Mediators", value: "3 Agents, 2/3 Consensus" },
          ].map((s, i) => (
            <div key={s.label} className={`bg-bg-secondary p-6 sm:p-8 text-center group transition-colors duration-500 hover:bg-bg-raised animate-fade-up stagger-${i + 1}`}>
              <div className="text-2xl sm:text-3xl font-bold text-amber group-hover:text-amber-soft transition-colors duration-500 mb-2">{s.value}</div>
              <div className="text-2xs sm:text-xs text-text-muted uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="hr-hairline pt-8 sm:pt-10 flex flex-col sm:flex-row gap-2 sm:justify-between text-xs sm:text-sm text-text-muted">
        <span>Syntheke Protocol · Built on X Layer</span>
        <span>συνθήκη — autonomous treaties</span>
      </div>
    </div>
  );
}
