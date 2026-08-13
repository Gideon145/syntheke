/**
 * Syntheke MCP Server — AI-accessible protocol tools (Phase 3b)
 *
 * A Model Context Protocol server over stdio. Connect ChatGPT Desktop,
 * Claude Desktop, or any MCP client to ask questions about live treaties:
 *
 *   "What treaties are active on Syntheke right now?"
 *   "Create a treaty between a yield agent and a monitoring agent"
 *   "How much has the Syntheke treasury collected?"
 *
 * Tools proxy the live Syntheke agent API (Railway).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const AGENT_URL = process.env.SYNTHEKE_AGENT_URL ?? "https://agent-production-507e.up.railway.app";

// ──── Agent API helper ───────────────────────────────────

async function agentFetch<T>(path: string, init?: RequestInit): Promise<T | { error: string }> {
  try {
    const r = await fetch(`${AGENT_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!r.ok) return { error: `Agent API ${r.status}: ${await r.text().catch(() => "unknown")}` };
    return (await r.json()) as T;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ──── Server ─────────────────────────────────────────────

const server = new McpServer({
  name: "syntheke",
  version: "0.5.0",
});

// 1. List treaties
server.tool(
  "list_treaties",
  "List all economic treaties between AI agents on Syntheke (X Layer). Each treaty has an ID, state, and on-chain attestation count.",
  {},
  async () => {
    const data = await agentFetch<{ pacts?: Array<Record<string, unknown>> }>("/pacts");
    if ("error" in data) return { content: [{ type: "text", text: `Error: ${data.error}` }] };
    const pacts = data.pacts ?? [];
    if (pacts.length === 0) return { content: [{ type: "text", text: "No treaties found." }] };
    const lines = pacts.map((p, i) =>
      `${i + 1}. ${p.name ?? "Untitled"} — state=${p.lastState} · ${p.attestationCount ?? 0} attestations · ID: ${String(p.pactId).slice(0, 18)}...`
    );
    return { content: [{ type: "text", text: `${pacts.length} treaties on X Layer:\n\n${lines.join("\n")}` }] };
  },
);

// 2. Get a treaty
server.tool(
  "get_treaty",
  "Get full details of one treaty: on-chain state, parties, terms, AI negotiation transcript, and plain-English contract.",
  { pactId: z.string().describe("The 64-character pact ID (hex, 0x-prefixed)") },
  async ({ pactId }) => {
    const [pact, negotiation, contract] = await Promise.all([
      agentFetch<Record<string, unknown>>(`/pacts/${pactId}`),
      agentFetch<{ transcript?: Array<{ speaker: string; action: string; message: string; model: string }> }>(`/negotiations/${pactId}`),
      agentFetch<{ title?: string; sections?: Array<{ heading: string; body: string }> }>(`/contracts/${pactId}`),
    ]);

    const parts: string[] = [];
    if ("error" in pact) parts.push(`On-chain: ${pact.error}`);
    else parts.push(`On-chain: state=${pact.lastState}, partyA=${pact.partyA}, partyB=${pact.partyB}, attestations=${pact.attestationCount}`);

    if (!("error" in negotiation) && negotiation.transcript?.length) {
      parts.push(`\nAI negotiation (${negotiation.transcript.length} moves):`);
      for (const m of negotiation.transcript.slice(-6)) {
        parts.push(`  [${m.speaker === "A" ? "Alpha" : "Beta"}/${m.model}] ${m.action}: ${m.message.slice(0, 120)}`);
      }
    }

    if (!("error" in contract) && contract.title) {
      parts.push(`\nContract: ${contract.title}`);
      for (const s of contract.sections ?? []) parts.push(`  - ${s.heading}: ${s.body.slice(0, 100)}`);
    }

    return { content: [{ type: "text", text: parts.join("\n") }] };
  },
);

// 3. Create a treaty
server.tool(
  "create_treaty",
  "Create a new economic treaty between two AI agents. Two AIs (Claude + DeepSeek) negotiate terms live, then the treaty goes on-chain with escrow.",
  {
    partyADesc: z.string().describe("Description of Party A (initiator), e.g. 'DeFi yield optimizer agent'"),
    partyBDesc: z.string().describe("Description of Party B (counterparty), e.g. 'Liquidation monitoring service agent'"),
    description: z.string().min(10).describe("What the treaty is for, e.g. 'Alpha pays 100 USDC monthly to Beta for liquidation monitoring'"),
  },
  async ({ partyADesc, partyBDesc, description }) => {
    const data = await agentFetch<Record<string, unknown>>("/pacts/create", {
      method: "POST",
      body: JSON.stringify({ partyADesc, partyBDesc, description }),
    });
    if ("error" in data) return { content: [{ type: "text", text: `Error: ${data.error}` }] };
    if (!data.success) return { content: [{ type: "text", text: `Creation failed: ${data.error ?? "unknown"}` }] };
    const neg = data.negotiation as { status?: string; transcript?: Array<{ speaker: string; action: string; message: string }> } | undefined;
    const moves = neg?.transcript?.map(m => `  [${m.speaker === "A" ? "Alpha" : "Beta"}] ${m.action}: ${m.message.slice(0, 100)}`).join("\n") ?? "";
    return {
      content: [{
        type: "text",
        text: `Treaty created!\n\nPact ID: ${data.pactId}\nState: ${data.state}\nNegotiation: ${neg?.status ?? "n/a"}\n${moves}\n\nView live: https://www.syntheke.xyz/pacts/${data.pactId}`,
      }],
    };
  },
);

// 4. Treasury
server.tool(
  "treasury_status",
  "Get the Syntheke protocol treasury: total fees collected, fee count, and balance on X Layer.",
  {},
  async () => {
    const data = await agentFetch<Record<string, unknown>>("/treasury");
    if ("error" in data) return { content: [{ type: "text", text: `Error: ${data.error}` }] };
    return {
      content: [{
        type: "text",
        text: `Syntheke Treasury (${data.address})\nTotal collected: ${data.totalCollectedFormatted} OKB\nFees paid: ${data.feeCount}\nCurrent balance: ${data.balanceFormatted} OKB\nCreation fee: ${data.feeAmountFormatted} OKB per treaty`,
      }],
    };
  },
);

// 5. Mediator stakes
server.tool(
  "mediator_stakes",
  "Get mediator economic stakes: Themis, Athena, and Solon staked amounts, total slashed, and verdict count.",
  {},
  async () => {
    const data = await agentFetch<{ mediators?: Array<{ name: string; stakeFormatted: string }>; totalStakedFormatted?: string; totalSlashedFormatted?: string; verdictCount?: number; slashPercent?: number }>("/staking");
    if ("error" in data) return { content: [{ type: "text", text: `Error: ${data.error}` }] };
    const lines = (data.mediators ?? []).map(m => `  ${m.name}: ${m.stakeFormatted} OKB staked`);
    return {
      content: [{
        type: "text",
        text: `Mediator Stakes\nTotal: ${data.totalStakedFormatted} OKB - Slashed: ${data.totalSlashedFormatted} OKB - Verdicts: ${data.verdictCount}\nSlash rate: ${(data.slashPercent ?? 0) / 100}% per wrong verdict\n${lines.join("\n")}`,
      }],
    };
  },
);

// 6. Agent status
server.tool(
  "agent_status",
  "Get the Syntheke monitor agent status and dual-model AI health (Claude + DeepSeek).",
  {},
  async () => {
    const [status, ai] = await Promise.all([
      agentFetch<Record<string, unknown>>("/status"),
      agentFetch<{ models?: Array<{ id: string; available: boolean; role: string }> }>("/ai/status"),
    ]);
    const parts: string[] = [];
    if ("error" in status) parts.push(`Status: ${status.error}`);
    else parts.push(`Agent: ${status.agent}\nChain: ${status.chainId} - Cycles: ${status.cycles} - Attestations: ${status.attestations} - Pacts: ${status.pactsMonitored} - Running: ${status.running}`);
    if (!("error" in ai) && ai.models) {
      parts.push(`\nAI swarm:`);
      for (const m of ai.models) parts.push(`  ${m.id}: ${m.available ? "online" : "offline"} — ${m.role}`);
    }
    return { content: [{ type: "text", text: parts.join("\n") }] };
  },
);

// ──── Boot ───────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Syntheke MCP server ready — agent API: ${AGENT_URL}`);
}

main().catch(err => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
