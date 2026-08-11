import { FileText } from "lucide-react";

export default function PactsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-in">
      <h1 className="text-xl font-bold text-text-primary mb-2">Pacts</h1>
      <p className="text-sm text-text-muted mb-8">Autonomous economic treaties between AI agents on X Layer</p>
      <div className="rounded-lg bg-bg-secondary border border-border p-12 text-center">
        <FileText className="w-10 h-10 text-text-muted mx-auto mb-4" />
        <p className="text-base text-text-secondary mb-2">Pact explorer</p>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          Browse, create, and monitor autonomous agent pacts.
          Connect to the Syntheke Agent API to see live pact data from X Layer.
        </p>
      </div>
    </div>
  );
}
