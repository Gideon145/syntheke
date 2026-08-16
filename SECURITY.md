# Syntheke — Security Model & Honest Limits

Syntheke publishes its trust assumptions because a protocol that hides them deserves none.
This document classifies every part of the system into **live / experimental / planned** and
states exactly what is enforced by the chain versus what is operated off-chain.

---

## 1. What is enforced ON-CHAIN (trustless, verifiable)

| Concern | Enforcement |
|---|---|
| Pact state machine | `SynthekeContract` — 15 states, transitions only by the contract's own rules |
| Escrow custody | `EscrowVaultV2` — deposits pulled from parties, `settle()` requires A + B = total, reentrancy-guarded |
| Vote integrity | `MediatorVotes` — reveals unlocked only after all commits; contract verifies commitment hashes; fairness ≤ 100 |
| Mediator incentives | `MediatorStaking` — 20% of minority-verdict stakes slashed to the majority |
| AI provenance | `ArtifactRegistry` — SHA-256 of every AI output, immutable per pact |
| Reputation | `ReputationOracle` v2 — K=32 outcomes from settlement, 7 tiers |
| Protocol revenue | `TreasuryVault` — 0.01 OKB per creation, on-chain accounting |

## 2. What is TRUSTED (operated off-chain, v1)

| Component | What it can do | Why we accept it today |
|---|---|---|
| **Monitor agent** (single operator key) | attests conditions, escalates breaches, settles escrow, writes artifacts/reputation | every action is an on-chain tx that anyone can audit; wrong attestations are visible forever |
| **Mediator keys** | commit/reveal votes | minority slashing aligns incentives; keys held by the same operator in v1 |
| **Party wallets (demo)** | funded ephemeral wallets controlled by the agent | one-click demo; independent parties can use `joinDraft`/`depositEscrow` themselves |
| **AI inference** (Anthropic/DeepSeek APIs) | produces negotiation, prose, monitoring judgements | outputs are hash-committed on-chain — provenance, not correctness |

## 3. Threat model (v1)

| Threat | Mitigation now | Planned |
|---|---|---|
| Monitor key compromise | operator key rotation (`setMonitorAgent`, `setOwner`); all history on-chain | HSM/TEE-backed signing (`signer.ts` documents the path) |
| Mediator collusion | commit-reveal prevents ex-ante coordination; 2-of-3 threshold; stake slashing | independent operators per mediator |
| Breach-clock gaming | cure deadline set once on-chain (Batch 5 fix); post-deadline healing blocked | — |
| Escrow theft | vault is reentrancy-guarded; settlements must equal deposits; owner-only | timelocks + multisig ownership |
| AI hallucination / bad terms | zod-validated schemas, 0.7 confidence gate, cross-family fallback, human-readable contract | on-chain terms-vs-prose verification tooling |
| Sybil reputation farming | outcomes only written from settled pacts; K=32 with decay fallback in v1 registry | identity-gated reputation |
| Front-running of arbitration | commitments sealed before reveals | — |

## 4. Live / experimental / planned — the full inventory

**Fully live (testnet AND mainnet, verifiable):** NL pact creation · dual-LLM negotiation with
artifact provenance · plain-English contracts · 15-state FSM with correct cure semantics · real
escrow + settlement · commit-reveal arbitration with live AI mediator verdicts + stake slashing ·
reputation oracle · x402 premium + evaluator service (EIP-3009) · A2A agent card + join · live
OnchainOS conditions · OKB treasury · Postgres persistence · dashboard · MCP server · 54 Forge
tests. Mainnet (chain 196) since Aug 14 — V4 pact contract `0x668776ff…`, 3 evaluator ERC-8004
identities (#10920–22), ASP #10948 registered.

**Experimental (works, with stated caveats):**
- Mediator verdicts come from the three-model AI swarm with a deterministic policy fallback
  when the models are unreachable (`vote.ts`); both paths are committed on-chain.
- A2A push notifications are simulated; the A2A join is a real tx.
- On-chain `AgentRegistry` registration is simplified (ERC-8004 `ownerOf` check commented out).
- OKX marketplace feedback awaits A2A task ids for full submission.

**Planned (explicitly not yet live):**
- Independent third-party operator key custody, per-mediator operators, TEE/HSM key custody.
- Multi-round arbitration, formal third-party audit.

## 5. Known limitations

1. **Single-operator trust** — the monitor is one key in v1 (see §2).
2. **Mock assets** — TestUSDC/TestUSDC3009 are testnet tokens; real-asset flows require mainnet.
3. **One voting round per pact** in `MediatorVotes`.
4. **No formal audit yet** — CI runs `forge test` + `forge fmt`; an audit is a mainnet prerequisite.
5. **Breach attribution** — `recordBreach` names the breaching party on-chain (V4), enabling the
   real `CURING → confirmCure → ACTIVE` path; attribution heuristics are monitor-side.
6. **Natural-language ambiguity** — the AI can misread amounts/units from NL; the generated
   contract is human-readable precisely so this stays inspectable.
