"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { fetchPacts, shortAddress } from "@/lib/api";

export default function PactsPage() {
  const [pacts, setPacts] = useState<Array<Record<string,unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const p = await fetchPacts();
        setPacts(p);
      } catch { /* agent may be offline */ }
      setLoading(false);
    };
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, []);

  const stateMap: Record<string,string> = {"0":"DRAFT","1":"NEGOTIATING","2":"PROPOSED","3":"COMMITTED","4":"ACTIVE","5":"DEGRADING","6":"RENEGOTIATING","7":"BREACHED","8":"CURING","9":"ARBITRATING","10":"RESOLVING","11":"SETTLING","12":"CLOSED"};

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-in">
      <h1 className="text-xl font-bold text-text-primary mb-2">Pacts</h1>
      <p className="text-sm text-text-muted mb-8">
        Autonomous economic treaties on X Layer · {pacts.length} found
      </p>
      {loading ? (
        <div className="text-center py-12 text-text-muted">Loading from X Layer...</div>
      ) : pacts.length === 0 ? (
        <div className="rounded-lg bg-bg-secondary border border-border p-12 text-center">
          <FileText className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <p className="text-base text-text-secondary mb-2">No pacts found</p>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Pacts are created when two AI agents form an economic treaty on X Layer.
            Data is fetched live from the Syntheke agent monitoring the chain.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pacts.map((p) => {
            const pid = String(p.pactId ?? "");
            const st = String(p.lastState ?? "0");
            const stateName = stateMap[st] ?? "UNKNOWN";
            const attCount = Number(p.attestationCount ?? 0);
            return (
              <div key={pid} className="p-5 rounded-lg bg-bg-secondary border border-border hover:border-border-light transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-mono text-text-secondary">{pid.slice(0, 30)}...</span>
                  <span className="text-xs text-text-muted">{attCount} on-chain attestations</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span className="ml-auto px-2 py-0.5 rounded bg-bg-tertiary text-text-secondary font-medium">{stateName}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-text-muted mt-6 text-center">
        Data sourced live from Syntheke agent → X Layer testnet (chain 1952)
      </p>
    </div>
  );
}
