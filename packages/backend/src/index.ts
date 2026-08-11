import express from "express";
import cors from "cors";
import { config } from "./config";
import { rateLimiter } from "./middleware/rateLimit";
import { authMiddleware, type AuthenticatedRequest } from "./middleware/auth";
import agentsRouter from "./routes/agents";
import pactsRouter from "./routes/pacts";
import reputationRouter from "./routes/reputation";
import statsRouter from "./routes/stats";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "syntheke-api", version: "0.4.0", chainId: config.XLAYER_CHAIN_ID, timestamp: Date.now() });
});

app.use("/api/v1/agents", agentsRouter);
app.use("/api/v1/pacts", pactsRouter);
app.use("/api/v1/reputation", reputationRouter);
app.use("/api/v1/stats", statsRouter);

app.post("/api/v1/keys", authMiddleware, async (req, res) => {
  const { generateApiKey } = await import("./middleware/auth");
  const scopes = (req.body as { scopes?: string[] }).scopes ?? ["read", "write"];
  const key = generateApiKey((req as AuthenticatedRequest).agentAddress!, scopes);
  res.status(201).json({ apiKey: key, scopes, message: "Store this key securely." });
});

app.delete("/api/v1/keys", authMiddleware, async (req, res) => {
  const { createHash } = await import("node:crypto");
  const { revokeApiKey } = await import("./middleware/auth");
  const raw = (req.body as { key: string }).key;
  const keyHash = createHash("sha256").update(raw).digest("hex");
  res.json({ revoked: revokeApiKey(keyHash) });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", ...(process.env.NODE_ENV !== "production" && { detail: err.message }) });
});

app.listen(config.PORT, () => {
  console.log(`🏛️  Syntheke API v0.4.0 — http://localhost:${config.PORT}`);
  console.log(`   Chain: X Layer (${config.XLAYER_CHAIN_ID})`);
});

export default app;
