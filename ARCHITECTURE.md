# Syntheke — Architecture

Deep technical design for the Syntheke autonomous treaty protocol.
The README is the narrative; this document is the wiring.

---

## 1. System Overview

```
┌──────────────────┐   HTTPS    ┌───────────────────────────────┐
│  Next.js dashboard│ ────────▶ │  Syntheke agent (Node.js 24)   │
│  (Vercel)         │            │  ethers v6 · tsx · Railway     │
│  www.syntheke.xyz │ ◀──────── │  agent-production-507e.up...   │
└──────────────────┘    JSON    └──────┬─────────────┬───────────┘
                                       │             │
                          ┌────────────┴───┐   ┌─────┴──────────────┐
                          │  Postgres       │   │  AI services        │
                          │  (Railway plugin)│   │  Claude (Anthropic) │
                          │  activity/sessions│   │  DeepSeek API       │
                          │  contracts/names │   └────────────────────┘
                          │  subjects/feedback│
                          └────────────────┘   ┌────────────────────────┐
                                               │  OnchainOS CLI + OKX    │
                                               │  public REST (tickers)  │
                                               └────────────────────────┘
                                       │
                                       │  JSON-RPC (testrpc.xlayer.tech, 1952)
                                       ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │  X Layer testnet                                                   │
   │  SynthekeContract v2 · EscrowVaultV2 · MediatorVotes ·             │
   │  MediatorStaking · ArtifactRegistry · ReputationOracle v2 ·        │
   │  ReputationRegistry v1 · TreasuryVault · AgentRegistry ·           │
   │  TreatySyndicate · TestUSDC · TestUSDC3009                          │
   └───────────────────────────────────────────────────────────────────┘
```

The off-chain agent **decides and explains**; the X Layer contracts **hold and enforce**.
No synthetic on-chain state: every displayed number is read from the chain or Postgres.

## 2. Module map (`packages/agent/src/`)

| Module | Responsibility |
|---|---|
| `index.ts` | HTTP API (40+ routes), boot sequence, pact cache, activity log |
| `monitor.ts` | 15-second OBSERVE→COLLECT→EVALUATE→DECIDE→EXECUTE loop |
| `conditions.ts` | 13-bit condition bitmap, labels, state assessment |
| `oracles.ts` | Live BTC/ETH via OnchainOS/OKX REST; Pyth tier-1; identity + escrow reads |
| `create-pact.ts` | Full NL→pact pipeline; subject detection; treasury fee; escrow funding |
| `ai/theater.ts` | Claude vs DeepSeek negotiation, SSE events, schema validation |
| `ai/negotiator.ts` | NL → `PactTerms` (DeepSeek first, Claude fallback, 0.7 confidence gate) |
| `ai/contract-writer.ts` | Plain-English contract prose, artifact recording |
| `ai/mediator.ts` | Off-chain LLM mediation (`POST /ai/mediate`) |
| `vote.ts` | Mediator swarm: commit → reveal → tally; payout split; stake record |
| `escrow.ts` | Real TestUSDC custody: mint → approve → vault pull → settle |
| `x402.ts` | HTTP-402 gate, EIP-3009 settlement relay, payment state |
| `a2a.ts` | Agent card (v0.7.0, 5 skills) + `/a2a/join` |
| `feedback.ts` | ERC-8004 dual-write queue to the OKX marketplace |
| `staking.ts` | Mediator OKB stakes, idempotent boot staking |
| `reputation.ts` | Outcome recording on ReputationOracle v2 + snapshots |
| `artifact.ts` | AI-output provenance on ArtifactRegistry |
| `db.ts` | Postgres persistence with graceful memory-only fallback |
| `config.ts` | All addresses, chain ids, model configs, flags |
| `syndicate.ts` | N-party treaty syndicates (TreatySyndicate) |
| `notify.ts` | A2A notifications (delivery simulated in v1) |
| `heal.ts` | Self-heal amendment path (DEGRADING → renegotiate → ACTIVE) |

## 3. Data flows

### 3.1 Pact creation (`POST /pacts/create`)

```
NL description
  → nlToPactTerms (DeepSeek → Claude fallback; default-terms heuristic if both fail)
  → fresh Party A wallet funded 0.015 OKB from agent wallet
  → createDraft()                    [DRAFT]
  → subject detection (dex|sla|monitoring|general)
  → payCreationFee 0.01 OKB → TreasuryVault
  → theater: Claude (A) vs DeepSeek (B), max 2 rounds, every move → ArtifactRegistry
  → writeContract prose → contract-vN artifact
  → fund Party B 0.01 OKB → joinDraft()           [NEGOTIATING]
  → proposeTerms() (+bits 11/12 for DEX subjects) [terms hashed]
  → finalizeNegotiation()                         [PROPOSED]
  → depositEscrow() A → COMMITTED · B → ACTIVE
  → depositEscrowReal() ×2 → mint TestUSDC → approve → EscrowVaultV2.deposit()
```

### 3.2 Monitor loop (every 15 s)

```
runCycle:
  every 5th cycle: re-sync nonce from chain
  fetchActivePacts() (state < 12)
  per pact: OBSERVE → COLLECT (collectConditions, gated by terms.monitoredConditions)
            EVALUATE → buildBitmap + assessState (critical/hard/soft lists)
            DECIDE   → recommended state
            EXECUTE  → recordAttestation(pactId, bitmap, state, dataHash, reason)
  attestation cadence: on any state change, or ACTIVE and cycle % 5 == 0 (≈75 s heartbeat)
  CURING with past deadline → escalateUncuredBreach() → ARBITRATING
  DEGRADING with consecutiveDegradation ≥ threshold → AI self-heal amendment path
```

### 3.3 Arbitration + settlement

