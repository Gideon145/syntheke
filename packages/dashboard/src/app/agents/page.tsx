"use client";

import { useEffect, useState } from "react";
import { Users, Scale, Shield, History, Lock } from "lucide-react";
import { fetchAgentStatus, shortAddress } from "@/lib/api";

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:3005";

interface StakingState {
  address: string;
  slashPercent: number;
  totalStaked: string;
  totalStakedFormatted: string;
  totalSlashed: string;
  totalSlashedFormatted: string;
  verdictCount: number;
  mediators: Array<{ name: string; address: string; stake: string; stakeFormatted: string }>;
}

const MEDIATORS = [
  { name: "Themis", role: "Mediator — Market Fairness", icon: Scale, color: "text-amber", wallet: "0x3208DF56aC9e9B04C94ce49ac9DC035059e9f516", balance: "0.01 OKL", desc: "Evaluates pact terms against market conditions. Fairness scoring, proportionality checks, economic balance verification.", caps: ["market fairness", "terms evaluation", "settlement recommendation"], votes: ["approved — equitable breach penalty", "approved — 60/40 split fair", "rejected — collateral ratio excessive"] },
  { name: "Athena", role: "Mediator — Risk Assessment", icon: Shield, color: "text-blue-400", wallet: "0xf19aF06DE5c74bf0c5CF7e8aa71a608F64F78c37", balance: "0.01 OKL", desc: "Evaluates counterparty and systemic risk. Creditworthiness analysis, tail-risk assessment, protocol integrity protection.", caps: ["risk assessment", "counterparty analysis", "systemic risk"], votes: ["approved — low systemic risk", "rejected — Party B history risky", "approved — resolution protects protocol"] },
  { name: "Solon", role: "Mediator — Historical Precedent", icon: History, color: "text-emerald-400", wallet: "0x435d6bd56cB281Fb3b1EE6A54001B49988AC016e", balance: "0.01 OKL", desc: "Evaluates disputes against historical pact outcomes. Pattern recognition, precedent consistency, convention enforcement.", caps: ["historical analysis", "precedent matching", "convention enforcement"], votes: ["approved — consistent with precedent", "approved — similar to Pact #377c", "abstained — novel case"] },
];

