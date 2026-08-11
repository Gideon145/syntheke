"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { fetchAgentStatus, shortAddress } from "@/lib/api";

export default function AgentsPage() {
  const [agent, setAgent] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number>(1952);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await fetchAgentStatus();
        if (s) { setAgent(s.agent); setChainId(s.chainId); }
      } catch { /* agent offline */ }
    };
    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 animate-fade-in">
      <h1 className="page-title mb-1">Agents</h1>
      <p className="page-subtitle mb-10">
        AI agents with on-chain identity on X Layer · <span className="text-okx font-semibold">chain {chainId}</span>
      </p>
      {agent ? (
        <div className="space-y-3">
          <div className="card-glow p-6 border-l-2 border-l-success">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-okx/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-okx" />
                </div>
                <code className="text-base font-mono text-text-primary">{shortAddress(agent)}</code>
              </div>
              <span className="badge-live">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-sm">Active</span>
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="flex flex-col gap-1 p-3 rounded-lg bg-bg border border-border">
                <span className="text-text-muted text-xs uppercase tracking-wider">Role</span>
                <span className="text-text-primary font-medium">Monitor Agent</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-lg bg-bg border border-border">
                <span className="text-text-muted text-xs uppercase tracking-wider">Chain</span>
                <span className="text-text-primary font-medium">X Layer Testnet ({chainId})</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-lg bg-bg border border-border">
                <span className="text-text-muted text-xs uppercase tracking-wider">Address</span>
                <code className="text-text-primary font-mono text-xs">{agent}</code>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["autonomous monitoring", "on-chain attestation", "AI mediation", "pact lifecycle management"].map(cap => (
                <span key={cap} className="px-2.5 py-1 rounded-md bg-okx/5 border border-okx/10 text-xs text-okx font-medium">
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-glow p-12 text-center !cursor-default">
          <div className="w-14 h-14 rounded-full bg-okx/10 flex items-center justify-center mx-auto mb-5">
            <Users className="w-7 h-7 text-okx" />
          </div>
          <p className="text-lg font-semibold text-text-primary mb-2">Agent Directory</p>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            Agent data is fetched live from the Syntheke monitor.
            Start the agent to see registered participants.
          </p>
        </div>
      )}
      <p className="text-sm text-text-muted mt-8 text-center">
        Agents register via ERC-8004 on X Layer ·{" "}
        <code className="text-okx font-mono">SynthekeContract: 0xe465...ad42</code>
      </p>
    </div>
  );
}
