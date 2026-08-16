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
import { ethers } from "ethers";

const AGENT_URL = process.env.SYNTHEKE_AGENT_URL ?? "https://agent-mainnet-production.up.railway.app";
const PAYER_KEY = (process.env.SYNTHEKE_PAYER_KEY ?? "").trim();
const CHAIN_ID = Number(process.env.SYNTHEKE_CHAIN_ID ?? 196);
const USDT = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

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
  version: "0.6.0",
});

/**
 * Full x402 payment loop for treaty creation:
 * 1. POST /pacts/create → 402 challenge (or 200 when free)
 * 2. Sign the EIP-3009 transferWithAuthorization with SYNTHEKE_PAYER_KEY
 * 3. Replay with PAYMENT-SIGNATURE → server settles on-chain → treaty formed
 */
async function createTreatyWithPayment(payload: {
  partyADesc: string;
  partyBDesc: string;
  description: string;
}): Promise<string> {
  const first = await fetch(`${AGENT_URL}/pacts/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  if (first.status === 200) {
    const data = (await first.json()) as { pactId?: string; state?: string };
    return `Treaty created!\n\nPact ID: ${data.pactId}\nState: ${data.state}\n\nView live: https://www.syntheke.xyz/pacts/${data.pactId}`;
  }
  if (first.status !== 402) {
    return `Creation failed: HTTP ${first.status} ${(await first.text()).slice(0, 200)}`;
  }

  const challengeRaw = first.headers.get("payment-required");
  if (!challengeRaw) return "Creation requires payment but the agent returned no payment challenge.";
  const challenge = JSON.parse(
    Buffer.from(challengeRaw, "base64").toString("utf8"),
  ) as {
    accepts: Array<{
      asset?: string;
      payTo?: string;
      amount?: string;
      maxTimeoutSeconds?: number;
      network?: string;
      extra?: { assetTransferMethod?: string; name?: string; version?: string };
    }>;
  };
  const offer = challenge.accepts?.[0];
  if (!offer) return "Creation requires payment but the payment challenge has no acceptable scheme.";

  if (!PAYER_KEY) {
    return [
      "This service requires a real payment (x402 v2, EIP-3009).",
      `Network: ${offer.network}  Asset: ${offer.asset}  Amount: ${offer.amount}`,
      `Pay to: ${offer.payTo}`,
      "To let me pay: set SYNTHEKE_PAYER_KEY to a wallet funded with the asset and retry.",
    ].join("\n");
  }

  const payer = new ethers.Wallet(PAYER_KEY);
  const amount = BigInt(offer.amount ?? "0");
  const validBefore = Math.floor(Date.now() / 1000) + (offer.maxTimeoutSeconds ?? 300) - 30;
  const nonce = ethers.keccak256(
    ethers.toUtf8Bytes(`syntheke-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  );
  const domain = {
    name: offer.extra?.name ?? "USD₮0",
    version: offer.extra?.version ?? "1",
    chainId: CHAIN_ID,
    verifyingContract: offer.asset ?? USDT,
  };
  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };
  const message = {
    from: payer.address,
    to: offer.payTo ?? "",
    value: amount,
    validAfter: 0n,
    validBefore: BigInt(validBefore),
    nonce,
  };
  const sig = await payer.signTypedData(domain, types, message);
  const { r, s, v } = ethers.Signature.from(sig);
  const paymentHeader = Buffer.from(JSON.stringify({
    from: payer.address,
    value: amount.toString(),
    validAfter: "0",
    validBefore: String(validBefore),
    nonce,
    v: v >= 27 ? v : v + 27,
    r,
    s,
  })).toString("base64");

  const second = await fetch(`${AGENT_URL}/pacts/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": paymentHeader },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });
  if (!second.ok) {
    return `Creation failed after payment: HTTP ${second.status} ${(await second.text()).slice(0, 200)}`;
  }
  const data = (await second.json()) as { success?: boolean; pactId?: string; state?: string; error?: string };
  if (!data.success) return `Creation failed: ${data.error ?? "unknown"}`;
  return [
    "Treaty created and PAID on-chain!",
    `Pact ID: ${data.pactId}`,
    `State: ${data.state}`,
    `Payer: ${payer.address} — settled ${ethers.formatUnits(amount, 6)} USDT via x402`,
    `View live: https://www.syntheke.xyz/pacts/${data.pactId}`,
  ].join("\n");
}

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

// 3. Create a treaty (full x402 payment loop)
server.tool(
  "create_treaty",
  "Create a new economic treaty between two AI agents. Two AIs (Claude + DeepSeek) negotiate terms live, then the treaty goes on-chain with escrow. Requires the 0.1 USDT x402 service payment — set SYNTHEKE_PAYER_KEY to a funded wallet to pay automatically.",
  {
    partyADesc: z.string().describe("Description of Party A (initiator), e.g. 'DeFi yield optimizer agent'"),
    partyBDesc: z.string().describe("Description of Party B (counterparty), e.g. 'Liquidation monitoring service agent'"),
    description: z.string().min(10).describe("What the treaty is for, e.g. 'Alpha pays 100 USDC monthly to Beta for liquidation monitoring'"),
  },
  async ({ partyADesc, partyBDesc, description }) => {
    const text = await createTreatyWithPayment({ partyADesc, partyBDesc, description });
    return { content: [{ type: "text", text }] };
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

// 7. Reputation oracle
server.tool(
  "agent_reputation",
  "Read an agent's on-chain reputation from the Syntheke ReputationOracle: ELO score, tier, compliance rate, and settlement history.",
  { agent: z.string().describe("Wallet address of the agent (0x-prefixed)") },
  async ({ agent }) => {
    const data = await agentFetch<{ reputation?: { score: number; tier: string; complianceBps: number; completed: number; breached: number; terminated: number } }>(`/reputation?agent=${encodeURIComponent(agent)}`);
    if ("error" in data) return { content: [{ type: "text", text: `Error: ${data.error}` }] };
    const rep = data.reputation;
    if (!rep) return { content: [{ type: "text", text: `No reputation record for ${agent}` }] };
    return {
      content: [{
        type: "text",
        text: `Reputation: ${agent}\nTier: ${rep.tier} - ELO: ${rep.score}\nCompliance: ${rep.complianceBps / 100}%\nSettled: ${rep.completed} completed, ${rep.breached} breached, ${rep.terminated} terminated`,
      }],
    };
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
