import pino from "pino";

export const logger = pino({
  name: "syntheke-agent",
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

export function logCycle(pactId: string, cycle: number, bitmap: bigint, state: string, durationMs: number): void {
  logger.info({
    event: "monitor_cycle",
    pactId: pactId.slice(0, 10) + "...",
    cycle,
    bitmap: bitmap.toString(16),
    state,
    durationMs,
  }, `Cycle ${cycle}: ${state} (${durationMs}ms)`);
}

export function logAttestation(pactId: string, cycle: number, txHash: string): void {
  logger.info({
    event: "attestation_recorded",
    pactId: pactId.slice(0, 10) + "...",
    cycle,
    txHash,
  }, `Attestation recorded: ${txHash}`);
}

export function logError(context: string, error: unknown): void {
  logger.error({
    event: "error",
    context,
    error: error instanceof Error ? error.message : String(error),
  }, `Error in ${context}: ${error instanceof Error ? error.message : String(error)}`);
}

export function logAgentStart(address: string, chainId: number): void {
  logger.info({
    event: "agent_start",
    address,
    chainId,
  }, `🏛️  Syntheke Monitor Agent starting — ${address} on chain ${chainId}`);
}
