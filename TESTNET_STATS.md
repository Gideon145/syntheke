# Syntheke Testnet Era — Final Stats

Captured 2026-08-15 before flipping the system to X Layer mainnet.

## Treaties
- **52 treaties formed** total (51 on legacy contract + 1 on current v2)
- Flagship treaty `0xc40e5191…c40fc` (DEX treaty): **ACTIVE**, **723 attestations**, 0 degradation
- Legacy contract: `0xe465405380E2E0f625028447E85917662E71ad42` (51 pacts)
- V2 contract: `0xE17c79c138bdE2ABfAfbBd2c3bBdD5511735B6E6` (1 live pact)

## Escrow (EscrowVaultV2 `0x13be96c8…a9014e08`, TestUSDC)
- TVL: **500.0002 TestUSDC**
- Settlements paid: **2**
- Positions: 6 (4 two-party, 2 single-party)

## Payments
- x402 settlements: **3** (TestUSDC3009 treasury balance 3.0 TUSD9)

## Arbitration
- 3 staked mediators: Themis (0.00384 OKB), Athena (0.00432 OKB), Solon (0.00384 OKB)
- Commit-reveal rounds run on-chain via MediatorVotes `0x921691a7…`

## Infrastructure
- AI swarm healthy (Claude + DeepSeek, dual-model)
- Monitor: 15s cycles on chain 1952
- Tests: 48/48 forge tests at capture (mainnet era: 54/54)
- OKX.AI evaluator identities: Themis #10920, Athena #10921, Solon #10922

## Artifacts / reputation
- ArtifactRegistry `0x1c36bf1B…` with verified on-chain artifacts (negotiation moves, contract commitments)
- ReputationOracle v2 `0xfd61828f…` (portable reputation, registryV1 fallback wired)
