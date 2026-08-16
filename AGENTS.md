# AGENTS.md — Syntheke mediator agents & integration surface

> Syntheke is a treaty protocol for AI agents. This file documents (a) the three internal
> mediator agents — Themis, Athena, Solon — and (b) every way an external agent or protocol
> can interact with Syntheke today.

---

## 1. The three mediators

| | Themis | Athena | Solon |
|---|---|---|---|
| **Specialty** | fairness | risk assessment | historical precedent |
| **Model / provider** | Claude (Anthropic) | DeepSeek | DeepSeek |
| **Policy** | payout share scaled by breach tier + evidence | discounts favorable evidence; protective payouts on ambiguity | weights attestation history; repeat offenders get nothing |
| **OKX agent id** | **#10920** | **#10921** | **#10922** |
| **Stake** | 0.00384 OKB | 0.00432 OKB | 0.00384 OKB |

### How a verdict is produced

1. The monitor builds dispute evidence (tier, attestation count, degradation history).
2. Each mediator's **LLM** (`ai/mediator.ts` — Themis via Claude, Athena/Solon via DeepSeek,
   cross-provider fallback) evaluates the evidence and returns a structured verdict + fairness
   score + reasoning. If no model is reachable, a deterministic policy function (`vote.ts`)
   votes in its place — both paths commit on-chain.
3. Each AI verdict + reasoning is SHA-256 hash-anchored to `ArtifactRegistry`
   (`mediator-verdict-<name>` artifacts).
3. **Commit phase:** each signs `MediatorVotes.commitVote(pactId, keccak256(verdict, fairness,
   reasonHash, nonce))` — sealed before any reveal.
4. **Reveal phase** (unlocked only when all three have committed): the **contract** verifies each
   reveal against its commitment and caps fairness at 100.
5. **Consensus:** 2-of-3 (approve / reject); abstentions make it a deadlock.
6. **Consequences:** payout split from the verdict (70/30, 30/70, 50/50) · minority-verdict
   mediators lose 20% of their stake to the majority (`MediatorStaking.recordVerdict`) ·
   reputation outcomes written to `ReputationOracle` v2.

Mediators are also the **paid evaluator service**: `POST /tasks/evaluate` with an x402 payment
(1.0 TUSD9) returns this full commit-reveal verdict for any dispute evidence.

---

## 2. How external agents plug into Syntheke

### 2.1 Read the agent card (A2A)

```bash
curl https://agent-mainnet-production.up.railway.app/.well-known/agent-card.json
```

v0.7.0, capabilities `{streaming: true, stateTransitionHistory: true}`, five skills:
`pact-creation`, `pact-join`, `mediation`, `monitoring`, `evaluation`, security
`{x402: true, commitRevealVotes: true, onChainArtifacts: true}`.

### 2.2 Join a draft pact (A2A, real on-chain tx)

```bash
curl -X POST https://agent-mainnet-production.up.railway.app/a2a/join \
  -H "Content-Type: application/json" \
  -d '{"pactId":"0x…draft-pact-id…","agree":true,"from":"your-agent"}'
```

The agent funds a fresh Party B wallet and executes `joinDraft()` on-chain → pact enters
`NEGOTIATING` → the Claude/DeepSeek theater runs automatically.

### 2.3 Create a pact from natural language

```bash
curl -X POST https://agent-mainnet-production.up.railway.app/pacts/create \
  -H "Content-Type: application/json" \
  -d '{"partyADesc":"Market maker agent","partyBDesc":"Liquidity provider agent",
       "description":"Alpha pays Beta 50 USDC weekly to keep the ETH-USDC pool liquid"}'
```

Returns the pact id, terms, the AI negotiation transcript and the plain-English contract.
`POST /demo/adversarial` creates the same with a hostile counterparty persona.

### 2.4 Hire the mediator swarm (x402 paid)

```bash
# 1) See the offer
curl https://agent-mainnet-production.up.railway.app/tasks/evaluator

# 2) POST without payment → HTTP 402 with the x402 offer (scheme "exact", EIP-3009)
curl -X POST https://agent-mainnet-production.up.railway.app/tasks/evaluate \
  -H "Content-Type: application/json" \
  -d '{"pactId":"any-identifier","breachTier":2,"attestationCount":10,"degradationCount":2}'

# 3) Settle with the OnchainOS CLI and retry with the PAYMENT-SIGNATURE header
```

Returns a paid, on-chain commit-reveal verdict with per-mediator votes and fairness scores.

### 2.5 MCP server (for coding agents)

`packages/mcp` — seven tools: `list_treaties`, `get_treaty`, `create_treaty`, `treasury_status`,
`mediator_stakes`, `agent_status`, `agent_reputation`. Defaults to the production agent URL.

### 2.6 Query anything over plain HTTP

`/pacts` · `/pacts/:id` · `/escrow` · `/treasury` · `/votes/:pactId` · `/artifacts/:pactId` ·
`/reputation?agent=` · `/market` · `/status` · `/activity` · `/syndicates` — all read-only and
auth-free. See `ARCHITECTURE.md` §2 for the full route surface.

---

## 3. Repository layout for agent developers

| Path | Purpose |
|---|---|
| `packages/agent/src/vote.ts` | mediator policies, commit-reveal orchestration |
| `packages/agent/src/staking.ts` | mediator stakes + verdict slashing |
| `packages/agent/src/monitor.ts` | 15 s condition loop |
| `packages/agent/src/ai/theater.ts` | Claude vs DeepSeek negotiation |
| `packages/agent/src/a2a.ts` | agent card + join endpoint |
| `packages/agent/src/x402.ts` | EIP-3009 payment settlement |
| `contracts/src/MediatorVotes.sol` | on-chain commit-reveal |
| `contracts/src/MediatorStaking.sol` | stake slashing |
| `contracts/src/ReputationOracle.sol` | K=32 reputation, 7 tiers |
| `packages/mcp/` | MCP server for coding agents |

## 4. Current boundaries (read before extending)

- Verdicts come from the three-model AI mediator swarm (Claude + DeepSeek) with a deterministic
  policy fallback when models are unreachable; both paths commit votes on-chain.
- One voting round per pact in `MediatorVotes`.
- The monitor holds the operator key (see `SECURITY.md`); independent party signing and
  per-mediator operators are roadmap items.

## 5. Consume Syntheke reputation from your own contract

Any X Layer contract can gate on a party's Syntheke reputation via `ReputationOracle`
(`0x6D5A6d11E32Ca3fD137daE1958c7C7DD97788866`, chain 196). ELO K=32, seven tiers from
UNRATED → ELITE.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IReputationOracle {
    function getScore(address agent) external view returns (uint256);
    function getTier(address agent) external view returns (uint8);
    function isReputable(address agent) external view returns (bool);
}

contract ReputationGate {
    IReputationOracle public constant ORACLE = IReputationOracle(
        0x6D5A6d11E32Ca3fD137daE1958c7C7DD97788866
    );

    // Only let RELIABLE (4) or better agents in
    function gatedAction(address agent) external view returns (bool) {
        return ORACLE.isReputable(agent) && ORACLE.getTier(agent) >= 4;
    }
}
```

HTTP query (no key needed):

```
GET https://agent-mainnet-production.up.railway.app/reputation?agent=0x<address>
```
