<p align="center">
  <h1 align="center">🏛️ Syntheke</h1>
  <p align="center"><em>συνθήκη — treaty, covenant, binding agreement</em></p>
</p>

<p align="center">
  <strong>Autonomous economic treaties between AI agents, on X Layer.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Solidity-0.8.28-363636?style=flat-square&logo=solidity" />
  <img src="https://img.shields.io/badge/Foundry-32_tests-green?style=flat-square" />
  <img src="https://img.shields.io/badge/X_Layer-Native-836EF9?style=flat-square" />
</p>

---

## Status — Phase 1 Complete ✅

**Phase 1 delivers the on-chain protocol core**: four Solidity contracts implementing the complete Syntheke state machine, agent identity registry, escrow custody, and reputation scoring — all deployed on X Layer.

Future phases will add the autonomous monitoring agent, AI mediation, production backend, and frontend dashboard.

---

## What Phase 1 Implements

### Smart Contracts (Solidity 0.8.28, Foundry)

| Contract | Purpose | Lines | Tests |
|----------|---------|-------|-------|
| `SynthekeContract` | 15-state pact lifecycle engine | ~380 | 15 |
| `AgentRegistry` | On-chain agent identity and capability registry (ERC-8004 compatible) | ~160 | 5 |
| `EscrowVault` | Escrow custody with ReentrancyGuard, pull-over-push withdrawals | ~210 | 4 |
| `ReputationRegistry` | ELO-based reputation scoring (0–10000) with time decay and Sybil resistance | ~200 | 8 |

### The 15-State Pact Lifecycle

```
DRAFT → NEGOTIATING → PROPOSED → COMMITTED → ACTIVE
  ⇄ DEGRADING ⇄ RENEGOTIATING
  → BREACHED → CURING | ARBITRATING
  → RESOLVING → SETTLING → CLOSED
EXPIRED · TERMINATED
```

Every state transition is enforced on-chain with access control modifiers. A monitor agent records attestations on each monitoring cycle. Breaches are classified into 4 tiers (MINOR → CATASTROPHIC) with automatic escalation.

### Identity

Agents register via `AgentRegistry` with an ERC-8004 token ID and capability declarations. Agents can be suspended, reactivated, and discovered by capability.

### Escrow

The `EscrowVault` holds pact funds in custody. Only `SynthekeContract` can instruct deposits, releases, refunds, or slashing. Pull-over-push pattern prevents reentrancy.

### Reputation

Agents earn ELO-based reputation from completed pacts (0–10000, neutral = 5000). Breaches penalize 2× harder than completions reward. Scores decay toward neutral over inactivity. Rapid pacts with the same counterparty are detected and weighted down.

---

## Verified Functionality (32/32 Tests Passing)

- ✅ Pact creation: draft → join → negotiate → propose → commit → activate
- ✅ Full degradation → renegotiation → recovery cycle
- ✅ Breach detection: MINOR → CURING, CATASTROPHIC → ARBITRATING
- ✅ Dispute resolution → settlement → closure
- ✅ Mutual termination and expiry paths
- ✅ Access control: only party, only monitor, not monitor rejected
- ✅ Agent registration, capability updates, suspend/reactivate
- ✅ Reputation: score bounds [0, 10000], breach penalty > completion reward, rapid-pact Sybil detection

---

## Repository Structure

```
syntheke/
├── contracts/
│   ├── src/                      # Solidity contracts
│   │   ├── SynthekeContract.sol
│   │   ├── AgentRegistry.sol
│   │   ├── EscrowVault.sol
│   │   └── ReputationRegistry.sol
│   ├── test/                     # Foundry tests (32 tests)
│   ├── script/DeployAll.s.sol    # Full protocol deployment
│   └── foundry.toml              # X Layer + Anvil config
├── packages/
│   ├── backend/                  # API scaffold (Express + Drizzle + PostgreSQL)
│   └── indexer/                  # Blockchain event indexer scaffold
├── docker/compose.yml            # PostgreSQL + Redis + Anvil
├── .github/workflows/ci.yml      # Forge build + test CI
└── .env.example                  # Environment template
```

---

## Quick Start

```bash
# Prerequisites: Foundry, Docker

git clone <repo>

# Start local blockchain + database
docker compose -f docker/compose.yml up -d

# Build & test contracts
cd contracts
forge build
forge test -vvv

# Deploy to local Anvil
forge script script/DeployAll.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Deploy to X Layer Testnet

```bash
cp .env.example .env
# Fill in PRIVATE_KEY and XLAYER_RPC_URL in .env

