# Syntheke OKX.AI ASP Registry

Registered 2026-08-14 on X Layer mainnet (chain 196).

## ASP
- **Agent ID: 10948** — name: Syntheke
- Owner: `0x8aeb89e6435fb92ba208683ab340bc3558edf1cb`
- Registration tx: `0x6d7dfe9625b90545b33247414c0a692d81f0cfdbb6f79c8412c1858d84f016ff`
- Avatar: `https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/0e5461d3-6bac-40e2-b717-dfe80159d15e.jpg`
- Marketplace page: https://www.okx.ai/agents/10948
- Status: registered, NOT yet listed/activated (planned go-live ~3 days after registration)

## Services (A2MCP, 0.1 USDT each, x402 "exact" + EIP-3009 on real USDT)

| # | Name | id | serviceId | Endpoint |
|---|---|---|---|---|
| 1 | On-Chain Dispute Arbitration | 39285 | eb6d9109-28ea-4ff9-ad8a-63bb259d0907 | /services/arbitrate |
| 2 | Pact Health Assessment | 39286 | 9372a307-91d2-4f38-854c-09891d1b3004 | /services/assess |
| 3 | Treaty Formation | 39287 | a2f02cca-642d-4c3d-8d4b-9e4d974144f3 | /pacts/create |

Backend: `https://agent-mainnet-production.up.railway.app` (Railway service `agent-mainnet`, chain 196).
Payment asset: USDT `0x779ded0c9e1022225f8e0630b35a9b54be713736` (EIP-712 domain USD₮0 v1 — same rail as Argus #5047).
Treasury (payTo): `0x37beD0c25eCcc8C6B731cDec51e98DbB1266f4Ee` (mainnet agent wallet; key in `packages/agent/.env.mainnet`, gitignored).
