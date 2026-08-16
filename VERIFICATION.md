# Syntheke — Verification Guide

Everything in the Syntheke submission can be checked independently. No API keys, no accounts,
no trusting our dashboard. This file is the exact path: **README → explorer → contract →
transaction → event → result**.

- **Network:** X Layer **mainnet**, chain id **196**, RPC `https://rpc.xlayer.tech`
- **Explorer:** https://www.oklink.com/xlayer (addresses and transactions)
- **Mainnet evidence + deploy txs:** [MAINNET.md](MAINNET.md)
- **Testnet-era stats:** [TESTNET_STATS.md](TESTNET_STATS.md) (testnet: chain 1952)

## 0. One-shot verifier

```bash
git clone https://github.com/Gideon145/syntheke && cd syntheke
bash verify.sh            # 26 checks against the LIVE mainnet deployment + on-chain state
cd contracts && forge test   # 54/54
```

## 1. Mainnet contracts (chain 196 — the live submission)

| Contract | Address | Explorer |
|---|---|---|
| SynthekeContract **V4** (current) | `0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d` | [link](https://www.oklink.com/xlayer/address/0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d) |
| SynthekeContract V3 / V2 (legacy history) | `0x91ddd53e…` / `0x2693Bab6…` | [MAINNET.md](MAINNET.md) |
| EscrowVaultV2 | `0xAa2821e2aC393c9258FeC9dD3614358Db0f2994f` | [link](https://www.oklink.com/xlayer/address/0xAa2821e2aC393c9258FeC9dD3614358Db0f2994f) |
| MediatorVotes | `0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c` | [link](https://www.oklink.com/xlayer/address/0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c) |
| MediatorStaking | `0x1eB320CC08DD481559174d073C12106F8Dc52082` | [link](https://www.oklink.com/xlayer/address/0x1eB320CC08DD481559174d073C12106F8Dc52082) |
| TreasuryVault | `0x8fFCC37900133e173b91ac7f1425152F646e6F8D` | [link](https://www.oklink.com/xlayer/address/0x8fFCC37900133e173b91ac7f1425152F646e6F8D) |
| ArtifactRegistry | `0x00cdEF3FF818Eb4CE9a9fd529E6aF6f4efEa24e9` | [link](https://www.oklink.com/xlayer/address/0x00cdEF3FF818Eb4CE9a9fd529E6aF6f4efEa24e9) |
| ReputationOracle / Registry | `0x6D5A6d11…` / `0x01C9E7f8…` | [MAINNET.md](MAINNET.md) |
| AgentRegistry / TreatySyndicate | `0xc6cfFA52…` / `0x2D22A051…` | [MAINNET.md](MAINNET.md) |

**Cast checks (any judge, 60 seconds):**

```bash
RPC=https://rpc.xlayer.tech
# 9 creation fees collected, 0.09 OKB held
cast call 0x8fFCC37900133e173b91ac7f1425152F646e6F8D "feeCount()(uint256)" --rpc-url $RPC
cast call 0x8fFCC37900133e173b91ac7f1425152F646e6F8D "balance()(uint256)" --rpc-url $RPC
# AI arbitration votes for the DEX flagship treaty
cast call 0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c \
  "getVotes(bytes32)((address,string,uint256,bytes32,bool)[])" \
  0xe9b88bff30f32c442f9112a84270b8d725f185fb73a72c75c74c33c4b5fe9e26 --rpc-url $RPC
# Self-healing treaty state (V4): cured breach, later arbitrated, closed
cast call 0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d \
  "getPactState(bytes32)((uint8,address,address,(uint256,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,bytes32,uint256,bool,bool,bool,address))" \
  0xb42abaf4a8320f4f49f913a954db0aa81b1e61e19cea80ab94aa6d3cdcfd2f26 --rpc-url $RPC
```

## 1b. Testnet-era contract addresses (chain 1952 — historical)

| Contract | Address | Testnet explorer |
|---|---|---|
| SynthekeContract v2 (pact FSM) | `0xE17c79c138bdE2ABfAfbBd2c3bBdD5511735B6E6` | [link](https://www.oklink.com/x-layer-testnet/address/0xE17c79c138bdE2ABfAfbBd2c3bBdD5511735B6E6) |
| EscrowVaultV2 (custody) | `0x13be96c8a71628d41e80755f4027aa51a9014e08` | [link](https://www.oklink.com/x-layer-testnet/address/0x13be96c8a71628d41e80755f4027aa51a9014e08) |
| MediatorVotes (commit-reveal) | `0x921691a7151ab1478045096B9a3ecE25C51A9D43` | [link](https://www.oklink.com/x-layer-testnet/address/0x921691a7151ab1478045096B9a3ecE25C51A9D43) |
| MediatorStaking | `0xc3387efd100cc22b94ad7f68b55039daf0cf9caa` | [link](https://www.oklink.com/x-layer-testnet/address/0xc3387efd100cc22b94ad7f68b55039daf0cf9caa) |
| ArtifactRegistry (AI provenance) | `0x1c36bf1B975448BbABa9E9d3be828b45e3c466cb` | [link](https://www.oklink.com/x-layer-testnet/address/0x1c36bf1B975448BbABa9E9d3be828b45e3c466cb) |
| ReputationOracle v2 | `0xfd61828f15fc98e1dcfe0dd6498abee6e003c1cf` | [link](https://www.oklink.com/x-layer-testnet/address/0xfd61828f15fc98e1dcfe0dd6498abee6e003c1cf) |
| ReputationRegistry v1 | `0x4256e57592aCB2120EAbC7f3E1eb82d9DddB855f` | [link](https://www.oklink.com/x-layer-testnet/address/0x4256e57592aCB2120EAbC7f3E1eb82d9DddB855f) |
| TreasuryVault | `0xe23721edbf637e080a2ec70d89faa2f5956943d7` | [link](https://www.oklink.com/x-layer-testnet/address/0xe23721edbf637e080a2ec70d89faa2f5956943d7) |
| AgentRegistry | `0x0101Ed240dA20FFDD95bca8E7408DAa889aE217B` | [link](https://www.oklink.com/x-layer-testnet/address/0x0101Ed240dA20FFDD95bca8E7408DAa889aE217B) |
| TreatySyndicate | `0xc8665453576bdba28aa72abb12152fed639cff12` | [link](https://www.oklink.com/x-layer-testnet/address/0xc8665453576bdba28aa72abb12152fed639cff12) |
| TestUSDC (6 dp) | `0xfc8423bf39a5be5c38961ae83ef56e0f680374aa` | [link](https://www.oklink.com/x-layer-testnet/address/0xfc8423bf39a5be5c38961ae83ef56e0f680374aa) |
| TestUSDC3009 (EIP-3009) | `0x9436031671c96726126fad7E72AAfB4e9ed2A92b` | [link](https://www.oklink.com/x-layer-testnet/address/0x9436031671c96726126fad7E72AAfB4e9ed2A92b) |

Operator wallets: agent/monitor + x402 treasury `0xCAadA93b4A4D8632d77435A8ee51E5C3D497fD03` ·
Themis `0x3208DF56aC9e9B04C94ce49ac9DC035059e9f516` · Athena `0xf19aF06DE5c74bf0c5CF7e8aa71a608F64F78c37` ·
Solon `0x435d6bd56cB281Fb3b1EE6A54001B49988AC016e`.

## 2. Live pact — full on-chain lifecycle walkthrough

Pact `0xc40e519126eda06729c4a7a12879daba08aefc6368db334546c3b423c63b40fc`
("📈 DEX treaty", ACTIVE) on SynthekeContract v2:

| Event | Block | Transaction (testnet explorer) |
|---|---|---|
| `DraftCreated` | 38,253,463 | [0x284e2137…b1eade](https://www.oklink.com/x-layer-testnet/tx/0x284e213758a8df288551cd2b2c91b7fac6e065ebe01e4e48a488c4772cb1eade) |
| `Negotiating` | 38,253,492 | [0x9d2fc4bd…b6646a5](https://www.oklink.com/x-layer-testnet/tx/0x9d2fc4bd1ac4f0edc68c06eb8d1410f12697e5d38264dd08913265b5db6646a5) |
| `Proposed` | 38,253,501 | [0x38888a9e…fb04dab](https://www.oklink.com/x-layer-testnet/tx/0x38888a9ecd1546fc39a9a5607afdae87379607217bb821cb8fc24eef7fb04dab) |
| `Committed` (A) | 38,253,505 | [0xbe4a324f…0ee905e](https://www.oklink.com/x-layer-testnet/tx/0xbe4a324fa399c4b5600994af7c49ebd78ad3e1df54ca8d9d4951ee0e50ee905e) |
| `Committed` + `Activated` (B) | 38,253,514 | [0xa41042a9…317efc50](https://www.oklink.com/x-layer-testnet/tx/0xa41042a9d7efdb328016875664ff05f5b17fe923cd2e6bda79eaa185317efc50) |
| `Deposited` → EscrowVaultV2 (A) | 38,253,528 | [0x5287d5cc…cb036252f](https://www.oklink.com/x-layer-testnet/tx/0x5287d5cc87cb69537bfcfd18332fbb96b15112ea4c3a86eef6215edcb036252f) |
| `Deposited` → EscrowVaultV2 (B) | 38,253,543 | [0x18a1f826…fc363f1](https://www.oklink.com/x-layer-testnet/tx/0x18a1f826d7ed5c4daf56bba90f52ddad20c114ed880c0896fce600360fc363f1) |
| `FeeCollected` (0.01 OKB) | 38,253,468 | [0xed43cad1…9fd4343](https://www.oklink.com/x-layer-testnet/tx/0xed43cad1bf73a845ef0aa57a2b4643305073fd677120ab0da1ffefbb29fd4343) |
| `AttestationRecorded` (heartbeat) | 38,259,448 | [0xa4f14639…73ee18cd7](https://www.oklink.com/x-layer-testnet/tx/0xa4f14639ed2126ad150116c4d41aa06c29636e79cf9ae84ba95ca3473ee18cd7) |

**AI artifact evidence** (ArtifactRegistry, same pact): `negotiation-move-r0-A` (claude v1),
`negotiation-move-r1-B` (deepseek v2), `negotiation-move-r1-A` (claude v3),
`negotiation-result-accepted` (theater v3), `contract-v1` (deepseek v1) — each with its own
record transaction, visible on the pact page and the registry explorer.

## 3. On-chain numbers — reproduce with `cast`

```bash
RPC=https://testrpc.xlayer.tech

# Pact FSM state (expect state = 4 ACTIVE)
cast call 0xE17c79c138bdE2ABfAfbBd2c3bBdD5511735B6E6 \
 "getPactState(bytes32)(tuple(uint8,address,address,tuple(uint256,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,bytes32,uint256,bool,bool,bool))" \
 0xc40e519126eda06729c4a7a12879daba08aefc6368db334546c3b423c63b40fc --rpc-url $RPC

# Escrow: TVL + settlements paid out
cast call 0x13be96c8a71628d41e80755f4027aa51a9014e08 "getTVL()(uint256)" --rpc-url $RPC
cast call 0x13be96c8a71628d41e80755f4027aa51a9014e08 "settledCount()(uint256)" --rpc-url $RPC

# Treasury: creation fees
cast call 0xe23721edbf637e080a2ec70d89faa2f5956943d7 "feeCount()(uint256)" --rpc-url $RPC
cast call 0xe23721edbf637e080a2ec70d89faa2f5956943d7 "totalFeesCollected()(uint256)" --rpc-url $RPC

# x402 revenue held by the agent treasury (TestUSDC3009)
cast call 0x9436031671c96726126fad7E72AAfB4e9ed2A92b "balanceOf(address)(uint256)" \
 0xCAadA93b4A4D8632d77435A8ee51E5C3D497fD03 --rpc-url $RPC

# Mediator stakes (OKB)
cast call 0xc3387efd100cc22b94ad7f68b55039daf0cf9caa "getStake(address)(uint256)" \
 0x3208DF56aC9e9B04C94ce49ac9DC035059e9f516 --rpc-url $RPC

# Reputation oracle info
cast call 0xfd61828f15fc98e1dcfe0dd6498abee6e003c1cf "oracleInfo()(string,uint256)" --rpc-url $RPC
```

## 4. Live HTTP endpoints (no auth)

```bash
AGENT=https://agent-production-507e.up.railway.app
curl $AGENT/status                          # monitor running, cycles, pactsMonitored
curl $AGENT/market                          # live OKX BTC/ETH prices + 24h change
curl $AGENT/escrow                          # vault TVL + positions
curl $AGENT/treasury                        # fees collected
curl $AGENT/payments                        # x402 settled count (reads the chain)
curl $AGENT/feedback/pending                # OKX feedback queue
curl $AGENT/.well-known/agent-card.json     # A2A agent card v0.7.0, 5 skills
curl $AGENT/artifacts/0xc40e519126eda06729c4a7a12879daba08aefc6368db334546c3b423c63b40fc
                                            # on-chain AI artifacts + verification checks
```

## 5. ERC-8004 / OKX evaluator identities

Registered on-chain as OKX.AI **AGENT** ERC-721 identities on X Layer **mainnet**
(each a successful AA-bundle mint, Aug 14 2026 — clickable on OKLink):

| Mediator | OKX agent id | Owner | Registration tx (mainnet explorer) |
|---|---|---|---|
| Themis | **#10920** | `0x53d724e6acd672ba08133bcd32b0412500bea79d` | [0x1ff133fb…e9e02f](https://www.oklink.com/x-layer/evm/tx/0x1ff133fbb7c41d19ec7917908c143078f60b5cfc24287ef50caa647fcde9e02f) |
| Athena | **#10921** | `0x6f6ec7ce8f915702888fffec75f0ccfb119969ba` | [0x22c532a7…f347b5](https://www.oklink.com/x-layer/evm/tx/0x22c532a7a9116bd7a546a7ffc8711b33024c0bbcf9b92c4728cef3ba67f347b5) |
| Solon | **#10922** | `0x8aeb89e6435fb92ba208683ab340bc3558edf1cb` | [0xd5c5d4c2…98cb46](https://www.oklink.com/x-layer/evm/tx/0xd5c5d4c25e5af8b0735fbcd978700c99ff54afa5858a492b07fd97eff198cb46) |

Each tx shows `Mint · 721 · AGENT · Token ID #109xx` to the corresponding owner wallet.

## 6. What cannot currently be verified on-chain (stated plainly)

- **Mainnet protocol deployment** — LIVE since Aug 14. All contracts on chain 196 (addresses
  and tx evidence in `MAINNET.md`); the pact contract is V4 `0x668776ff…` with breach
  attribution and working `confirmCure`. Forge suite: 54/54 green.
- **LLM mediation** — the live arbitration path runs the three-model mediator swarm
  (Claude for Themis, DeepSeek for Athena/Solon) with deterministic policy fallback; AI
  verdicts are hash-anchored to `ArtifactRegistry`. The *models themselves* are not TEE-attested.
- **A2A push notifications** — simulated (`notify.ts`); the A2A *join* is a real on-chain tx.
- **OKX marketplace feedback** — queued on-chain data awaits A2A task ids for full submission.

If a number on our dashboard ever disagrees with these commands, the chain is right.