cd contracts
forge script script/DeployAll.s.sol --rpc-url xlayer_testnet --broadcast --verify
```

---

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Core contracts: state machine, identity, escrow, reputation | ✅ Complete |
| **Phase 2** | Autonomous monitor agent: 15s cycles, breach escalation, mediator staking (slashable), self-healing renegotiation | ✅ Live on testnet |
| **Phase 3** | AI layer: dual-model swarm (Claude + DeepSeek), live negotiation theater, plain-English contracts, MCP server | ✅ Live on testnet |
| **Phase 4** | Portable ReputationOracle v2 (ELO + tiers + compliance) written at settlement | ✅ Live on testnet |
| **Phase 5** | N-party treaty syndicates (stake-weighted agent DAO, slashing → reputation) | ✅ Live on testnet |
| Phase 6 | X Layer mainnet deployment | 🔜 ~Aug 16 |
| Phase 7 | Demo video, X post, submission | 🔜 Before Aug 21 |

---

## Portable Reputation Oracle (v2)

Syntheke publishes **portable agent reputation** on X Layer. When a treaty settles,
the monitor agent records the outcome for both parties on-chain — `COMPLETED`,
`BREACHED`, or `TERMINATED` — into `ReputationOracle`
(`0xfd61828f15fc98e1dcfe0dd6498abee6e003c1cf` on testnet).

Every agent gets:

- **ELO score** (0–10000, neutral 5000) — completions weighted by settlement fairness
- **Tier** — `ELITE` / `TRUSTED` / `RELIABLE` / `NEUTRAL` / `CAUTIOUS` / `RISKY` / `UNRATED`
- **Compliance rate** — completed ÷ settled, in basis points
- **Full settlement history** — immutable on-chain

Any protocol on X Layer can underwrite counterparty risk for free:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IReputationOracle {
    function getReputation(address agent) external view returns (
        uint256 score, uint8 tier, uint256 pactCount,
        uint256 completedCount, uint256 breachedCount,
        uint256 terminatedCount, uint256 complianceBps, uint256 lastUpdated
    );
    function isReputable(address agent, uint256 minScore) external view returns (bool);
}

contract LendingProtocol {
    IReputationOracle public constant SYNTHEKE =
        IReputationOracle(0xfd61828f15fc98e1dcfe0dd6498abee6e003c1cf);

    function acceptAgent(address agent) external view returns (bool) {
        // Reject agents with a history of breached treaties
        return SYNTHEKE.isReputable(agent, 6000);
    }
}
```

Read the live oracle from the agent API: `GET /reputation?agent=0x...`
(or `GET /reputation` for all known agents), or via the Syntheke MCP server
(`agent_reputation` tool).

---

## N-Party Treaty Syndicates

Beyond bilateral treaties, agents can form **syndicates** — a mini agent-DAO on
X Layer (`TreatySyndicate` at `0xc8665453576bdba28aa72abb12152fed639cff12`).
Up to 10 agents pool escrow into a shared treaty and govern it with
stake-weighted votes:

- **RENEGOTIATE** the charter — executes at > 50% of pooled stake
- **SETTLE** — distribute escrow per an agreed split, dissolving the syndicate
- **BREACH declaration** — executes at ≥ 66%: slashes the target's stake,
  redistributes it to loyal members, **and records a `BREACHED` outcome in the
  ReputationOracle**, so syndicate verdicts degrade portable reputation

Live demo: `POST /syndicates/demo` on the agent API — three mediator agents
form a syndicate, amend the charter by vote, then slash a member for a wrong
verdict (visible on-chain and in the reputation oracle).

---

## 📓 Development Log

> **The ship's book.** Every batch, every deploy, every on-chain artifact gets
> recorded here the moment it happens. The final README (documentation refresh)
> will be rewritten from this log at the end — so nothing is ever lost.

### Batch 1 — Escrow, Identity, Persistence (Aug 14 2026)

**Commit:** `936faf6` — "Escrow settlement, agent identity registration, state persistence"

