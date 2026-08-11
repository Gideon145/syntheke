import { Router } from "express";
import { authMiddleware, requireScope, type AuthenticatedRequest } from "../middleware/auth";
import { validate, PactProposalSchema, NegotiationSchema } from "../middleware/validate";

const router = Router();

// POST /api/v1/pacts/draft — Create a new draft pact
router.post("/draft", authMiddleware, requireScope("write"), async (req, res) => {
  res.status(201).json({
    pactId: null,
    status: "draft",
    message: "Submit transaction to SynthekeContract.createDraft() on X Layer. Use the SDK for a simplified flow.",
  });
});

// POST /api/v1/pacts/propose — Propose a pact with AI-assisted terms
router.post("/propose", authMiddleware, requireScope("write"), validate(PactProposalSchema), async (req, res) => {
  const { counterparty, description, amount, duration, collateralRatio, interestRate } = req.body;
  res.status(201).json({
    proposer: (req as AuthenticatedRequest).agentAddress,
    counterparty,
    terms: {
      amount: amount ?? "1000000000000000000000",
      duration: duration ?? 10000,
      collateralRatio: collateralRatio ?? 15000,
      interestRate: interestRate ?? 800,
    },
    aiGenerated: !!description,
    message: "Use SynthekeContract.proposeTerms() on X Layer to finalize. SDK handles this automatically.",
  });
});

// GET /api/v1/pacts — List pacts for the authenticated agent
router.get("/", authMiddleware, async (req, res) => {
  res.json({
    agent: (req as AuthenticatedRequest).agentAddress,
    pacts: [],
    total: 0,
    // Populated by event indexer (Phase 5)
  });
});

// GET /api/v1/pacts/:pactId — Full pact state + history
router.get("/:pactId", async (req, res) => {
  const { pactId } = req.params;
  res.json({
    pactId,
    state: "UNKNOWN",
    partyA: null,
    partyB: null,
    terms: null,
    attestations: [],
    amendments: [],
    // Reads from X Layer via SynthekeContract (Phase 5 real-time)
  });
});

// GET /api/v1/pacts/:pactId/attestations — Monitoring attestation chain
router.get("/:pactId/attestations", async (req, res) => {
  const { pactId } = req.params;
  res.json({
    pactId,
    attestations: [],
    total: 0,
  });
});

// GET /api/v1/pacts/:pactId/health — Current condition health
router.get("/:pactId/health", async (req, res) => {
  const { pactId } = req.params;
  res.json({
    pactId,
    state: "UNKNOWN",
    conditions: [],
    degradationCount: 0,
    lastAttestation: null,
  });
});

// POST /api/v1/pacts/:pactId/renegotiate — Initiate renegotiation
router.post("/:pactId/renegotiate", authMiddleware, requireScope("write"), async (req, res) => {
  res.json({
    pactId: req.params.pactId,
    status: "renegotiation_initiated",
    message: "Submit SynthekeContract.initiateRenegotiation() on X Layer.",
  });
});

// POST /api/v1/pacts/:pactId/terminate — Mutual termination
router.post("/:pactId/terminate", authMiddleware, requireScope("write"), async (req, res) => {
  res.json({
    pactId: req.params.pactId,
    status: "terminated",
    message: "Submit SynthekeContract.terminatePact() on X Layer.",
  });
});

export default router;
