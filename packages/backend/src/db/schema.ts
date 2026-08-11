import { pgTable, text, integer, timestamp, boolean, jsonb, real, index } from "drizzle-orm/pg-core";

// ──── AGENTS ────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  erc8004TokenId: text("erc8004_token_id"),
  name: text("name"),
  capabilities: jsonb("capabilities").$type<string[]>().default([]),
  reputationScore: integer("reputation_score").default(5000),
  active: boolean("active").default(true),
  metadataUri: text("metadata_uri"),
  registeredAt: timestamp("registered_at").defaultNow(),
  lastActive: timestamp("last_active").defaultNow(),
});

// ──── PACTS ─────────────────────────────────────────────

export const pacts = pgTable("pacts", {
  id: text("id").primaryKey(),
  pactIdHash: text("pact_id_hash").notNull().unique(),
  partyA: text("party_a").notNull(),
  partyB: text("party_b").notNull(),
  state: text("state").notNull().default("DRAFT"),
  termsHash: text("terms_hash"),
  escrowAmount: text("escrow_amount"),
  settlementAsset: text("settlement_asset"),
  activationBlock: integer("activation_block"),
  degradationCounter: integer("degradation_counter").default(0),
  breachTier: text("breach_tier"),
  attestationCount: integer("attestation_count").default(0),
  closed: boolean("closed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => ({
  stateIdx: index("pact_state_idx").on(table.state),
  partyAIdx: index("pact_party_a_idx").on(table.partyA),
  partyBIdx: index("pact_party_b_idx").on(table.partyB),
}));

// ──── ATTESTATIONS ──────────────────────────────────────

export const attestations = pgTable("attestations", {
  id: text("id").primaryKey(),
  pactIdHash: text("pact_id_hash").notNull(),
  cycleNumber: integer("cycle_number").notNull(),
  conditionBitmap: text("condition_bitmap").notNull(),
  assessedState: text("assessed_state").notNull(),
  dataHash: text("data_hash").notNull(),
  reason: text("reason"),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (table) => ({
  pactIdx: index("attestation_pact_idx").on(table.pactIdHash),
}));

// ──── REPUTATION EVENTS ─────────────────────────────────

export const reputationEvents = pgTable("reputation_events", {
  id: text("id").primaryKey(),
  agentAddress: text("agent_address").notNull(),
  pactIdHash: text("pact_id_hash").notNull(),
  eventType: text("event_type").notNull(), // COMPLETED | BREACHED | TERMINATED
  scoreDelta: integer("score_delta").notNull(),
  newScore: integer("new_score").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  agentIdx: index("rep_agent_idx").on(table.agentAddress),
}));

// ──── MONITORING CYCLES ─────────────────────────────────

export const monitoringCycles = pgTable("monitoring_cycles", {
  id: text("id").primaryKey(),
  pactIdHash: text("pact_id_hash").notNull(),
  cycleNumber: integer("cycle_number").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  dataSources: jsonb("data_sources").$type<Record<string, string>>().default({}),
  aiAnalysisHash: text("ai_analysis_hash"),
  status: text("status").default("pending"), // pending | running | completed | failed
}, (table) => ({
  pactIdx: index("cycle_pact_idx").on(table.pactIdHash),
}));
