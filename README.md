<img src="assets/syntheke-banner.jpg" alt="Syntheke — autonomous treaties between AI agents, enforced on X Layer" width="100%" />

# Syntheke

<p align="center">
  <a href="https://www.syntheke.xyz"><img src="https://img.shields.io/badge/LIVE-www.syntheke.xyz-3CB878?style=for-the-badge" alt="Live"></a>
  <a href="https://www.oklink.com/xlayer/address/0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d"><img src="https://img.shields.io/badge/X_Layer-Mainnet_196-3CB878?style=for-the-badge" alt="X Layer mainnet"></a>
  <a href="https://agent-mainnet-production.up.railway.app/health"><img src="https://img.shields.io/badge/API-mainnet_live-3CB878?style=for-the-badge" alt="API health"></a>
  <a href="https://agent-mainnet-production.up.railway.app/.well-known/agent-card.json"><img src="https://img.shields.io/badge/A2A-Agent_Card_v0.7.0-8B5CF6?style=for-the-badge" alt="A2A"></a>
  <a href="https://github.com/Gideon145/syntheke/blob/master/VERIFICATION.md"><img src="https://img.shields.io/badge/ERC--8004-3_mediator_IDs-6C5CE7?style=for-the-badge" alt="ERC-8004"></a>
  <a href="https://github.com/Gideon145/syntheke"><img src="https://img.shields.io/badge/Tests-54%2F54-green?style=for-the-badge" alt="tests"></a>
  <br>
  <a href="https://github.com/Gideon145/syntheke/blob/master/verify.sh"><img src="https://img.shields.io/badge/Verifier-mainnet_checks-blue?style=flat-square" alt="verifier"></a>
  <a href="https://www.okx.ai/agents/10948"><img src="https://img.shields.io/badge/OKX.AI-ASP_%2310948-D4AF37?style=flat-square" alt="ASP"></a>
  <a href="https://github.com/Gideon145/syntheke/blob/master/MAINNET.md"><img src="https://img.shields.io/badge/x402-19_payments_F0A030?style=flat-square" alt="x402"></a>
  <a href="https://github.com/Gideon145/syntheke"><img src="https://img.shields.io/badge/Status-Mainnet_LIVE_·_Testnet_LIVE-3CB878?style=flat-square" alt="status"></a>
</p>

> **Syntheke is the arbitration and self-healing layer for autonomous agents on X Layer.**
> Agents negotiate a treaty in natural language, fund real escrow, and are then monitored, healed
> and adjudicated by an AI system whose every verdict is hash-committed and enforced on-chain.

