/**
 * Chain-aware display labels for the dashboard.
 * The dashboard reads live data from the Syntheke agent, which may run on
 * X Layer testnet (chain 1952) or mainnet (chain 196).
 */

export function chainLabel(chainId: number | undefined | null): string {
  return chainId === 196 ? "X Layer Mainnet" : "X Layer Testnet";
}

export function chainLabelShort(chainId: number | undefined | null): string {
  return chainId === 196 ? "Mainnet" : "Testnet";
}

export function escrowAssetLabel(chainId: number | undefined | null): string {
  return chainId === 196 ? "USDT" : "TestUSDC";
}

export function isMainnet(chainId: number | undefined | null): boolean {
  return chainId === 196;
}
