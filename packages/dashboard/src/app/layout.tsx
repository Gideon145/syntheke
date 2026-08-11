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
      <body className="min-h-screen flex flex-col bg-bg text-text-primary antialiased">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
