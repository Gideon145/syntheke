/**
 * feedback_sync.ts — ERC-8004 feedback dual-write bridge runner (Batch 2)
 *
 * Pulls queued Syntheke reviews from the agent API and submits them to the
 * OKX AI agent marketplace with the registered evaluator identities
 * (Themis #10920 / Athena #10921 / Solon #10922).
 *
 * Runs where the onchainos CLI is installed AND logged in (currently the
 * dev machine). OKX requires a related task id, so entries without one
 * (pre-A2A pacts) are reported but skipped — they stay queued until the
 * A2A marketplace join lands (Batch 4), then resubmit.
 *
 * Usage:
 *   npx tsx scripts/feedback_sync.ts [--agent-url http://localhost:3002] [--dry-run]
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

interface PendingEntry {
  id: number;
  pactId: string;
  party: string;
  okxAgentId: string | null;
  creatorAgentId: string;
  score: number;
  description: string | null;
  taskId: string | null;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const urlFlagIdx = args.indexOf("--agent-url");
const AGENT_URL = urlFlagIdx >= 0 ? args[urlFlagIdx + 1] : "http://localhost:3002";

async function main(): Promise<void> {
  console.log(`🔗 Feedback bridge → ${AGENT_URL}${dryRun ? " (dry run)" : ""}`);

  const res = await fetch(`${AGENT_URL}/feedback/pending`);
  const data = (await res.json()) as { pending: PendingEntry[]; total: number };
  console.log(`📋 ${data.total} pending review(s)`);

  const submitted: number[] = [];
  let skipped = 0;

  for (const entry of data.pending) {
    if (!entry.okxAgentId) {
      console.log(` ⏭️  #${entry.id} pact ${entry.pactId.slice(0, 10)}… — no OKX agent id (pre-A2A pact), stays queued`);
      skipped++;
      continue;
    }
    if (!entry.taskId) {
      console.log(` ⏭️  #${entry.id} agent #${entry.okxAgentId} — no OKX task id yet, stays queued`);
      skipped++;
      continue;
    }

    const cmdArgs = [
      "agent", "feedback-submit",
      "--agent-id", entry.okxAgentId,
      "--creator-id", entry.creatorAgentId,
      "--score", entry.score.toFixed(2),
      "--task-id", entry.taskId,
    ];
    if (entry.description) cmdArgs.push("--description", entry.description);

    if (dryRun) {
      console.log(` 🧪 [dry] onchainos ${cmdArgs.join(" ")}`);
      submitted.push(entry.id);
      continue;
    }

    try {
      const { stdout } = await exec("onchainos", cmdArgs, { timeout: 60_000 });
      console.log(` ✅ #${entry.id} agent #${entry.okxAgentId} submitted → ${stdout.trim().slice(0, 120)}`);
      submitted.push(entry.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ❌ #${entry.id} failed: ${msg.slice(0, 160)}`);
    }
  }

  if (submitted.length > 0) {
    await fetch(`${AGENT_URL}/feedback/acked`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: submitted }),
    });
    console.log(`✅ Acked ${submitted.length} submitted review(s)`);
  }
  console.log(`Done — ${submitted.length} submitted, ${skipped} skipped (waiting on A2A task ids)`);
}

main().catch(err => {
  console.error("feedback_sync failed:", err);
  process.exit(1);
});
