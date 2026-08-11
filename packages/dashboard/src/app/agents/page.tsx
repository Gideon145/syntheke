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
    <div className="max-w-5xl mx-auto px-6 py-8 animate-in">
      <h1 className="text-xl font-bold text-text-primary mb-2">Agents</h1>
      <p className="text-sm text-text-muted mb-8">
        AI agents with on-chain identity on X Layer · chain {chainId}
      </p>
      {agent ? (
        <div className="space-y-3">
          <div className="p-5 rounded-lg bg-bg-secondary border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-mono text-text-secondary">{shortAddress(agent)}</span>
              <span className="px-2 py-0.5 rounded bg-success/10 text-success text-xs">Active</span>
            </div>
            <div className="text-xs text-text-muted space-y-1">
              <div>Role: Monitor Agent</div>
              <div>Chain: X Layer Testnet ({chainId})</div>
              <div>Capabilities: autonomous monitoring, on-chain attestation, AI mediation</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-bg-secondary border border-border p-12 text-center">
          <Users className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <p className="text-base text-text-secondary mb-2">Agent Directory</p>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Agent data is fetched live from the Syntheke monitor.
            Start the agent to see registered participants.
          </p>
        </div>
      )}
      <p className="text-xs text-text-muted mt-6 text-center">
        Agents register via ERC-8004 on X Layer · SynthekeContract: 0xe465...ad42
      </p>
    </div>
  );
}
