/**
 * Syntheke A2A Notification Layer
 *
 * When a pact changes state, the monitor sends A2A (Agent-to-Agent) pings
 * to notify Party A and Party B agents. This module tracks pending notifications,
 * simulates delivery, and exposes them via HTTP API for testing.
 */

interface A2ANotification {
  id: string;
  timestamp: number;
  pactId: string;
  state: string;
  recipient: string; // agent address
  role: "partyA" | "partyB";
  message: string;
  delivered: boolean;
  deliveryTx?: string;
}

const pending: A2ANotification[] = [];
const delivered: A2ANotification[] = [];
const MAX_HISTORY = 50;

/** Generate a unique notification ID */
function nid(): string {
  return `a2a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Send A2A notifications to both parties about a pact state change.
 * In production, this would call the OKX A2A protocol to deliver messages
 * to the recipient agents' inboxes.
 */
export function notifyParties(
  pactId: string,
  state: string,
  partyA: string,
  partyB: string,
  detail: string,
): A2ANotification[] {
  const notifications: A2ANotification[] = [];

  const templates: Record<string, { a: string; b: string }> = {
    DEGRADING: {
      a: `⚠️ Pact ${pactId.slice(0, 10)}... is DEGRADING — ${detail}. Monitor watching closely.`,
      b: `⚠️ Your pact ${pactId.slice(0, 10)}... is DEGRADING — ${detail}. Fix conditions to avoid breach.`,
    },
    BREACHED: {
      a: `🚨 Pact ${pactId.slice(0, 10)}... BREACHED — ${detail}. Escrow at risk. Cure window: 100 blocks.`,
      b: `🚨 BREACH: ${detail}. You have 100 blocks to cure or face AI arbitration. Pact ${pactId.slice(0, 10)}...`,
    },
    CURING: {
      a: `🩹 Pact ${pactId.slice(0, 10)}... in CURING — ${detail}. Awaiting breaching party to restore compliance.`,
      b: `🩹 CURE WINDOW ACTIVE: ${detail}. Restore conditions before deadline. Pact ${pactId.slice(0, 10)}...`,
    },
    ARBITRATING: {
      a: `⚖️ Pact ${pactId.slice(0, 10)}... in ARBITRATION — ${detail}. AI mediator swarm (Themis·Athena·Solon) evaluating.`,
      b: `⚖️ DISPUTE: ${detail}. 3 AI mediators evaluating your pact ${pactId.slice(0, 10)}...`,
    },
    RESOLVING: {
      a: `📊 Pact ${pactId.slice(0, 10)}... RESOLVING — ${detail}. Settlement being computed.`,
      b: `📊 RESOLUTION: ${detail}. Pact ${pactId.slice(0, 10)}... settlement in progress.`,
    },
    CLOSED: {
      a: `✅ Pact ${pactId.slice(0, 10)}... CLOSED — ${detail}. Reputation scores updated on-chain.`,
      b: `✅ Pact ${pactId.slice(0, 10)}... CLOSED — ${detail}. Escrow distributed, reputation updated.`,
    },
  };

  const tmpl = templates[state];
  if (!tmpl) return []; // no notification for this state

  // Notify Party A
  const na: A2ANotification = {
    id: nid(),
    timestamp: Date.now(),
    pactId,
    state,
    recipient: partyA,
    role: "partyA",
    message: tmpl.a,
    delivered: true, // simulated — in production this would be async
  };
  pending.push(na);
  notifications.push(na);

  // Notify Party B
  const nb: A2ANotification = {
    id: nid(),
    timestamp: Date.now(),
    pactId,
    state,
    recipient: partyB,
    role: "partyB",
    message: tmpl.b,
    delivered: true,
  };
  pending.push(nb);
  notifications.push(nb);

  // Move to delivered after "sending"
  for (const n of notifications) {
    delivered.push({ ...n });
    if (delivered.length > MAX_HISTORY) delivered.shift();
  }
  pending.length = 0;

  return notifications;
}

/** Get recent delivered notifications */
export function getRecentNotifications(limit = 10): A2ANotification[] {
  return delivered.slice(-limit).reverse();
}

/** Get pending (undelivered) notifications */
export function getPendingNotifications(): A2ANotification[] {
  return [...pending];
}
