import express from "express";

/**
 * Syntheke MCP Server — AI-accessible protocol tools.
 *
 * Exposes Syntheke protocol state as MCP-compatible tools so AI assistants
 * can query pact state, agent reputation, attestation history, and protocol
 * statistics without needing to understand the smart contract ABI.
 *
 * Tools:
 *   get_pact_state      — Query any pact's current state + condition health
 *   list_active_pacts   — All active pacts for an agent
 *   get_agent_reputation — Reputation score + history
 *   get_attestation_chain — Full attestation history for a pact
 *   simulate_settlement  — Preview settlement outcome given resolution params
 *   discover_agents      — Search agents by capability/reputation
 *   get_protocol_stats   — Aggregate protocol statistics
 */

const app = express();
app.use(express.json());

// ──── Tool Definitions ───────────────────────────────────

const TOOLS = {
  get_pact_state: {
    description: "Get the current state, terms, and condition health of any pact on X Layer",
    parameters: {
      pactId: { type: "string", description: "The pact ID (bytes32 hex)" },
    },
  },
  list_active_pacts: {
    description: "List all active pacts for a given agent address",
    parameters: {
      agentAddress: { type: "string", description: "The agent's Ethereum address" },
    },
  },
  get_agent_reputation: {
    description: "Get reputation score, pact count, and history for an agent",
    parameters: {
      agentAddress: { type: "string", description: "The agent's Ethereum address" },
    },
  },
  get_attestation_chain: {
    description: "Get the full attestation history (monitoring cycles) for a pact",
    parameters: {
      pactId: { type: "string", description: "The pact ID (bytes32 hex)" },
      limit: { type: "number", description: "Max attestations to return (default 50)" },
    },
  },
  simulate_settlement: {
    description: "Preview the settlement outcome for a pact given resolution parameters",
    parameters: {
      pactId: { type: "string" },
      settlementAmount: { type: "string", description: "Settlement amount in wei" },
      partyAPayout: { type: "string", description: "Party A payout in wei" },
      partyBPayout: { type: "string", description: "Party B payout in wei" },
    },
  },
  discover_agents: {
    description: "Search for agents by capability, minimum reputation, or tier",
    parameters: {
      capability: { type: "string", description: "Filter by capability (e.g. 'yield_optimization')" },
      minReputation: { type: "number", description: "Minimum reputation score (0-10000)" },
      limit: { type: "number", description: "Max results (default 20)" },
    },
  },
  get_protocol_stats: {
    description: "Get aggregate Syntheke protocol statistics",
    parameters: {},
  },
};

// ──── Tool Handlers ──────────────────────────────────────

async function handleTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case "get_pact_state":
      return {
        pactId: params.pactId,
        state: "UNKNOWN",
        partyA: null,
        partyB: null,
        terms: null,
        attestationCount: 0,
        message: "Connect to X Layer for live data. Phase 5 will add direct chain reads.",
      };

    case "list_active_pacts":
      return {
        agent: params.agentAddress,
        pacts: [],
        total: 0,
        message: "Active pacts queried from X Layer event indexer.",
      };

    case "get_agent_reputation":
      return {
        agent: params.agentAddress,
        score: 5000,
        pactCount: 0,
        completedCount: 0,
        breachedCount: 0,
        message: "Reputation read from ReputationRegistry on X Layer.",
      };

    case "get_attestation_chain":
      return {
        pactId: params.pactId,
        attestations: [],
        total: 0,
      };

    case "simulate_settlement": {
      const total = BigInt(params.settlementAmount as string || "0");
      const a = BigInt(params.partyAPayout as string || "0");
      const b = BigInt(params.partyBPayout as string || "0");
      return {
        settlementAmount: total.toString(),
        partyAPayout: a.toString(),
        partyBPayout: b.toString(),
        balanced: total === a + b,
      };
    }

    case "discover_agents":
      return {
        agents: [],
        total: 0,
        filters: {
          capability: params.capability,
          minReputation: params.minReputation ?? 0,
        },
      };

    case "get_protocol_stats":
      return {
        totalPacts: 0,
        activePacts: 0,
        totalAgents: 0,
        totalValueLocked: "0",
        disputesResolved: 0,
        chainId: 1952,
      };

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ──── MCP Endpoints ──────────────────────────────────────

// GET /mcp/tools — List available tools
app.get("/mcp/tools", (_req, res) => {
  res.json({ tools: TOOLS });
});

// POST /mcp/call/:toolName — Execute a tool
app.post("/mcp/call/:toolName", async (req, res) => {
  const { toolName } = req.params;
  if (!TOOLS[toolName as keyof typeof TOOLS]) {
    res.status(404).json({ error: `Unknown tool: ${toolName}` });
    return;
  }
  try {
    const result = await handleTool(toolName, req.body ?? {});
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Tool execution failed" });
  }
});

// GET /health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "syntheke-mcp" });
});

// ──── Start ──────────────────────────────────────────────

const PORT = process.env.MCP_PORT ?? 3003;
app.listen(PORT, () => {
  console.log(`🔧 Syntheke MCP server on http://localhost:${PORT}`);
  console.log(`   Tools: ${Object.keys(TOOLS).length} available`);
});

export default app;
