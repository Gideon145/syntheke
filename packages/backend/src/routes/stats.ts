import { Router } from "express";

const router = Router();

// GET /api/v1/stats — Protocol-level statistics
router.get("/", async (_req, res) => {
  res.json({
    totalPacts: 0,
    activePacts: 0,
    totalAgents: 0,
    totalValueLocked: "0",
    totalAttestations: 0,
    disputesResolved: 0,
    averageFairnessScore: 0,
    chainId: 1952,
    // Populated from DB + on-chain (Phase 5)
  });
});

export default router;