**Feature 1 — Real escrow (EscrowVaultV2 + TestUSDC)**
- Old `EscrowVault` v1 was locked to `onlySyntheke` with a set-once owner → unusable for the agent. Built owner-based `EscrowVaultV2` instead.
- Contracts deployed on X Layer testnet (chain 1952):
  - `EscrowVaultV2` → `0x13be96c8a71628d41e80755f4027aa51a9014e08` — owner-pulled custody (`deposit` pulls `transferFrom` from each party via approval), `settle` (A+B == total), `slash`, `refundBoth`, `getPactIds()`, `getTVL()`, `settledCount`, `setOwner`.
  - `TestUSDC` → `0xfc8423bf39a5be5c38961ae83ef56e0f680374aa` — 6-decimal mock USDC, public `mint`.
- Agent wiring: `src/escrow.ts` — `depositEscrowReal`, `settleEscrow`, `toUSDCUnits`, `sendOwnerTx` (6-retry nonce wrapper — critical because monitor and escrow share the owner wallet).
- Flow: `create-pact.ts` step 8.5 deposits both parties' escrow into the vault after flag deposits; `monitor.ts` `handleArbitration` Step 4 settles the vault with the computed payout split.
- Verified end-to-end: pact `0x37a30bcc...10d31a5` → 50.0 + 50.0 TestUSDC locked → demo breach → CLOSED state 12 → `settled=true`, `settledCount=1`, TVL 0, 50/50 paid out.
- Frontend: dashboard "Escrow TVL" metric card + pact page escrow panel (EscrowVaultV2, ✓ Settled/Locked badge, A/B/Total grid). Verified live on www.syntheke.xyz.

**Feature 2 — ERC-8004 mediator registration (real OKX marketplace)**
- Registered all three mediators as **Evaluator** identities on the OKX AI Agent marketplace, X Layer mainnet (chainIndex 196). One evaluator per wallet → created 3 OKX Agentic Wallet accounts under opukemegideon@gmail.com.
  - Themis → agent #10920, owner `0x53d724e6acd672ba08133bcd32b0412500bea79d`, tx `0x1ff133fbb7c41d19ec7917908c143078f60b5cfc24287ef50caa647fcde9e02f`
  - Athena → agent #10921, owner `0x6f6ec7ce8f915702888fffec75f0ccfb119969ba`, tx `0x22c532a7a9116bd7a546a7ffc8711b33024c0bbcf9b92c4728cef3ba67f347b5`
  - Solon → agent #10922, owner `0x8aeb89e6435fb92ba208683ab340bc3558edf1cb`, tx `0xd5c5d4c25e5af8b0735fbcd978700c99ff54afa5858a492b07fd97eff198cb46`
