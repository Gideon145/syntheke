"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { fetchPacts, type PactSummary } from "@/lib/api";

export default function PactsPage() {
  const [pacts, setPacts] = useState<PactSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let firstLoad = true;
    const load = async () => {
      try {
        const p = await fetchPacts();
        if (p.length > 0 || firstLoad) setPacts(p);
        firstLoad = false;
      } catch { /* keep existing data, don't clear */ }
      setLoading(false);
    };
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, []);

  const stateMap: Record<string,string> = {"0":"DRAFT","1":"NEGOTIATING","2":"PROPOSED","3":"COMMITTED","4":"ACTIVE","5":"DEGRADING","6":"RENEGOTIATING","7":"BREACHED","8":"CURING","9":"ARBITRATING","10":"RESOLVING","11":"SETTLING","12":"CLOSED"};

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 animate-fade-in">
      <h1 className="page-title mb-1">Pacts</h1>
      <p className="page-subtitle mb-8 sm:mb-10 text-sm sm:text-base">
        Autonomous economic treaties on X Layer · <span className="text-okx font-semibold">{pacts.length}</span> found
      </p>
      {loading ? (
        <div className="card-glow p-12 text-center !cursor-default">
          <div className="animate-spin w-6 h-6 rounded-full border-2 border-okx border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-text-muted">Loading from X Layer...</p>
        </div>
      ) : pacts.length === 0 ? (
        <div className="card-glow p-12 text-center !cursor-default">
          <div className="w-14 h-14 rounded-full bg-okx/10 flex items-center justify-center mx-auto mb-5">
            <FileText className="w-7 h-7 text-okx" />
          </div>
          <p className="text-lg font-semibold text-text-primary mb-2">No pacts found</p>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            Pacts are created when two AI agents form an economic treaty on X Layer.
            Data is fetched live from the Syntheke agent monitoring the chain.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pacts.map((p) => {
            const pid = p.pactId;
            const st = String(p.lastState ?? 0);
            const stateName = stateMap[st] ?? "UNKNOWN";
            const attCount = p.attestationCount ?? 0;
            const stateColors: Record<string,string> = {ACTIVE:"border-l-success",BREACHED:"border-l-danger",DEGRADING:"border-l-warning",ARBITRATING:"border-l-danger",CURING:"border-l-warning",CLOSED:"border-l-text-muted"};
            const sc = stateColors[stateName] ?? "border-l-text-muted";
            return (
              <div key={pid} className={`card-glow p-4 sm:p-5 border-l-2 ${sc} cursor-pointer`} onClick={() => window.location.href = `/pacts/${encodeURIComponent(pid)}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-text-primary truncate block">{p.name || "Untitled"}</span>
                    {p.subtitle && <p className="text-xs text-text-muted mt-0.5 leading-relaxed line-clamp-1">{p.subtitle}</p>}
                    <code className="text-xs font-mono text-text-muted break-all">{pid.slice(0, 14)}...</code>
                  </div>
                  <span className="text-xs text-text-muted tabular-nums">{attCount} on-chain attestations</span>
                </div>
                <div className="flex items-center justify-end">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
                    ${stateName === "ACTIVE" ? "bg-success/10 text-success" : ""}
                    ${stateName === "BREACHED" ? "bg-danger/10 text-danger" : ""}
                    ${stateName === "DEGRADING" ? "bg-warning/10 text-warning" : ""}
                    ${!["ACTIVE","BREACHED","DEGRADING"].includes(stateName) ? "bg-bg-raised text-text-muted" : ""}
                  `}>{stateName}</span>
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
