import express from "express";
import cors from "cors";
import { config } from "./config";

const app = express();

app.use(cors());
app.use(express.json());

// ──── HEALTH ────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "syntheke-backend", timestamp: Date.now() });
});

// ──── AGENTS ────────────────────────────────────────────

app.get("/api/v1/agents/:address", async (req, res) => {
  res.json({ address: req.params.address, status: "not_implemented" });
});

app.get("/api/v1/agents/discover", async (_req, res) => {
  res.json({ agents: [], total: 0 });
});

// ──── PACTS ─────────────────────────────────────────────

app.get("/api/v1/pacts/:id", async (req, res) => {
  res.json({ id: req.params.id, status: "not_implemented" });
});

app.get("/api/v1/pacts/:id/attestations", async (req, res) => {
  res.json({ pactId: req.params.id, attestations: [] });
});

// ──── REPUTATION ────────────────────────────────────────

app.get("/api/v1/reputation/:address", async (req, res) => {
  res.json({ address: req.params.address, score: 5000 });
});

// ──── STATS ─────────────────────────────────────────────

app.get("/api/v1/stats", async (_req, res) => {
  res.json({
    totalPacts: 0,
    activePacts: 0,
    totalAgents: 0,
    totalValueLocked: "0",
  });
});

// ──── START ─────────────────────────────────────────────

app.listen(config.PORT, () => {
  console.log(`🏛️  Syntheke API running on http://localhost:${config.PORT}`);
  console.log(`   Chain: X Layer (${config.XLAYER_CHAIN_ID})`);
  console.log(`   RPC: ${config.XLAYER_RPC_URL}`);
});

export default app;
