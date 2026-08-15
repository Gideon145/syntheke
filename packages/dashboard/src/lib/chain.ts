/**
 * Chain-aware display labels for the dashboard.
 * The dashboard reads live data from the Syntheke agent, which may run on
 * X Layer testnet (chain 1952) or mainnet (chain 196).
 */

export function chainLabel(chainId: number | undefined | null): string {
  if (chainId === 196) return "X Layer Mainnet";
  if (chainId === 1952) return "X Layer Testnet";
  return "X Layer";
}

export function chainLabelShort(chainId: number | undefined | null): string {
  if (chainId === 196) return "Mainnet";
  if (chainId === 1952) return "Testnet";
  return "X Layer";
}

export function escrowAssetLabel(chainId: number | undefined | null): string {
  return chainId === 196 ? "USDT" : "TestUSDC";
}

export function isMainnet(chainId: number | undefined | null): boolean {
  return chainId === 196;
}
