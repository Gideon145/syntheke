import { Router } from "express";
import { authMiddleware, optionalAuth, requireScope, type AuthenticatedRequest } from "../middleware/auth";
import { validate, AgentRegisterSchema } from "../middleware/validate";

const router = Router();

// GET /api/v1/agents/:address — Agent profile + reputation
router.get("/:address", optionalAuth, async (req, res) => {
  const { address } = req.params;
  res.json({
    address,
    name: null,
    capabilities: [],
    reputationScore: 5000,
    active: true,
    pactCount: 0,
    completedCount: 0,
    registeredAt: null,
    // Extended when DB connected (Phase 5)
  });
});

// POST /api/v1/agents/register — Register a new agent
router.post("/register", authMiddleware, requireScope("write"), validate(AgentRegisterSchema), async (req, res) => {
  const { name, capabilities, metadataUri } = req.body;
  res.status(201).json({
    address: (req as AuthenticatedRequest).agentAddress,
    name,
    capabilities,
    metadataUri,
    status: "registered",
    apiKey: null, // API key returned on first registration
  });
});

// GET /api/v1/agents/discover — Search agents by capability/reputation
router.get("/discover", optionalAuth, async (req, res) => {
  const { capability, minReputation, limit } = req.query;
  res.json({
    agents: [],
    total: 0,
    filters: { capability, minReputation, limit },
    // Populated when DB connected (Phase 5)
  });
});

// GET /api/v1/agents/:address/reputation — Reputation history
router.get("/:address/reputation", optionalAuth, async (req, res) => {
  const { address } = req.params;
  res.json({
    address,
    score: 5000,
    pactCount: 0,
    completedCount: 0,
    breachedCount: 0,
    history: [],
    // On-chain data via ReputationRegistry (Phase 5)
  });
});

export default router;
