# Syntheke on X Layer Mainnet

Deployed 2026-08-14 from `0xE95489Ba57561F9EaC2B64E5EFf2935F964440De`
(via `contracts/script/DeployMainnet.s.sol`, `forge script … --rpc-url https://rpc.xlayer.tech --broadcast`).

## Contract addresses (chain 196)

| Contract | Address |
|---|---|
| EscrowVaultV2 | `0xAa2821e2aC393c9258FeC9dD3614358Db0f2994f` |
| ReputationRegistry | `0x01C9E7f8B976f11090E32AeB248891Dd21980c76` |
| ReputationOracle | `0x6D5A6d11E32Ca3fD137daE1958c7C7DD97788866` |
| AgentRegistry | `0xc6cfFA52bDC4f5bc10f4d15805F8dD372b6507Cb` |
| SynthekeContract | `0x2693Bab68Fa76b9DF585416672c1363FA5b0fE7A` |
| MediatorVotes | `0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c` |
| MediatorStaking | `0x1eB320CC08DD481559174d073C12106F8Dc52082` |
| TreasuryVault | `0x8fFCC37900133e173b91ac7f1425152F646e6F8D` |
| ArtifactRegistry | `0xE2A1C0A534B2bcfAfc8269F4251968FB80104EA6` |
| TreatySyndicate | `0x2D22A0513DE808fbDd68A7d3F64792F8B72198D1` |

## Wiring (verified on-chain)

- `SynthekeContract.monitorAgent` → `0xE95489…6440De`
- `EscrowVaultV2.owner` → `0xE95489…6440De` (deployer key; rotate via `setOwner` when a dedicated monitor wallet is used)
- `ReputationRegistry.synthekeContract` → `0x2693Bab68Fa76b9DF585416672c1363FA5b0fE7A`
- `ReputationOracle`: monitorAgent → `0xE95489…6440De`, registryV1 fallback → ReputationRegistry above
- `MediatorVotes` seeded with the same three mediator wallets as testnet (Themis / Athena / Solon)
- `TreasuryVault` creation fee: `0.01 OKB` · `MediatorStaking` slash: 20% (2000 bps)
- `AgentRegistry` deployed with ERC-8004 hook `address(0)` (ownership check is disabled in the contract; wire the real mainnet ERC-8004 registry later)

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

## Smoke test (2026-08-14)

Agent wallet: `0xBe26dF270587f3A333746564D4FAED4B99027934` (funded 0.02 OKB, tx `0x6c918658…`).
Result: see pact id below (filled after run).
