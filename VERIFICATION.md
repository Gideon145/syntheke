# Syntheke — Verification Guide

Everything in the Syntheke submission can be checked independently. No API keys, no accounts,
no trusting our dashboard. This file is the exact path: **README → explorer → contract →
transaction → event → result**.

- **Network:** X Layer testnet, chain id **1952**, RPC `https://testrpc.xlayer.tech`
- **Explorer:** https://www.oklink.com/x-layer-testnet (addresses and transactions)

## 0. One-shot verifier

```bash
git clone https://github.com/Gideon145/syntheke && cd syntheke
bash verify.sh            # 24 checks against the LIVE deployment + on-chain state
cd contracts && forge test   # 48/48
```

## 1. Contract addresses (all deployed, all readable)

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

Registered on the OKX marketplace (X Layer mainnet, chainIndex 196):

| Mediator | OKX agent id | Owner | Registration tx |
|---|---|---|---|
| Themis | **#10920** | `0x53d724e6acd672ba08133bcd32b0412500bea79d` | `0x1ff133fbb7c41d19ec7917908c143078f60b5cfc24287ef50caa647fcde9e02f` |
| Athena | **#10921** | `0x6f6ec7ce8f915702888fffec75f0ccfb119969ba` | `0x22c532a7a9116bd7a546a7ffc8711b33024c0bbcf9b92c4728cef3ba67f347b5` |
| Solon | **#10922** | `0x8aeb89e6435fb92ba208683ab340bc3558edf1cb` | `0xd5c5d4c25e5af8b0735fbcd978700c99ff54afa5858a492b07fd97eff198cb46` |

(Full tx hashes as recorded at registration time; mainnet explorer verification of these txs is
outside the testnet explorer linked above.)

## 6. What cannot currently be verified on-chain (stated plainly)

- **LLM execution itself** — artifacts prove *which AI output was produced*, not that a specific
  model produced it. No TEE/ML attestation in this version.
- **A2A push notifications** — simulated (`notify.ts`); the A2A *join* is a real on-chain tx.
- **OKX marketplace feedback** — queued on-chain data awaits A2A task ids for full submission.
- **Mainnet protocol deployment** — not yet performed; only the evaluator identities above are
  registered on mainnet.

If a number on our dashboard ever disagrees with these commands, the chain is right.
