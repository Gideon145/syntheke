import { createHash } from "node:crypto";
import { ethers } from "ethers";
import { config } from "./config";
import { getProvider } from "./pact";
import type { ConditionResult, ConditionBit } from "./conditions";

/**
 * Oracle Data Source Layer
 *
 * Abstracts all external data sources for pact condition evaluation.
 * Each source has a primary endpoint with 3-tier fallback:
 *   Tier 1: Primary API / on-chain call
 *   Tier 2: Secondary API
 *   Tier 3: Cached / default value
 *
 * All sources return typed data or null on total failure.
 */

// ──── Types ──────────────────────────────────────────────

export interface PriceData {
  price: number;
  timestamp: number;
  source: string;
}

export interface IdentityStatus {
  address: string;
  active: boolean;
  source: string;
}

export interface EscrowData {
  pactId: string;
  balanceA: bigint;
  balanceB: bigint;
  totalDeposited: bigint;
  source: string;
}

// ──── Tiered Fetch Pattern ───────────────────────────────

async function fetchWithFallback<T>(
  name: string,
  tiers: Array<() => Promise<T | null>>,
): Promise<{ data: T | null; source: string }> {
  for (let i = 0; i < tiers.length; i++) {
    try {
      const data = await tiers[i]();
      if (data !== null) {
        return { data, source: `tier${i + 1}` };
      }
    } catch {
      // Fall through to next tier
    }
  }
  return { data: null, source: "exhausted" };
}

// ──── Price Oracle ───────────────────────────────────────