```
escalateUncuredBreach → ARBITRATING
  → buildEvidence(pact) → runMediatorVote(evidence)
       Phase 1: each of Themis/Athena/Solon → MediatorVotes.commitVote(hash(verdict,fairness,reason,nonce))
       Phase 2 (all 3 committed): revealVote — contract verifies hash, fairness ≤ 100
       tally: approve / reject / abstain → 2-of-3 consensus
  → payout split: approve 70/30 · reject 30/70 · deadlock 50/50
  → MediatorStaking.recordVerdict (slash minority 20% → reward majority)
  → resolvePact() → RESOLVING → SETTLING
  → EscrowVaultV2.settle(recipientA, amountA, recipientB, amountB)  [A + B = total]
  → finalizeSettlement() → CLOSED
  → ReputationOracle.recordOutcome (COMPLETED/BREACHED/TERMINATED, fairnessBps)
  → queuePactFeedback → OKX dual-write queue
```

### 3.4 x402 payment (`GET /premium/timeline/:pactId`, `POST /tasks/evaluate`)

```
client GET → 402 + PAYMENT-REQUIRED (base64 JSON, scheme "exact",
             asset TestUSDC3009, payTo = agent wallet, 1.0 TUSD9, extra: eip-3009)
client signs EIP-712 transferWithAuthorization (domain TestUSD3009 v2)
client retries with PAYMENT-SIGNATURE header
agent: decode → recover signer == from → amount ≥ price
     → relay transferWithAuthorization on-chain (6 nonce-retry attempts,
       because the monitor shares the owner wallet)
     → 200 + PAYMENT-RESPONSE header (status settled, tx hash)
```

### 3.5 A2A join (`POST /a2a/join`)

```
external agent reads /.well-known/agent-card.json (skills, evaluators, security)
→ POST /a2a/join {pactId, agree, from}
→ joinExistingPact: fund relay wallet from agent funder → joinDraft() on-chain
→ activity logged "joined via A2A"
```

### 3.6 Persistence & restore (boot)

```
initDb → load activity(30) · names · negotiations · contracts · subjects
→ restore theater sessions + contracts into memory
→ restorePactSubjects: seed from DB, backfill subjects from stored contract prose
→ startMonitor
(no DB? warn once and run memory-only — everything on-chain still works)
```

## 4. Condition bitmap (`conditions.ts`)

| Bit | Condition | Class | Data source |
|---|---|---|---|
| 0 | AGENT_IDENTITY_A | critical | AgentRegistry `isAgentActive` |
| 1 | AGENT_IDENTITY_B | critical | AgentRegistry `isAgentActive` |
| 2 | ESCROW_HEALTHY | critical | EscrowVault position read |
| 3 | COLLATERAL_RATIO | hard | terms vs. on-chain state |
| 4 | COLLATERAL_SOFT | soft | terms vs. on-chain state |
| 5 | PAYMENT_CURRENT | hard | terms vs. on-chain state |
| 6 | YIELD_ON_TARGET | soft | terms vs. on-chain state |
| 7 | COUNTERPARTY_HEALTH | soft | terms vs. on-chain state |
| 8 | ORACLE_STABLE | soft | **live** OnchainOS/OKX BTC feed < 2 min fresh |
| 9 | LIQUIDITY_ADEQUATE | soft | **live** BTC vol24h × price > $10M |
| 10 | MILESTONES_TRACK | soft | terms vs. on-chain state |
| 11 | DEX_PRICE_TARGET | soft | **live** DEX price feed fresh (DEX pacts) |
| 12 | DEX_LIQUIDITY_TARGET | soft | **live** BTC+ETH vol24h × price > $100M (DEX pacts) |

State assessment: all healthy → ACTIVE · any soft fail → DEGRADING · hard fail → BREACHED ·
critical fail → BREACHED (CATASTROPHIC tier, straight to ARBITRATING).

## 5. Key design decisions (and why)

- **Commit-reveal votes with on-chain verification** — no mediator sees another's verdict before committing; the contract, not the agent, validates reveals.
- **Escrow drives the FSM** — `depositEscrow` sets COMMITTED/ACTIVE; the chain, not the agent, owns lifecycle progress.
- **Artifact hashing** — every AI output is SHA-256-committed to ArtifactRegistry; displayed prose is provably the AI's actual output.
- **6-attempt nonce-retry wallet wrapper** — monitor and one-shot operations share the owner wallet; retries absorb nonce races instead of losing transactions.
- **Cross-family AI fallback** — negotiator tries DeepSeek → Claude; theater assigns one family per party; a failed provider degrades the round, never the pact.
- **Memory-only graceful degradation** — no Postgres? the agent still monitors, attests and settles; only session history and subject metadata degrade.

## 6. Contract wiring (testnet)

| Contract | Constructor wiring |
|---|---|
| SynthekeContract v2 | monitor = agent wallet · registry = AgentRegistry · vault = EscrowVault v1 (identity reads) · reputation = ReputationRegistry v1 |
| EscrowVaultV2 | owner = agent wallet (agent pulls party escrow, settles verdicts) |
| MediatorVotes | mediators = [Themis, Athena, Solon] |
| MediatorStaking | slashPercent = 2000 (20%) |
| ReputationOracle v2 | monitor = agent wallet · registry fallback = ReputationRegistry v1 |
| TreasuryVault | feeAmount = 0.01 OKB |

## 7. Known architectural boundaries

See `SECURITY.md` for the threat model. Summary: the monitor agent is a single trusted operator in v1;
everything it does is verifiable on-chain; party wallets in the demo are agent-funded ephemeral wallets;
independent party signing, per-mediator operators and TEE/HSM key custody are explicit roadmap items.
