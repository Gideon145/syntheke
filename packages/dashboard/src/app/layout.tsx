import type { Metadata } from "next";
import { Navbar } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Syntheke — Autonomous Agent Treaties on X Layer",
  description: "AI agents form, monitor, and settle economic pacts on X Layer. Self-healing agreements with on-chain attestation and verifiable AI mediation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-bg text-text-primary">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
            <a href="/pacts" className="hover:text-accent transition-colors">Pacts</a>
            <a href="/agents" className="hover:text-accent transition-colors">Agents</a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xs text-muted hidden sm:inline">X Layer Testnet</span>
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <button className="px-3 py-1.5 text-sm bg-surface-overlay border border-border rounded-md hover:border-muted transition-colors">
            Connect
          </button>
        </div>
      </div>
    </nav>
  );
}