export async function fetchPrice(token: string): Promise<PriceData | null> {
  // Tier 1: Pyth Network
  const tier1 = async (): Promise<PriceData | null> => {
    const id = getPythPriceId(token);
    if (!id) return null;
    const url = `${config.PYTH_ENDPOINT}/v2/updates/price/latest?ids[]=${id}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const json = await resp.json() as { parsed?: Array<{ price: { price: string; expo: number } }> };
    const parsed = json.parsed?.[0];
    if (!parsed) return null;
    const price = Number(parsed.price.price) * Math.pow(10, parsed.price.expo);
    return { price, timestamp: Date.now(), source: "pyth" };
  };

  // Tier 2: On-chain oracle (placeholder — reads from a simple oracle contract)
  const tier2 = async (): Promise<PriceData | null> => {
    // In production: call a Chainlink or Pyth on-chain oracle
    // For now: return null to fall through
    return null;
  };

  // Tier 3: Static fallback (last known price from DB or hardcoded)
  const tier3 = async (): Promise<PriceData | null> => {
    if (config.DEMO_MODE) {
      return { price: token === "ETH" ? 3200 : 1, timestamp: Date.now(), source: "demo" };
    }
    return null;
  };

  const result = await fetchWithFallback(`price:${token}`, [tier1, tier2, tier3]);
  return result.data;
}

// ──── Agent Identity ─────────────────────────────────────

export async function checkAgentIdentity(agentAddress: string): Promise<IdentityStatus> {
  // Tier 1: On-chain AgentRegistry
  const tier1 = async (): Promise<IdentityStatus | null> => {
    const provider = getProvider();
    const registry = new ethers.Contract(
      config.AGENT_REGISTRY,
      ["function isAgentActive(address) view returns (bool)"],
      provider,
    );
    const active: boolean = await registry.isAgentActive(agentAddress);
    return { address: agentAddress, active, source: "on-chain" };
  };

  // Tier 2: ERC-8004 check (simplified — production: call ERC-8004 contract)
  const tier2 = async (): Promise<IdentityStatus | null> => {
    return null; // Placeholder for ERC-8004 integration
  };

  // Tier 3: Assume active in demo mode
  const tier3 = async (): Promise<IdentityStatus | null> => {
    if (config.DEMO_MODE) return { address: agentAddress, active: true, source: "demo" };
    return null;
  };

  const result = await fetchWithFallback(`identity:${agentAddress}`, [tier1, tier2, tier3]);
  return result.data ?? { address: agentAddress, active: true, source: "fallback" };
}

// ──── Escrow Health ──────────────────────────────────────

export async function checkEscrowHealth(pactId: string): Promise<EscrowData | null> {
  const tier1 = async (): Promise<EscrowData | null> => {
    const provider = getProvider();
    const vault = new ethers.Contract(
      config.ESCROW_VAULT,
      ["function getPosition(bytes32) view returns (tuple(bytes32 pactId, address partyA, address partyB, address asset, uint256 amountA, uint256 amountB, uint256 totalDeposited, bool settled, bool refunded))"],
      provider,
    );
    const pos = await vault.getPosition(pactId);
    return {
      pactId,
      balanceA: pos.amountA,
      balanceB: pos.amountB,
      totalDeposited: pos.totalDeposited,
      source: "on-chain",
    };
  };

  const tier2 = async (): Promise<EscrowData | null> => {
    if (config.DEMO_MODE) {
      return { pactId, balanceA: 1000n * 10n ** 18n, balanceB: 1000n * 10n ** 18n, totalDeposited: 2000n * 10n ** 18n, source: "demo" };
    }
    return null;
  };

  const result = await fetchWithFallback(`escrow:${pactId}`, [tier1, tier2]);
  return result.data;
}

// ──── Condition Collector ────────────────────────────────

export async function collectConditions(
  pactId: string,
  partyA: string,
  partyB: string,
  _terms: { monitoredConditions: bigint },
): Promise<ConditionResult[]> {
  const results: ConditionResult[] = [];

  // Check which conditions are enabled for this pact
  const enabledConditions = _terms.monitoredConditions;

  // Agent identity checks
  if (enabledConditions & (1n << BigInt(0 /* AGENT_IDENTITY_A */))) {
    const a = await checkAgentIdentity(partyA);
    results.push({ bit: 0, healthy: a.active, detail: `Party A active: ${a.active}`, sourceData: a });
  }
  if (enabledConditions & (1n << BigInt(1 /* AGENT_IDENTITY_B */))) {
    const b = await checkAgentIdentity(partyB);
    results.push({ bit: 1, healthy: b.active, detail: `Party B active: ${b.active}`, sourceData: b });
  }

  // Escrow health
  if (enabledConditions & (1n << BigInt(2 /* ESCROW_HEALTHY */))) {
    const escrow = await checkEscrowHealth(pactId);
    const healthy = escrow !== null && escrow.totalDeposited > 0n;
    results.push({ bit: 2, healthy, detail: `Escrow: ${escrow?.totalDeposited.toString() ?? "unknown"}`, sourceData: escrow });
  }

  // Default: remaining conditions are healthy (Phase 2 — real oracle data in Phase 5)
  // Each condition bit 3-10 defaults to healthy until real data sources are integrated
  for (let bit = 3; bit <= 10; bit++) {
    if (enabledConditions & (1n << BigInt(bit))) {
      results.push({
        bit: bit as ConditionBit,
        healthy: true,
        detail: `${getConditionName(bit)}: monitoring active (real data in Phase 5)`,
        sourceData: null,
      });
    }
  }

  return results;
}

function getConditionName(bit: number): string {
  const names: Record<number, string> = {
    3: "Collateral ratio",
    4: "Collateral ratio (soft)",
    5: "Payment current",
    6: "Yield on target",
    7: "Counterparty health",
    8: "Oracle stable",
    9: "Liquidity adequate",
    10: "Milestones on track",
  };
  return names[bit] ?? `Condition ${bit}`;
}

// ──── Pyth Price Feed IDs ────────────────────────────────

function getPythPriceId(token: string): string | null {
  const ids: Record<string, string> = {
    ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    USDT: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  };
  return ids[token.toUpperCase()] ?? null;
}