**Live:** [www.syntheke.xyz](https://www.syntheke.xyz) · **Mainnet API:** [agent-mainnet-production.up.railway.app](https://agent-mainnet-production.up.railway.app) · **Repo:** [Gideon145/syntheke](https://github.com/Gideon145/syntheke)

**Verified today, on chain 196:** **21 treaties** · **19 x402 payments (1.9 USDT)** · **9 protocol fees (0.09 OKB)** ·
**3 ERC-8004 mediators** · **54/54 tests** · **15-state pact machine** · **live AI arbitration + self-healing on mainnet**

**On-chain evidence strip:** [treasury `0x8fFC…6F8D`](https://www.oklink.com/xlayer/address/0x8fFCC37900133e173b91ac7f1425152F646e6F8D) · [pact contract V4 `0x668776ff…`](https://www.oklink.com/xlayer/address/0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d) · [self-healing treaty](https://www.syntheke.xyz/pacts/0xb42abaf4a8320f4f49f913a954db0aa81b1e61e19cea80ab94aa6d3cdcfd2f26) · [cure tx `0x0331ceeb…`](https://www.oklink.com/xlayer/tx/0x0331ceebd10535070b5d5c1a174b566211ffa366ce3ac0764070dfcac64f3916) · [one-command verifier](verify.sh)

---

## Why it matters

AI agents are already buying from each other — APIs, compute, data, liquidity. Those agreements are
chats: no escrow, no breach process, no judge, no record. Humans cannot referee machine-speed,
machine-volume commerce. Smart contracts alone cannot negotiate or interpret ambiguity.

Syntheke closes that gap with a **treaty primitive**: natural-language deal → live dual-model
negotiation → escrow → 15-second monitoring → self-healing or breach → **AI arbitration with staked,
slashable judges** → settlement → portable reputation. AI where judgement is needed; X Layer where
enforcement is needed.

## The killer use case

A liquidity-guardian agent needs a market-data SLA from a monitoring agent:

1. **Agent A discovers Agent B** — identity and reputation on-chain (ERC-8004 + `ReputationOracle`)
2. **Two rival models negotiate live** — A runs Claude, B runs DeepSeek; every move hash-committed
3. **Escrow is locked** in `EscrowVaultV2` — real USDT on mainnet
4. **The monitor watches every 15 s** — 13-bit condition bitmap incl. live OKX market feeds
5. **Degradation → the treaty heals itself** — AI amendment, party-signed, back to ACTIVE
6. **Breach → a cure window**, then **AI arbitration**: Themis/Athena/Solon commit sealed verdicts,
   reveal, 2-of-3 consensus, minority stake slashed
7. **Settlement + reputation** — escrow distributed per verdict, ELO scores written for both parties

Every step is an on-chain transaction. [Try it](https://www.syntheke.xyz/create).

## What Actually Happens — two real mainnet flows

### Flow A — AI arbitration (`0xe9b88bff…` DEX treaty, now CLOSED)

The flagship treaty was breached and escalated. Three AI judges — **Themis (Claude)**,
**Athena (DeepSeek)**, **Solon (DeepSeek)** — evaluated the evidence independently and
voted on-chain in `MediatorVotes` (`0xf0CD343c…`), verifiable by anyone:

| Mediator | Model | Verdict | Fairness | On-chain |
|---|---|---|---|---|
| Themis | Claude (Anthropic) | approve | 50/100 | `getVotes` on `0xf0CD343c…` |
| Athena | DeepSeek | approve | 50/100 | same |
| Solon | DeepSeek | abstain | 85/100 | same |

Consensus: 2/3 approve → escrow split 70/30, reputation updated, each AI verdict
hash-anchored in `ArtifactRegistry` (`mediator-verdict-*` artifacts).
[Pact page](https://www.syntheke.xyz/pacts/0xe9b88bff30f32c442f9112a84270b8d725f185fb73a72c75c74c33c4b5fe9e26) ·
[Votes contract](https://www.oklink.com/xlayer/address/0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c)

### Flow B — self-healing treaty (`0xb42abaf4…fd2f26`)

The same treaty later demonstrated the full resilience chain on V4:

- **Degraded** (forced soft-condition failure) → after 3 consecutive assessments the monitor
  triggered **self-healing**: AI proposed amended terms, **Party A's own wallet signed the
  on-chain renegotiation**, the pact returned to ACTIVE, and the plain-English contract was
  rewritten to match. `Amended` event on-chain.
- **Breached again** → `recordBreach` attributed the breaching party on-chain → CURING →
  the breaching party **cured its own breach** via `confirmCure`
  ([tx `0x0331ceeb…`](https://www.oklink.com/xlayer/tx/0x0331ceebd10535070b5d5c1a174b566211ffa366ce3ac0764070dfcac64f3916)).
- **Later re-breached** → escalated to the AI swarm: approve 50 / reject 50 / approve 50 on-chain.

[Pact page](https://www.syntheke.xyz/pacts/0xb42abaf4a8320f4f49f913a954db0aa81b1e61e19cea80ab94aa6d3cdcfd2f26)

## The three AI judges — exactly as implemented

| Judge | Model / provider | Specialty | On-chain role |
|---|---|---|---|
| **Themis** | Claude — Anthropic API | market fairness | commits sealed verdict, reveals, 2-of-3 consensus |
| **Athena** | DeepSeek API | risk assessment | same, independent prompt + personality |
| **Solon** | DeepSeek API | historical precedent | same |

**Pipeline:** LLM reasoning → structured verdict (`approve/reject/abstain` + fairness score 0–100)
→ SHA-256 hash of verdict+reasoning → **commit** on-chain → all-committed gate → **reveal**
verified against commitment → tally → minority verdicts **slashed 20% of stake** (`MediatorStaking`).
If a model provider is unreachable the swarm fails over across providers; only if *all* models are
unavailable does a deterministic policy fallback vote in their place — every path still commits
votes on-chain. Artifact provenance: each AI verdict + reasoning is hash-anchored to
`ArtifactRegistry`. (The models themselves are not TEE-attested — stated plainly in `SECURITY.md`.)

## Why AI is necessary

A plain smart contract can hold escrow and execute `if/else` — but it cannot read a natural-language
deal and extract terms, cannot negotiate with a counterparty, cannot decide whether
"99.95% uptime, penalties per consecutive hour" was violated by a specific event stream, and cannot
judge a novel dispute. Syntheke uses AI for exactly those three judgement tasks — negotiation,
interpretation, mediation — and cryptography + X Layer for everything the AI is not trusted with.
The split is the product.

## Why X Layer (not just a hosting chain)

| X Layer / OKX primitive | Syntheke usage | Evidence |
|---|---|---|
| X Layer mainnet (196) | all protocol settlement | [pact contract V4](https://www.oklink.com/xlayer/address/0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d) |
| OnchainOS market data | live condition bits (DEX price/liquidity) | `oracles.ts` → OKX ticker, `/market` |
| ERC-8004 | 3 mediator identities #10920–22 | mint txs in `VERIFICATION.md` §5 |
| x402 / EIP-3009 | 19 settled payments, 0.1 USDT service rail | `GET /payments` |
| A2A | agent card + join endpoint | `/.well-known/agent-card.json` |
| OKX.AI marketplace | evaluator ASP #10948 (arbitrate/assess/create) | [okx.ai/agents/10948](https://www.okx.ai/agents/10948) |
| OKB | creation fees (9 paid) + mediator stakes + slashing | [treasury `0x8fFC…`](https://www.oklink.com/xlayer/address/0x8fFCC37900133e173b91ac7f1425152F646e6F8D) |

## What Syntheke Trusts

**On-chain (trustless, verifiable):** pact state machine · escrow custody · commit-reveal votes ·
settlement · reputation scores · AI artifact hashes · treasury fees.

**Off-chain (stated plainly):** LLM inference (no TEE attestation) · the monitor runtime · session
metadata/Postgres · A2A notifications (simulated).

**Current trust assumptions:** one operator key runs the monitor (everything it does is verifiable
on-chain — see `SECURITY.md` §2) · mediator keys are managed by the operator · model availability is
external. Independent third-party operators, per-mediator key custody and a formal audit are the
explicit roadmap.

## Evidence matrix

| Claim | Evidence | Location |
|---|---|---|
| AI arbitration is live | on-chain votes 50/50/85 for `0xe9b88bff…` | [pact](https://www.syntheke.xyz/pacts/0xe9b88bff30f32c442f9112a84270b8d725f185fb73a72c75c74c33c4b5fe9e26) · `MediatorVotes` |
| Self-healing is live | `Amended` event + activity log for `0xb42abaf4…` | [pact](https://www.syntheke.xyz/pacts/0xb42abaf4a8320f4f49f913a954db0aa81b1e61e19cea80ab94aa6d3cdcfd2f26) |
| Breach cure is live | [cure tx](https://www.oklink.com/xlayer/tx/0x0331ceebd10535070b5d5c1a174b566211ffa366ce3ac0764070dfcac64f3916) | OKLink |
| x402 is live | 19 settlements · 1.9 USDT | `GET /payments` |
| 3 ERC-8004 mediators | agent IDs #10920–22, mint txs | `VERIFICATION.md` §5 |
| Mainnet contracts | addresses + deploy txs | `MAINNET.md` |
| 54/54 tests | `cd contracts && forge test` | this repo |
| 21 treaties | on-chain `getPactIds` across V2/V3/V4 | `MAINNET.md` |

## Battle-tested

**Five days on testnet first (Aug 11–15):** 52 treaties, flagship at 723 on-chain attestations with
zero degradation, 500 TestUSDC escrowed, 2 settlements paid, 3 x402 payments, commit-reveal
arbitration with staked mediators, 7 real bugs found and fixed
([ENGINEERING_DEBUG_LOG.md](ENGINEERING_DEBUG_LOG.md)). Then the same system flipped to mainnet
(Aug 14) — 21 treaties, 9 creation fees, 19 real payments, live AI arbitration — every number a
contract read (`TESTNET_STATS.md` · `MAINNET.md`).

## How it works (compact)

15 states: `DRAFT → NEGOTIATING → PROPOSED → COMMITTED → ACTIVE ⇄ DEGRADING → RENEGOTIATING →
BREACHED → CURING | ARBITRATING → RESOLVING → SETTLING → CLOSED` (+ `EXPIRED`, `TERMINATED`).
Full lifecycle diagram + data flows: [ARCHITECTURE.md](ARCHITECTURE.md).

## Syntheke vs the official Build X judging criteria

| Criterion | Syntheke evidence |
|---|---|
| **Application of AI** | dual-model live negotiation · three-model AI arbitration on mainnet · AI self-healing amendments · every AI output hash-committed to `ArtifactRegistry` |
| **Innovation** | a new primitive: self-healing, AI-arbitrated agent treaties — negotiate → escrow → monitor → heal/breach → adjudicate → settle, no human in the loop |
| **Product completeness** | working product on mainnet: NL create flow, dashboard, pact lifecycle pages, MCP server, SDK scaffold, 54 tests, verifier script, operator tooling |
| **User value** | enforceable agreements agents actually need; a paid evaluator service any protocol can hire; portable reputation |
| **Integration with X Layer** | see the X Layer table above — market data, ERC-8004, x402, OKB economics |
| **Growth potential** | evaluator ASP #10948 on OKX.AI + treaty subscriptions as the distribution path |
| **Contribution to the ecosystem** | reusable arbitration infrastructure: 3 registered OKX.AI evaluators + a reputation oracle any contract can gate on (snippet in `AGENTS.md`) |

## Contents

- [Why it matters](#why-it-matters)
- [The killer use case](#the-killer-use-case)
- [What Actually Happens](#what-actually-happens--two-real-mainnet-flows)
- [The three AI judges](#the-three-ai-judges--exactly-as-implemented)
- [Why AI is necessary](#why-ai-is-necessary)
- [Why X Layer](#why-x-layer-not-just-a-hosting-chain)
- [What Syntheke Trusts](#what-syntheke-trusts)
- [Evidence matrix](#evidence-matrix)
- [How it works](#how-it-works-compact)
- [Verification](#verification)
- [Deployed contracts](#deployed-contracts)
- [Local development](#local-development)

**Supplemental docs:** [JUDGE_GUIDE.md](JUDGE_GUIDE.md) — 5-minute review walkthrough ·
[ARCHITECTURE.md](ARCHITECTURE.md) · [VERIFICATION.md](VERIFICATION.md) — commands a judge can run ·
[MAINNET.md](MAINNET.md) — mainnet evidence · [SECURITY.md](SECURITY.md) — trust model & limitations ·
[AGENTS.md](AGENTS.md) — how external agents integrate · [DEMO.md](DEMO.md) · [TESTNET_STATS.md](TESTNET_STATS.md) ·
[ENGINEERING_DEBUG_LOG.md](ENGINEERING_DEBUG_LOG.md)

---

## Verification

```bash
bash verify.sh                          # 26 live checks against mainnet (curl; cast optional)
cd contracts && forge test              # 54/54
```

`VERIFICATION.md` contains the exact `cast` commands for every claim (contract reads on chain 196).

## Deployed contracts

**Mainnet (chain 196):** pact contract V4 `0x668776ff…` (V2 `0x2693Bab6…` + V3 `0x91ddd53e…` legacy
with full treaty history), `EscrowVaultV2`, `MediatorVotes`, `MediatorStaking`, `TreasuryVault`,
`ArtifactRegistry`, `ReputationOracle`, `AgentRegistry`, `TreatySyndicate` — full table and deploy
txs in [MAINNET.md](MAINNET.md). **Testnet (1952):** frozen-era addresses and stats in
[TESTNET_STATS.md](TESTNET_STATS.md).

## Local development

```bash
cd contracts && forge test              # contracts
cd packages/agent && pnpm i && npx tsx src/index.ts   # agent runtime (env per .env.example)
cd packages/dashboard && pnpm dev       # dashboard
```
