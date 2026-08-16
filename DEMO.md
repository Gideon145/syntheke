# Syntheke — Demo Script (mainnet)

The strongest reproducible demo path, on the **live X Layer mainnet deployment**
(chain 196). Everything below is clickable right now — nothing to install.

---

## Path A — 4-minute judge demo (recommended)

1. **Open https://www.syntheke.xyz/dashboard** — start with the evidence:
   - **Protocol Treasury** panel: 9 fees · 0.09 OKB (on-chain `TreasuryVault`)
   - **x402 Payments** card: 19 settled · 1.9 USDT
   - **Total Treaties**: 70+ all-time (52 testnet + 21 mainnet, live from both agents)
   - **Escrow TVL** + live OKX BTC/ETH prices feeding the monitor's condition bits
2. **Open the self-healing treaty** — https://www.syntheke.xyz/pacts/0xb42abaf4a8320f4f49f913a954db0aa81b1e61e19cea80ab94aa6d3cdcfd2f26
   - its on-chain history contains: degradation → **AI self-heal amendment (party-signed)** →
     breach → **breaching party cured its own breach** ([tx `0x0331ceeb…`](https://www.oklink.com/xlayer/tx/0x0331ceebd10535070b5d5c1a174b566211ffa366ce3ac0764070dfcac64f3916)) →
     final dispute → **AI arbitration verdicts on-chain**.
3. **Open the AI-arbitrated DEX treaty** — https://www.syntheke.xyz/pacts/0xe9b88bff30f32c442f9112a84270b8d725f185fb73a72c75c74c33c4b5fe9e26
   (closed by the mediator swarm: Themis approve 50 · Athena approve 50 · Solon abstain 85,
   readable from `MediatorVotes` on-chain).
4. **Open the Agents page** — https://www.syntheke.xyz/agents — evaluator service card:
   `POST /tasks/evaluate · 0.1 USDT · #10920 · #10921 · #10922` + ASP #10948 link on OKX.AI.
5. **Verify independently:** run `bash verify.sh` (26 mainnet checks) or the `cast` commands
   in `VERIFICATION.md`.

### Live creation demo (if you want to watch formation, ~2 minutes)

1. https://www.syntheke.xyz/create → describe any two-agent deal.
2. Watch the negotiation theater: Party A (Claude) vs Party B (DeepSeek) exchange live counters;
   every move mints an on-chain artifact hash (provenance panel).
3. The pact lands on its detail page: 15-stage tracker, AI plain-English contract, escrow panel.
   (Creation costs a 0.01 OKB protocol fee + a 0.1 USDT x402 payment — real money on mainnet.)

### Breach / arbitration demo (adds 2 minutes)

```bash
AGENT=https://agent-mainnet-production.up.railway.app
# soft-degrade a live pact (soft conditions fail → DEGRADING → self-heal)
curl -X POST $AGENT/demo/degrade/<pactId>
# or force a critical breach (→ BREACHED → ARBITRATING → AI swarm votes)
curl -X POST $AGENT/demo/breach/<pactId>
```

Then watch the pact page: three AI mediators commit sealed verdict hashes → reveal → consensus →
escrow settlement → reputation. Demo overrides expire after 300 s.

### Payment demo (x402, real money rail)

```bash
# any gated endpoint answers HTTP 402 first:
curl -i $AGENT/premium/timeline/<pactId>
# PAYMENT-REQUIRED header carries the exact EIP-3009 authorization to sign.
```

`scripts/pact_factory.py` replays the full flow: fund a fresh payer 0.1 USDT → sign EIP-3009 →
`POST /pacts/create` with `PAYMENT-SIGNATURE` → on-chain settlement. 19 such settlements are
live on mainnet (1.9 USDT collected).

---

## Path B — 90-second elevator demo

The self-healing treaty page IS the demo: one pact whose on-chain history shows
degradation → AI amendment → cure → AI arbitration. One page, every stage clickable
to OKLink, zero setup.

## The three things to leave the judge with

1. **The AI does real work** — negotiation, amendment proposals and dispute verdicts are live
   LLM outputs, hash-committed on-chain.
2. **The chain enforces** — escrow, votes, slashing, settlement, reputation: all contract reads.
3. **They can verify it themselves** — `verify.sh` + `VERIFICATION.md` + explorer links everywhere.
