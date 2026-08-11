import { Router } from "express";
import { optionalAuth } from "../middleware/auth";

const router = Router();

// GET /api/v1/reputation/:address — Reputation score + history
router.get("/:address", optionalAuth, async (req, res) => {
  const { address } = req.params;
  res.json({
    address,
    score: 5000,
    pactCount: 0,
    completedCount: 0,
    breachedCount: 0,
    terminatedCount: 0,
    history: [],
    // Reads from ReputationRegistry on X Layer (Phase 5)
  });
});

// GET /api/v1/reputation/leaderboard — Top agents by reputation
router.get("/leaderboard", optionalAuth, async (req, res) => {
  const { limit } = req.query;
  res.json({
    leaderboard: [],
    total: 0,
    limit: Number(limit) || 10,
  });
});

export default router;
