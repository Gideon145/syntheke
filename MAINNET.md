# Syntheke on X Layer Mainnet

Deployed 2026-08-14 from `0xE95489Ba57561F9EaC2B64E5EFf2935F964440De`
(via `contracts/script/DeployMainnet.s.sol`, `forge script … --rpc-url https://rpc.xlayer.tech --broadcast`).
Pact contract upgraded in-place: V2 (Aug 14) → V3 breach attribution (Aug 16) → **V4** (Aug 16,
corrected condition convention). History is preserved — the agent scans all three.

## Contract addresses (chain 196)

| Contract | Address |
|---|---|
| **SynthekeContract V4 (current)** | `0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d` |
| SynthekeContract V3 (legacy) | `0x91ddd53ea56519e6f33231e76112a3643fd24f0b` |
| SynthekeContract V2 (legacy, 18 treaties) | `0x2693Bab68Fa76b9DF585416672c1363FA5b0fE7A` |
| EscrowVaultV2 | `0xAa2821e2aC393c9258FeC9dD3614358Db0f2994f` |
| ReputationRegistry | `0x01C9E7f8B976f11090E32AeB248891Dd21980c76` |
| ReputationOracle | `0x6D5A6d11E32Ca3fD137daE1958c7C7DD97788866` |
| AgentRegistry | `0xc6cfFA52bDC4f5bc10f4d15805F8dD372b6507Cb` |
| MediatorVotes | `0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c` |
| MediatorStaking | `0x1eB320CC08DD481559174d073C12106F8Dc52082` |
| TreasuryVault | `0x8fFCC37900133e173b91ac7f1425152F646e6F8D` |
| ArtifactRegistry | `0x00cdEF3FF818Eb4CE9a9fd529E6aF6f4efEa24e9` |
| TreatySyndicate | `0x2D22A0513DE808fbDd68A7d3F64792F8B72198D1` |

## Wiring (verified on-chain)

- `SynthekeContract(V2/V3/V4).monitorAgent` → agent wallet `0x37beD0…6f4Ee`
- `EscrowVaultV2.owner` → agent wallet (rotated off the deployer key, Aug 15)
- `ReputationOracle`: monitorAgent → agent wallet, registryV1 fallback → ReputationRegistry above
- `MediatorVotes` seeded with the same three mediator wallets as testnet (Themis / Athena / Solon)
- `TreasuryVault` creation fee: `0.01 OKB` · `MediatorStaking` slash: 20% (2000 bps)
- `AgentRegistry` deployed with ERC-8004 hook `address(0)` (ownership check is disabled in the contract)

## Escrow asset

`EscrowVaultV2` is asset-agnostic — deposits take any ERC20 per call. Mainnet escrow uses
**real USDT** `0x779ded0c9e1022225f8e0630b35a9b54be713736` (same token the project wallets already use).

## Running the agent in mainnet mode

```powershell
$env:XLAYER_RPC_URL = "https://rpc.xlayer.tech"
$env:XLAYER_CHAIN_ID = "196"
# AGENT_PRIVATE_KEY must be a mainnet wallet funded with OKB
npx tsx scripts/mainnet-smoke.ts   # one-pact smoke test
```

When `XLAYER_CHAIN_ID=196`, `config.ts` automatically swaps every contract address
to the mainnet set (overridable per-address via `MAINNET_*` env vars).

## On-chain evidence (every claim clickable on OKLink)

| Claim | Evidence |
|---|---|
| V4 pact contract deploy (breach attribution + cure) | [0xb61c340c…e07750](https://www.oklink.com/xlayer/tx/0xb61c340c94bf05e58a59616c6a7218b0db779edcdd52b40db09dd0f294e07750) |
| V3 pact contract deploy | [0xd4d05382…302a32](https://www.oklink.com/xlayer/tx/0xd4d05382cf7bf605e44fa8be2b1671f631066cd86f6b1605a658f62523902a32) |
| 9 treaty creation fees → 0.09 OKB in treasury | `TreasuryVault.feeCount()` = 9 · balance `0x8fFC…6F8D` |
| 19 x402 payments settled (1.9 USDT) — 19 distinct payer wallets, each with its own EIP-3009 signature | `GET /payments` (agent-mainnet) |
| AI-mediated arbitration (3-model swarm) | pact `0xffbc1946…` votes + `ArtifactRegistry` verdict hashes |
| Self-healing treaty (degrade → AI amendment → ACTIVE) | pact `0xb42abaf4…fd2f26` activity log + `Amended` event |
| Breach attributed → cured by breaching party | [0x0331ceeb…4f3916](https://www.oklink.com/xlayer/tx/0x0331ceebd10535070b5d5c1a174b566211ffa366ce3ac0764070dfcac64f3916) |
| 3 evaluator ERC-8004 identities | `VERIFICATION.md` §5 (mint txs on mainnet) |

## Smoke test (2026-08-14)

Agent wallet: `0x37beD0c25eCcc8C6B731cDec51e98DbB1266f4Ee` (the live monitor).
Result: passed — treaties, fees, x402 settlements and arbitration all flow on chain 196
(see the evidence table above).