- OKX covers registration fees. Identity owners are the OKX custodial accounts (private keys can't be imported into the OKX wallet), while on-chain voting signatures still come from the mediator signer wallets (`0x3208…` / `0xf19a…` / `0x435d…`).
- CLI quirks solved: v4.2.4→4.4.10 upgrade locked-binary workaround (`onchainos.old.exe` + `onchainos.tmp` → `onchainos.exe`); deprecated skills removed.

**Feature 3 — Postgres persistence (Railway)**
- `src/db.ts`: lazy `pg` pool, graceful memory-only fallback. Tables: `syntheke_activity`, `syntheke_negotiations`, `syntheke_contracts`, `syntheke_pact_names`.
- Wired: `logActivity` → `saveActivity`, `setPactName` → `savePactName`, theater `push()` → `saveNegotiation`, `storeContract` → `saveContract`. Boot-time `restorePersistedState()` reloads activity ring, pact names, theater sessions, contracts.
- ESM pitfall fixed: `require("pg")` fails under `"type":"module"` → switched to `createRequire(import.meta.url)`.
- Railway: added Postgres plugin, linked `DATABASE_URL=${{Postgres.DATABASE_URL}}` to the `agent` service.
- Verified on prod: redeployed agent → new container restored `activity=30` from Postgres (`event="state_restored" activity=30`).

**Deploys:** Railway `agent-production-507e.up.railway.app` (new deployment ID `1d3a4e81-f8d4-402f-b77d-02270bf4f8b6`), Vercel `www.syntheke.xyz` (prod build `syntheke-hsww8tivg-ogxyz.vercel.app`). Monitor loop auto-restarted (`already_running`).

### Batch 2 — Payments, Vote Verification, Feedback (Aug 14 2026)

**Commit:** `…` — "Agent payments and on-chain mediator verification"

**Feature 4 — OKX Agent Payments (x402)**
- New contract `TestUSDC3009` → `0x9436031671c96726126fad7E72AAfB4e9ed2A92b` — mock USDC with **EIP-3009 transfer-with-authorization** (EIP-712 domain `TestUSD3009` v2), so payers sign off-chain and the server settles on-chain. 2 new Forge tests (auth + replay rejection).
- New module `src/x402.ts` (server side of the protocol): premium endpoints answer **HTTP 402** with a base64 `PAYMENT-REQUIRED` header (x402 v2 offer: scheme `exact`, network `eip155:1952`, `payTo` = agent wallet). On replay with `PAYMENT-SIGNATURE`, the server recovers the EIP-712 signer, verifies amount ≥ price, and submits `transferWithAuthorization` as relayer → treasury. Responds 200 with base64 `PAYMENT-RESPONSE` header.
- New endpoint `GET /premium/timeline/:pactId` — paid full attestation history + theater transcript; `GET /payments` — payment stats.
- **Verified end-to-end with the real OKX CLI**: captured 402 → `onchainos payment pay-local` (payer `0xeccf…4985`) signed the EIP-3009 authorization → replay returned `HTTP 200`, settlement tx `0x170a061d…`, treasury +1.0 TUSD9, payer −1.0. The OKX CLI accepted our offer as-is — real interop.
- Debug notes: forge-artifact ABIs must be stripped to the bare `abi` array for ethers; CLI `pay-local` needs `EVM_PRIVATE_KEY` in `~/.onchainos/.env` and the offer must include `payTo`; CLI returns one 65-byte signature (split r/s/v server-side).
- Frontend: pact page "Premium Timeline" card — idle → locked (shows the decoded 402 offer: scheme/network/asset/price) → unlocked.

**Feature 5 — On-chain mediator vote verification (commit-reveal)**
- New contract `MediatorVotes` → `0x921691a7151ab1478045096B9a3ecE25C51A9D43` — Themis/Athena/Solon registered as mediators. `commitVote(pactId, keccak256(verdict, fairnessScore, reasonHash, nonce))` first; reveals are **locked until all 3 mediators commit**; `revealVote` verifies the hash on-chain (mismatch reverts) and stores the verdict. `getVotes`/`tally` for public verification. 7 new Forge tests (gate, mismatch, replay, permissions) — suite now 39/39.
- `src/vote.ts` rewritten to the two-phase flow (commit → reveal), then reads the revealed votes back **from the chain** as source of truth. New endpoint `GET /votes/:pactId`.
- **Verified in real arbitration**: pact `0x61317d82…` closed (state 12) with on-chain votes Themis approve 35 · Athena reject 40 · Solon approve 70 — all commits landed before any reveal (contract-enforced).
- Frontend: "Mediator Votes — Commit-Reveal" panel — per-mediator ✓ committed / ✓ revealed + commitment hash + verdict/fairness list.

**Feature 6 — ERC-8004 feedback dual-write**
- `src/feedback.ts`: after every settlement, queues OKX-style star reviews (0–5, derived from the verdict: winning party high, breaching party low) with the registered evaluator identity (Themis #10920) as creator. Persisted in Postgres (`syntheke_feedback_queue`) + in-memory mirror; `GET /feedback/pending` and `POST /feedback/acked` endpoints.
- Bridge runner `scripts/feedback_sync.ts`: pulls pending reviews and submits them through the OKX marketplace (`onchainos agent feedback-submit`). OKX requires a task id, so full submission activates when A2A marketplace join lands (Batch 4); until then reviews stay queued and visible on the dashboard (dual-write infrastructure ready, both registries update together once live).
- **Verified**: closed pact queued 2 reviews (4.5/5 and 0.5/5) — visible via API + frontend "⭐ OKX marketplace feedback queued" badge.
- Frontend: dashboard metric cards "x402 Payments" + "OKX Feedback Queue".

**Deploys:** Railway `agent-production-507e.up.railway.app` (deployment `80f1f571-b2b0-4164-83fe-4319fd99b992`), Vercel `www.syntheke.xyz` (build `syntheke-fy1i7peww-ogxyz.vercel.app`). Prod verified: 402 challenge on the premium endpoint, `/payments`, `/votes` (3 commits round-complete), commit-reveal ran inside a real prod arbitration (pact `0x337ba81e…` → CLOSED with on-chain votes; feedback queued by the instance that won the settle race). Lesson logged: only ONE monitor instance may run against the same owner wallet — local dev agent must be stopped while prod is live.

---

## License

MIT
