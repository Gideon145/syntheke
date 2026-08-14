# Syntheke — Demo Script

The exact shortest path to the strongest demo, on the live testnet deployment.
Every step below works right now on https://www.syntheke.xyz — nothing to install.

---

## Path A — 3-minute judge demo (recommended)

1. **Open https://www.syntheke.xyz** → click **"Create a Pact"**.
2. Type a deal between two agents, e.g.:
   `Alpha pays Beta 50 USDC weekly to keep the ETH-USDC pool liquid`
   (or click any example deal, or "⚔️ Run adversarial demo" for a hostile counterparty).
3. **Watch the negotiation theater live** — Party A (Claude) and Party B (DeepSeek) exchange
   counters in the SSE stream (pulsing ● LIVE). Each move mints an on-chain artifact hash
   (visible in the provenance panel as it happens).
4. When the pact lands on its detail page, walk:
   - the **15-stage lifecycle tracker** (DRAFT → NEGOTIATING → PROPOSED → COMMITTED → ACTIVE),
   - the **plain-English contract** written by the AI,
   - the **escrow panel** (real TestUSDC in `EscrowVaultV2`),
   - the **📈 DEX treaty** subject badge (DEX deals auto-enable live market condition bits).
5. **Open the dashboard** (https://www.syntheke.xyz/dashboard): total treaties, attestation
   counter climbing every ~75 s, treasury 0.3 OKB / 30 fees, escrow TVL, x402 payments, live
   OKX BTC/ETH prices feeding the monitor's condition bits.
6. **Verify on-chain without us:** open any transaction from the pact page's explorer links, or
   run the two cast commands below.

### Breach demo (adds 2 minutes, strongest proof of enforcement)

```bash
# soft-degrade a pact (soft conditions fail → DEGRADING)
curl -X POST https://agent-production-507e.up.railway.app/demo/degrade/<pactId>

# or force a critical breach (→ BREACHED → ARBITRATING, catastrophic skips cure)
curl -X POST https://agent-production-507e.up.railway.app/demo/breach/<pactId>
```
Then watch the pact page: three mediators commit → reveal votes on-chain → verdict → escrow
settlement → reputation outcome. The demo overrides have a 300-second window.

### Payment demo (x402)

```bash
curl -i https://agent-production-507e.up.railway.app/premium/timeline/<pactId>
# → HTTP 402 + PAYMENT-REQUIRED (1.0 TUSD9, EIP-3009)
# settle with the OnchainOS CLI, retry with PAYMENT-SIGNATURE → premium timeline unlocks
```

### Evaluator demo (paid swarm)

```bash
curl -X POST https://agent-production-507e.up.railway.app/tasks/evaluate \
  -H "Content-Type: application/json" \
  -d '{"breachTier":2,"attestationCount":10,"degradationCount":2}'
# → 402 offer → pay → paid commit-reveal verdict from Themis/Athena/Solon
```

---

## Path B — 90-second proof (no UI)

```bash
# 1. live pact state (expect state 4 = ACTIVE)
cast call 0xE17c79c138bdE2ABfAfbBd2c3bBdD5511735B6E6 \
 "getPactState(bytes32)(tuple(uint8,address,address,tuple(uint256,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,bytes32,uint256,bool,bool,bool))" \
 0xc40e519126eda06729c4a7a12879daba08aefc6368db334546c3b423c63b40fc --rpc-url https://testrpc.xlayer.tech

# 2. real escrow TVL
cast call 0x13be96c8a71628d41e80755f4027aa51a9014e08 "getTVL()(uint256)" --rpc-url https://testrpc.xlayer.tech

# 3. everything else: bash verify.sh
```

---

## Demo pitfalls to avoid

- **Breach demos expire after 300 s** — trigger, then narrate fast or re-trigger.
- The prod agent restarts on deploys; if `/status` is briefly empty, reload after ~60 s.
- Escrow amounts in new pacts are small test amounts (negotiation uses wei semantics) — lead
  with the **mechanism**, not the dollar value.
- If you create many pacts, the newest treaty is `Treaty #1` on the pacts page (newest first).
