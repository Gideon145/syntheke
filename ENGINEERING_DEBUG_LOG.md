# Engineering Debug Log — Syntheke

Real problems encountered while building Syntheke for the OKX X Layer Build X Series (AI Season),
and how they were solved. Judges: this is the unfiltered development record.

---

## 1. Breach cure-deadline kept resetting (contract bug, fixed in Batch 5)

**Problem:** In `SynthekeContract.recordAttestation`, every new breach attestation called
`_classifyAndEscalateBreach`, which re-set `cureDeadline = block.number + breachGraceBlocks`.
A persistently breaching pact therefore never reached arbitration — the grace clock restarted
every attestation.

**Root cause:** The classification helper unconditionally (re)set the deadline on every breach
classification.

**Fix:** Guarded with `if (p.cureDeadline == 0)` so the deadline is set exactly once; the heal
branch in `recordAttestation` was additionally wrapped in `block.number <= cureDeadline` and
clears the deadline on heal. Added 5 dedicated Forge tests
(`contracts/test/LifecycleFixes.t.sol`) — suite now 48/48.

**Verification:** `forge test` — `test_PersistentBreachDoesNotResetCureDeadline`,
`test_HealAfterDeadlineDoesNotAutoRecover`.

## 2. Treaty subject metadata vanished after every deploy

**Problem:** DEX/SLA/monitoring subject labels were held in an in-memory `Map`. Every agent
redeploy lost them, and the prod dashboard fell back to "🤝 General treaty" — caught during
prod verification of the DEX pact.

**Root cause:** Metadata written at creation time was never persisted; the pact that demonstrated
the feature had been created while the local agent was in memory-only mode (no DB).

**Fix:** Added a `syntheke_pact_subjects` Postgres table (`savePactSubject`/`loadPactSubjects`),
persisted subjects at creation, and added a boot-time backfill (`restorePactSubjects`) that
derives missing subjects from stored contract prose. Backfilled the two existing pacts directly.

**Verification:** fresh agent boot with DB → `GET /pacts/:id` returns `subject:"dex"` without
recreating the pact.

## 3. x402 payment counter reset to zero on every redeploy

**Problem:** The dashboard's "x402 Payments" card read an in-memory `paymentsLog`, so every
Railway deploy showed `0 settled` despite real paid settlements.

**Fix:** The `/payments` endpoint now reads the **on-chain treasury balance** of TestUSDC3009 as
the authoritative source (count = balance ÷ 1.0 TUSD9 price), with the DB activity log as a
fallback floor. Evaluator settlements now also write `x402_payment` activity rows.

**Verification:** on-chain `balanceOf(agent wallet) = 3,000,000` → dashboard shows **3 settled**,
matching the actual paid calls (premium + evaluator tests).

## 4. Nonce races between the monitor and one-shot transactions

**Problem:** The 15-second monitor shares the owner wallet with pact creation, escrow deposits,
artifact recording and x402 settlement relays. Concurrent sends produced nonce collisions and
dropped transactions during deploys.

**Fix:** All one-shot sends go through retry wrappers (`sendWithRetry`, `sendOwnerTx`) that
re-read the chain nonce up to 6 times; the monitor re-syncs its nonce every 5th cycle; deploys
stop the local monitor first.

**Verification:** Batch deploys completed without a single nonce-failed production transaction.

## 5. EIP-3009 signature format from the OnchainOS CLI

**Problem:** The OKX `payment pay-local` flow returns a **single 65-byte signature**, while our
first implementation expected separate `v, r, s` fields; forged ABI artifacts also failed to
load in ethers v6 with their full `abi/bytecode` wrapper.

**Fix:** Split the 65-byte signature server-side into r/s/v before relaying
`transferWithAuthorization`; strip Forge artifacts to the bare `abi` array before import.

**Verification:** Paid evaluator call returned `paid:true` with votes committed + revealed
on-chain; EIP-3009 replay-protection covered by `test_EIP3009_ReplayReverts`.

## 6. Railway Postgres access from a local machine

**Problem:** `railway connect postgres` requires a local `psql`, and the local agent's
`DATABASE_URL` pointed at a proxy that wasn't running — every local boot fell back to memory-only
mode, which hid persistence bugs (see #2).

**Fix:** Verified DB-dependent behavior by creating a **temporary** Railway TCP proxy for the
Postgres service, testing, then deleting the proxy immediately.

**Verification:** the subject backfill was validated against the production database before
deploy, without leaving any public proxy behind.

## 7. Next.js dev server broke after every production build

**Problem:** Running `vercel --prod` left stale vendor chunks in `.next`, so the local dev server
served `Cannot find module './vendor-chunks/next.js'` until the cache was cleared.

**Fix:** `Remove-Item .next -Recurse -Force` before restarting local dev (documented in the dev
workflow).

**Verification:** pact pages render locally after each prod build.
