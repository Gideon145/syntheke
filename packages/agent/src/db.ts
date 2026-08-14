/**
 * db.ts — Postgres persistence layer (Batch 1)
 *
 * Everything the agent previously kept in memory (activity log, negotiation
 * sessions, plain-English contracts, pact names) now survives restarts.
 *
 * Graceful degradation: if DATABASE_URL is missing or unreachable, the module
 * logs once and no-ops — the agent keeps running in memory-only mode.
 */

import { createRequire } from "node:module";
import { config } from "./config";
import { logger } from "./logger";

const require = createRequire(import.meta.url);

let pool: import("pg").Pool | null = null;
let dbFailed = false;

function getPool(): import("pg").Pool | null {
  if (dbFailed) return null;
  if (!config.DATABASE_URL) {
    if (!dbFailed) {
      dbFailed = true;
      logger.warn({ event: "db_unavailable" }, "DATABASE_URL not set — persistence disabled");
    }
    return null;
  }
  if (!pool) {
    try {
      const { Pool } = require("pg") as typeof import("pg");
      pool = new Pool({
        connectionString: config.DATABASE_URL,
        connectionTimeoutMillis: 4000,
        max: 5,
      });
      pool.on("error", () => {
        /* keep pool alive */
      });
    } catch {
      dbFailed = true;
      logger.warn({ event: "db_unavailable" }, "pg not installed — persistence disabled");
      return null;
    }
  }
  return pool;
}

async function query(text: string, params: unknown[] = []): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(text, params);
  } catch (err) {
    if (!dbFailed) {
      dbFailed = true;
      logger.warn({ event: "db_error", err }, "Database unreachable — running memory-only");
    }
  }
}

async function queryRows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const res = await p.query(text, params);
    return res.rows as T[];
  } catch (err) {
    if (!dbFailed) {
      dbFailed = true;
      logger.warn({ event: "db_error", err }, "Database unreachable — running memory-only");
    }
    return [];
  }
}

let initialized = false;

/** Create tables if missing. Idempotent, called once per boot. */
export async function initDb(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await query(`
    CREATE TABLE IF NOT EXISTS syntheke_activity (
      id BIGSERIAL PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      event TEXT NOT NULL,
      detail TEXT,
      pact_id TEXT,
      tx_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS syntheke_negotiations (
      pact_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS syntheke_contracts (
      pact_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS syntheke_pact_names (
      pact_id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS syntheke_pact_subjects (
      pact_id TEXT PRIMARY KEY,
      subject TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS syntheke_feedback_queue (
      id BIGSERIAL PRIMARY KEY,
      pact_id TEXT NOT NULL,
      party TEXT NOT NULL,
      okx_agent_id TEXT,
      creator_agent_id TEXT NOT NULL,
      score REAL NOT NULL,
      description TEXT,
      task_id TEXT,
      submitted BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at BIGINT,
      created_at BIGINT NOT NULL
    );
  `);
}

// ──── Activity log ────────────────────────────────────────

