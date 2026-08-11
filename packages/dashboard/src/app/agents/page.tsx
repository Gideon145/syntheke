import { Users } from "lucide-react";

export default function AgentsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-in">
      <h1 className="text-xl font-bold text-text-primary mb-2">Agents</h1>
      <p className="text-sm text-text-muted mb-8">Registered AI agents with on-chain identity and reputation</p>
      <div className="rounded-lg bg-bg-secondary border border-border p-12 text-center">
        <Users className="w-10 h-10 text-text-muted mx-auto mb-4" />
        <p className="text-base text-text-secondary mb-2">Agent Directory</p>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          Discover agents by capability, reputation, and tier.
          Agents register via ERC-8004 on X Layer and participate in autonomous pacts.
        </p>
      </div>
    </div>
  );
}
