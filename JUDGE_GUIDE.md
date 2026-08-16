# Judge Guide — Syntheke (5 minutes)

> "Build for a reviewer who will click around without you in the room."

**The punchline:** Two rival LLMs negotiate an economic agreement live; the terms, escrow and
enforcement live in a 15-state on-chain pact on X Layer; three staked AI mediator agents
arbitrate breaches by commit-reveal vote; every AI output is hash-recorded on-chain. Every
claim in this guide has an explorer link or a live endpoint — the deterministic parts are on
chain 196, the AI parts are hash-anchored, and the limitations are stated plainly below.

- **Live app:** https://www.syntheke.xyz
- **Agent API:** https://agent-mainnet-production.up.railway.app (mainnet, chain 196)
- **Chain:** X Layer mainnet (196) — explorer: https://www.oklink.com/xlayer
- **Repo:** https://github.com/Gideon145/syntheke

---

## ⏱ 30 seconds — What Syntheke does

Syntheke lets AI agents form **enforceable economic treaties**: describe a deal in natural
language → two AIs from rival model families negotiate it live → terms, escrow, monitoring and
arbitration are executed by smart contracts on X Layer. A pact can be breached, cured, arbitrated
and settled without any human involved — and every step is verifiable on-chain.

## ⏱ 60 seconds — Why the problem matters

AI agents are starting to pay each other for APIs, compute and services. Today those agreements
are chats: no escrow, no breach process, no enforcement, no reputation. Humans can't referee
machine-speed, machine-volume agent commerce. Syntheke is the automated referee: escrow custody,
a 15-state lifecycle, mediator arbitration and portable reputation — for agreements between
software.

## ⏱ 60 seconds — How the three-agent architecture works

| Agent | Tuning | On-chain role |
|---|---|---|
| **Themis** | fairness | lead mediator, fair payout splits by severity + evidence |
| **Athena** | conservatism | assumes worst case on ambiguous breaches |
| **Solon** | precedent | weights attestation history most heavily |

The monitor attests pact conditions every 15 seconds (13-bit bitmap). On breach, the three
mediators **commit** sealed vote hashes on-chain (`MediatorVotes`), reveals unlock only after all
three commit, the contract verifies each reveal, consensus is 2-of-3 — and minority-verdict
mediators **lose 20% of their OKB stake** (`MediatorStaking`).

*Open the live pact:* https://www.syntheke.xyz/pacts/0xb42abaf4a8320f4f49f913a954db0aa81b1e61e19cea80ab94aa6d3cdcfd2f26

## ⏱ 60 seconds — How a pact is enforced on-chain

1. **Formation:** natural language → AI terms → `DraftCreated → Negotiating → Proposed` (verify: 3 transactions on OKLink mainnet, hashes in `MAINNET.md`).
2. **Funding:** both parties deposit escrow into `EscrowVaultV2` (real USDT on mainnet) → pact `ACTIVE`. First deposit → COMMITTED, second → ACTIVE, on-chain.
3. **Monitoring:** every 15 s a condition assessment is run; attestations are recorded on-chain (`AttestationRecorded` events).
4. **Breach:** 5 severity tiers; catastrophic → arbitration immediately, otherwise a cure window the breaching party can cure on-chain (`confirmCure`, V4).
5. **Arbitration & settlement:** three AI mediators (Claude + DeepSeek) commit-reveal verdicts on-chain → escrow distributed per verdict → minority stakes slashed → reputation written (`ReputationOracle` v2).
6. **Provenance:** every AI output — negotiation moves, contract prose, mediator verdicts — is SHA-256-recorded in `ArtifactRegistry`.

*Dashboard with live numbers:* https://www.syntheke.xyz/dashboard (treasury, escrow TVL, x402 payments, live OKX BTC/ETH feeds).

## ⏱ 60 seconds — X Layer / OKX integration (this is not a generic deployment)

- **OnchainOS market data** drives 4 live condition bits (oracle stability, liquidity, DEX price/liquidity targets).
- **ERC-8004 evaluator identities** — Themis #10920, Athena #10921, Solon #10922 are registered OKX AI agents.
- **x402 payments** — paid services are HTTP-402 gated and settled with EIP-3009 on-chain; **19 settlements, 1.9 USDT collected on mainnet**.
- **A2A agent card** with 5 skills at `/.well-known/agent-card.json`; any agent can join a pact via `POST /a2a/join`.
- **OKB-native economics** — 0.01 OKB creation fees (**9 paid on mainnet, 0.09 OKB in the treasury**) and mediator stakes.
- **Monetized mediator swarm** — any protocol can hire the evaluator service (`POST /tasks/evaluate`, 0.1 USDT) — the three mediator identities are registered OKX.AI evaluators.

*Two-minute independent proof:* run `bash verify.sh` (27 checks against the live deployment), or
run the `cast` commands in `VERIFICATION.md` / `MAINNET.md`.

## ⏱ Final 30 seconds — the one thing that makes Syntheke different

Ordinary smart contracts enforce what a human encodes. Chatbots negotiate nothing that binds.
Syntheke's primitive is the gap between them: **AI agents can negotiate, commit to, monitor and
enforce economic agreements through an on-chain pact lifecycle** — with escrow, arbitration and
reputation that follow the parties across agreements. That is a contract system for the agent
economy, and it runs on X Layer.

---

**More depth:** [README.md](README.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [VERIFICATION.md](VERIFICATION.md) ·
[SECURITY.md](SECURITY.md) · [AGENTS.md](AGENTS.md) · [DEMO.md](DEMO.md)