export function saveActivity(entry: {
  timestamp: number;
  event: string;
  detail: string;
  pactId?: string;
  txHash?: string;
}): void {
  void query(
    `INSERT INTO syntheke_activity (timestamp, event, detail, pact_id, tx_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [entry.timestamp, entry.event, entry.detail, entry.pactId ?? null, entry.txHash ?? null],
  );
}

export async function loadRecentActivity(limit = 30): Promise<Array<{
  timestamp: number; event: string; detail: string; pactId?: string; txHash?: string;
}>> {
  const rows = await queryRows<{
    timestamp: string; event: string; detail: string | null; pact_id: string | null; tx_hash: string | null;
  }>(
    `SELECT timestamp, event, detail, pact_id, tx_hash FROM syntheke_activity
     ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map(r => ({
    timestamp: Number(r.timestamp),
    event: r.event,
    detail: r.detail ?? "",
    pactId: r.pact_id ?? undefined,
    txHash: r.tx_hash ?? undefined,
  })).reverse();
}

// ──── Negotiation sessions ────────────────────────────────

export function saveNegotiation(pactId: string, payload: unknown): void {
  void query(
    `INSERT INTO syntheke_negotiations (pact_id, payload, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (pact_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
    [pactId, JSON.stringify(payload), Date.now()],
  );
}

export async function loadNegotiations(): Promise<Array<{ pact_id: string; payload: unknown }>> {
  const rows = await queryRows<{ pact_id: string; payload: unknown }>(
    `SELECT pact_id, payload FROM syntheke_negotiations`,
  );
  return rows;
}

// ──── Contracts ───────────────────────────────────────────

export function saveContract(pactId: string, payload: unknown): void {
  void query(
    `INSERT INTO syntheke_contracts (pact_id, payload) VALUES ($1, $2)
     ON CONFLICT (pact_id) DO UPDATE SET payload = EXCLUDED.payload`,
    [pactId, JSON.stringify(payload)],
  );
}

export async function loadContracts(): Promise<Array<{ pact_id: string; payload: unknown }>> {
  return queryRows<{ pact_id: string; payload: unknown }>(`SELECT pact_id, payload FROM syntheke_contracts`);
}

// ──── Pact names ──────────────────────────────────────────

export function savePactName(pactId: string, name: string): void {
  void query(
    `INSERT INTO syntheke_pact_names (pact_id, name) VALUES ($1, $2)
     ON CONFLICT (pact_id) DO UPDATE SET name = EXCLUDED.name`,
    [pactId, name],
  );
}

export async function loadPactNames(): Promise<Map<string, string>> {
  const rows = await queryRows<{ pact_id: string; name: string }>(`SELECT pact_id, name FROM syntheke_pact_names`);
  return new Map(rows.map(r => [r.pact_id, r.name]));
}

// ──── Pact subjects (Batch 5 — DEX/SLA/monitoring treaty metadata) ──

export function savePactSubject(pactId: string, subject: string): void {
  void query(
    `INSERT INTO syntheke_pact_subjects (pact_id, subject) VALUES ($1, $2)
     ON CONFLICT (pact_id) DO UPDATE SET subject = EXCLUDED.subject`,
    [pactId, subject],
  );
}

export async function loadPactSubjects(): Promise<Map<string, string>> {
  const rows = await queryRows<{ pact_id: string; subject: string }>(
    `SELECT pact_id, subject FROM syntheke_pact_subjects`,
  );
  return new Map(rows.map(r => [r.pact_id, r.subject]));
}

// ──── Feedback queue (Batch 2 — ERC-8004 dual-write) ──────

export function saveFeedback(entry: {
  pactId: string;
  party: string;
  okxAgentId?: string;
  creatorAgentId: string;
  score: number;
  description: string;
  taskId?: string;
}): void {
  void query(
    `INSERT INTO syntheke_feedback_queue
       (pact_id, party, okx_agent_id, creator_agent_id, score, description, task_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entry.pactId, entry.party, entry.okxAgentId ?? null, entry.creatorAgentId,
      entry.score, entry.description, entry.taskId ?? null, Date.now()],
  );
}

export async function loadPendingFeedback(): Promise<Array<{
  id: number;
  pactId: string;
  party: string;
  okxAgentId: string | null;
  creatorAgentId: string;
  score: number;
  description: string | null;
  taskId: string | null;
  createdAt: number;
}>> {
  const rows = await queryRows<{
    id: string; pact_id: string; party: string; okx_agent_id: string | null;
    creator_agent_id: string; score: string; description: string | null;
    task_id: string | null; created_at: string;
  }>(`SELECT * FROM syntheke_feedback_queue WHERE submitted = FALSE ORDER BY id ASC`);
  return rows.map(r => ({
    id: Number(r.id),
    pactId: r.pact_id,
    party: r.party,
    okxAgentId: r.okx_agent_id,
    creatorAgentId: r.creator_agent_id,
    score: Number(r.score),
    description: r.description,
    taskId: r.task_id,
    createdAt: Number(r.created_at),
  }));
}

export function ackFeedback(id: number): void {
  void query(`UPDATE syntheke_feedback_queue SET submitted = TRUE, submitted_at = $2 WHERE id = $1`, [id, Date.now()]);
}
