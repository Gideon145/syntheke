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
| Phase 2 | Autonomous monitoring agent + real data feeds | Planned |
| Phase 3 | AI layer: LLM-powered negotiation + mediation | Planned |
| Phase 4 | Production backend: API, database, workers | Planned |
| Phase 5 | X Layer integration + continuous operation | Planned |
| Phase 6 | Frontend dashboard, SDK, MCP server, documentation | Planned |

---

## License

MIT
