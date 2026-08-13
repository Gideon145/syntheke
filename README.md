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
X Layer (`TreatySyndicate` at `0xdd615c92a588ac67d209bf21e08b8ef1537922cd`).
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

## License

MIT