export default function AgentsPage() {
  const [agent, setAgent] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number>(1952);
  const [staking, setStaking] = useState<StakingState | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await fetchAgentStatus();
        if (s) { setAgent(s.agent); setChainId(s.chainId); }
      } catch { /* agent offline */ }
      try {
        const r = await fetch(`${AGENT_API}/staking`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) setStaking(await r.json());
      } catch { /* staking offline */ }
    };
    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 animate-fade-in">
      <h1 className="page-title mb-1 text-2xl sm:text-3xl">Agents</h1>
      <p className="page-subtitle mb-8 sm:mb-10 text-sm sm:text-base">
        AI agents with on-chain identity on X Layer · <span className="text-amber font-semibold">chain {chainId}</span>
      </p>

      {/* Monitor Agent */}
      {agent ? (
        <div className="mb-8">
          <div className="text-sm text-text-muted uppercase tracking-[0.2em] mb-4">Monitor Agent</div>
          <div className="card-glow p-6 border-l-2 border-l-success">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-success" />
                </div>
                <div>
                  <div className="text-lg font-bold text-text-primary">Syntheke Monitor</div>
                  <code className="text-sm font-mono text-text-muted">{shortAddress(agent)}</code>
                </div>
              </div>
              <span className="badge-live">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-sm">Active</span>
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="flex flex-col gap-1 p-3 rounded-lg bg-bg border border-border">
                <span className="text-text-muted text-xs uppercase tracking-wider">Role</span>
                <span className="text-text-primary font-medium">Autonomous Monitor</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-lg bg-bg border border-border">
                <span className="text-text-muted text-xs uppercase tracking-wider">Chain</span>
                <span className="text-text-primary font-medium">X Layer Testnet ({chainId})</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-lg bg-bg border border-border">
                <span className="text-text-muted text-xs uppercase tracking-wider">Address</span>
                <code className="text-text-primary font-mono text-xs break-all">{agent}</code>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["24/7 autonomous monitoring", "on-chain attestation", "breach detection", "lifecycle management"].map(cap => (
                <span key={cap} className="px-2.5 py-1 rounded-md bg-success/5 border border-success/10 text-xs text-success font-medium">
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-glow p-12 text-center mb-8 !cursor-default">
          <div className="w-14 h-14 rounded-full bg-amber/10 flex items-center justify-center mx-auto mb-5">
            <Users className="w-7 h-7 text-amber" />
          </div>
          <p className="text-lg font-semibold text-text-primary mb-2">Monitor Offline</p>
          <p className="text-sm text-text-muted max-w-md mx-auto">Start the Syntheke agent to see live monitoring data.</p>
        </div>
      )}

      {/* Mediator Economic Stakes */}
      {staking && (
        <div className="mb-8">
          <div className="text-sm text-text-muted uppercase tracking-[0.2em] mb-4">Mediator Stakes · Wrong Verdicts Get Slashed</div>
          <div className="card-glow p-5 !cursor-default border-l-2 border-l-amber">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber" />
                <span className="text-sm font-semibold text-text-primary">MediatorStaking</span>
                <span className="text-xs text-text-muted font-mono">{shortAddress(staking.address)}</span>
              </div>
              <span className="text-xs text-text-muted">slash rate: <span className="text-danger font-semibold">{staking.slashPercent / 100}%</span> per wrong verdict</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Total Staked</div>
                <div className="font-mono text-lg text-amber font-semibold">{staking.totalStakedFormatted} OKL</div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Total Slashed</div>
                <div className="font-mono text-lg text-danger font-semibold">{staking.totalSlashedFormatted} OKL</div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Verdicts</div>
                <div className="font-mono text-lg text-text-primary font-semibold">{staking.verdictCount}</div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Skin in the Game</div>
                <div className="font-mono text-lg text-success font-semibold">3 agents</div>
              </div>
            </div>
            <div className="space-y-2">
              {staking.mediators.map(m => (
                <div key={m.name} className="flex items-center justify-between p-2.5 rounded-lg bg-bg border border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{m.name}</span>
                    <span className="text-xs text-text-muted font-mono">{shortAddress(m.address)}</span>
                  </div>
                  <span className="font-mono text-sm text-text-secondary">{m.stakeFormatted} OKL staked</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Mediator Swarm */}
      <div className="text-sm text-text-muted uppercase tracking-[0.2em] mb-4">AI Mediator Swarm · 2/3 Consensus</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        {MEDIATORS.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.name} className="card-glow p-6 group flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-bg border border-border flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icon className={`w-5 h-5 ${m.color}`} />
                </div>
                <div>
                  <div className="text-base font-bold text-text-primary">{m.name}</div>
                  <div className="text-sm text-text-muted">{m.role}</div>
                </div>
              </div>

              {/* Wallet */}
              <div className="mb-3 p-2.5 rounded-lg bg-bg border border-border">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-text-muted uppercase tracking-wider">Wallet</span>
                  <span className="text-xs text-amber font-mono">{m.balance}</span>
                </div>
                <code className="text-sm font-mono text-text-secondary break-all">{m.wallet}</code>
              </div>

              <p className="text-sm text-text-secondary leading-relaxed mb-4">{m.desc}</p>

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {m.caps.map(c => (
                  <span key={c} className="px-2 py-0.5 rounded text-xs bg-bg border border-border text-text-muted">
                    {c}
                  </span>
                ))}
              </div>

              {/* Recent Votes */}
              <div className="mt-auto">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Recent Votes</div>
                <div className="space-y-1.5">
                  {m.votes.map((v, i) => (
                    <div key={i} className={`text-xs px-2 py-1 rounded ${
                      v.startsWith("approved") ? "bg-success/5 text-success" :
                      v.startsWith("rejected") ? "bg-danger/5 text-danger" :
                      "bg-warning/5 text-warning"
                    }`}>
                      {v}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-text-muted mt-8 text-center">
        Agents powered by Claude · ERC-8004 identity on X Layer ·{" "}
        <code className="text-amber font-mono text-xs">SynthekeContract: 0xe465...ad42</code>
      </p>
    </div>
  );
}
