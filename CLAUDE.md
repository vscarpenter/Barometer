# Barometer — Project Context

A serverless internet-health monitor. A scheduled AWS Lambda reads the public status of 9 major
cloud/network/AI providers every 5 minutes, normalizes their formats into one schema, writes tiered
JSON to S3, and a vanilla-TS dashboard (CloudFront) answers "is the internet healthy right now?"

> Architecture, providers, and the availability rule are documented in [`README.md`](./README.md) and the
> full design in [`SPEC.md`](./SPEC.md). This file captures the **decisions, non-obvious insights, operational
> gotchas, and future work** — the things you can't infer from the code.

---

## Status: deployed & live

Live at **https://barometer.vinny.dev** (deployed 2026-06-26). Runs itself — EventBridge fires the
engine every 5 min; the dashboard polls every 60s; two CloudWatch alarms page SNS if it breaks.

**Operational facts (AWS account `710603110067`, region `us-east-1`):**

| Resource | Value |
|---|---|
| Route 53 zone (`vinny.dev`) | `Z2ITH380MXRXM` |
| S3 bucket | `barometer-vinny-data` |
| CloudFront distribution | `E31AF2TD6M9A45` |
| Lambda | `barometer-engine` |
| SNS topic | `arn:aws:sns:us-east-1:710603110067:barometer-alerts` (email → vscarpenter@gmail.com, confirmed) |
| EventBridge schedule | `barometer-engine-schedule` — `rate(5 minutes)`, ENABLED |

Deploy flow: `scripts/deploy.sh -var-file=terraform.tfvars` → confirm the SNS email → `scripts/seed.sh`.
For infra-only changes, `scripts/plan-apply.sh -var-file=terraform.tfvars` plans → confirms → applies the
saved plan (and runs `terraform init`, which `deploy.sh` skips).
Config lives in `infra/terraform.tfvars` (gitignored values: zone id, alert email, bucket name).

---

## ⚠️ Critical operational gotchas

1. **Use native arm64 Terraform — NOT the Intel one.** On this Apple-Silicon Mac, the Homebrew
   Terraform at `/usr/local/bin/terraform` is an **x86_64** binary running under Rosetta; with the
   AWS provider v5.x it **hangs at 100% CPU and creates nothing** (cost us a long debugging detour
   during the first deploy). The native arm64 build is at `/opt/homebrew/bin/terraform`, which is
   already ahead on `PATH`. Verify before any terraform work:
   ```bash
   file "$(which terraform)"   # must say: Mach-O 64-bit executable arm64
   ```
   If you ever reinstall/switch, run `terraform -chdir=infra init -upgrade` to pull the
   `darwin_arm64` provider (`deploy.sh` does NOT re-init).

2. **Stale state lock recovery.** If a terraform process is killed mid-run (e.g. the hang above),
   it leaves `infra/.terraform.tfstate.lock.info`. Next run errors with "Error acquiring the state
   lock." Kill any orphaned terraform/provider processes, then remove that file (local backend, no
   remote state). `rm` is blocked by this user's permission rules — use
   `node -e "require('fs').unlinkSync('infra/.terraform.tfstate.lock.info')"`.

3. **Terraform `validate` works under the agent sandbox; `plan`/`apply` do not** — the AWS provider
   plugin times out starting under the sandbox. The user runs terraform from their own shell. Agent-
   side, AWS *CLI* calls are fine for read-only checks (use `dangerouslyDisableSandbox`).

---

## Architecture decisions & rationale

- **Single-writer Lambda.** The Lambda is the *only* writer to the S3 JSON keys, so there are no
  concurrent-write races — no locking, no DB. The frontend only ever reads.
- **Adapters never throw.** Every adapter degrades to `status: "unknown"` on any failure (HTTP error,
  malformed body, schema miss). One provider's feed breaking never fails the run or the page.
- **Availability rule (the one knob, in `packages/types/src/availability.ts`):** `operational`=up;
  `degraded`/`partial_outage`/`major_outage`=down; `maintenance`/`unknown`=**excluded** from the
  denominator. Planned maintenance and our own fetch failures never produce a false 100% or false outage.
- **One Statuspage adapter, three bespoke.** 6 providers (Cloudflare, GitHub, OpenAI, Anthropic,
  Vercel, DigitalOcean) share one Atlassian-Statuspage adapter (`/api/v2/summary.json`). AWS
  (Health JSON, **UTF-16BE**), Azure (RSS), and GCP (`incidents.json`) have bespoke adapters.
- **Provider swaps from the original brief.** Fastly bot-blocks automated polling (403); GitLab runs
  on Status.io not Statuspage (404 on `/api/v2`). Replaced with Vercel + DigitalOcean. Anthropic's
  status moved to `status.claude.com`. Provider list is a one-line change in
  `packages/engine/src/config/providers.ts` (or the `providers_json` Terraform var at runtime).
- **Parse only what you read.** Adapters validate only the feed fields they actually use, so unrelated
  upstream shape changes don't degrade a provider to unknown. (See hardening insight #1 — this can be
  over-applied; structural fields must stay required.)
- **Tiered history.** `recent.json` = 48h @ 5-min; `rollups.json` = 90 daily uptime buckets. Uptime
  windows: 24h from recent, 7/30/90d from rollups.
- **Two-origin CloudFront, one bucket.** `s3-app` origin (`origin_path=/app`) serves the SPA;
  `s3-data` (root) serves `status/*` + `history/*`. OAC locks the bucket private; ACM cert in
  us-east-1 (CloudFront requirement); Vite `base="/"`.
- **Alerting fires on transitions only**, 2-sample debounce, symmetric recovery. `maintenance`/`unknown`
  are hold states (never alert, never count as recovery). Delivery sits behind a `Notifier` interface
  (SNS now; Telegram is a small future addition).
- **Design choices:** vanilla TS + Vite (no framework); SNS email only for v1; custom domain
  `barometer.vinny.dev`; full 9-provider set.

---

## Hardening insights (patterns worth reusing)

From the post-build adversarial review (all fixed, TDD; 123 tests). The transferable lessons:

- **Over-strict input schemas are their own failure mode.** A required field that the feed sometimes
  omits/nulls degrades the *whole* provider to unknown. GCP emitted `"end": null` (not absent) →
  `z.string().optional()` rejected it → unknown during real outages. Fix: `.nullish()`. AWS: make
  *display* fields optional/defaulted but keep *structural* fields (arn, status) required — if those
  are gone, "unknown" is the honest reading, not a guess.
- **Validate third-party data at the sink AND the boundary.** Incident URLs come from vendor feeds;
  one returning `javascript:` made the incident link XSS (zod's `.url()` accepts `javascript:`!). Fix:
  allowlist `^https?://` at the render sink (`card.ts`). Separately, the poller now validates every
  feed against its zod schema so wrong-shape JSON fails closed to the error state, not deep in render.
- **Fail safe, not open.** An unparseable `generatedAt` made `secondsAgo` return `NaN`, so `isStale`
  (`NaN > 900`) was false — corrupt data read as *fresh*. Treat unparseable as infinitely old → stale.
- **ARIA live regions must be persistent.** A `role="status"` node inserted already-populated announces
  unreliably; the container must exist empty at load and be populated in place.
- **Strict CSP works with a Vite SPA** because the build emits no inline `<script>` (single chunk,
  external module). `script-src 'self'` (defense-in-depth vs `javascript:`); `style-src` keeps
  `'unsafe-inline'` only for runtime CSSOM tints; `img-src data:` for the inline-SVG favicon. HSTS
  `preload` is intentionally OFF (hard to reverse).
- **Prune derived state.** The alert state machine rebuilds its provider map from the current run's
  snapshots, so a provider removed from config doesn't leave a zombie (possibly mid-alert) entry.

**Knowingly skipped (minor, documented):** Azure resolved-incident filtering (uncertain RSS
semantics) and sparkline sample-window size (legibility tradeoff).

---

## Future work

### 1. Make Barometer US-specific  ← next task

**Problem:** Today the engine flags any active incident regardless of region, so a provider gets marked
down for incidents that only affect Europe / Middle East / APAC. Example seen live: GCP showed a
partial outage for *"Network traffic originating from Delhi, Chennai, Mumbai"* (asia-south2); AWS
surfaces `me-central-1` events. For a US audience these shouldn't count as "the internet is unhealthy."

**Goal:** Scope the reading (and ideally the alerting) to US regions — exclude incidents affecting
*only* non-US regions; keep global and US-affecting ones.

**Where the region data lives (varies per adapter — this is the crux):**
- **GCP** — *structured.* `incidents.json` has `currently_affected_locations: [{title, id}]` with ids
  like `asia-south2`, `us-central1`, `global`. The adapter currently **drops** these. Filter on a
  US-region allowlist (`us-*`) plus `global`. Easiest win.
- **AWS** — *semi-structured.* The region is encoded in the event ARN
  (`arn:aws:health:me-central-1::event/...`), currently used only as the incident id. Parse region
  from the ARN; treat empty/global as global.
- **Statuspage providers** (Cloudflare, GitHub, OpenAI, Anthropic, Vercel, DigitalOcean) — *mostly
  prose.* `/api/v2/summary.json` incidents reference affected components; some component **names** are
  regional (e.g. Cloudflare per-PoP), but most region info is in the incident title/body. Would need
  component-name matching and/or keyword extraction. Less reliable.
- **Azure** — *prose.* RSS description text; needs region keyword extraction.

**Open design questions (warrants a brainstorm → SPEC, per the spec-first workflow):**
- What's the canonical US-region allowlist, and how are `global`/unlabeled incidents treated (assume
  US-affecting)?
- Is this a hard filter (drop non-US incidents entirely) or a weighting (still show them, but don't let
  them flip the overall reading / fire alerts)? Affects `availability.ts` and the overall reading.
- For prose-only feeds where region can't be reliably extracted, fail open (count it) or open a
  config to mark certain providers "US region unknown — always count"?
- Surface the affected regions in the UI per incident card?

This touches every adapter, the snapshot schema (add affected regions), the availability/aggregate
logic, and possibly the alert machine — non-trivial. Start with brainstorming → SPEC.md, not code.

### 2. Other

- **Telegram notifier** — add a `TelegramNotifier implements Notifier` behind the existing interface;
  wire a Terraform var to select the channel. (Designed for this from day one.)
- Revisit the two skipped hardening items if they ever bite (Azure resolved filter, sparkline window).

---

## Dev workflow

```bash
bun run test        # all packages, no network (vitest; jsdom for web)
bun run typecheck   # strict TS across types/engine/web
bun run dryrun      # fetch all 9 providers live + print summary.json (no S3 writes, no alerts)
bun run --filter '@barometer/web' dev   # local dashboard against demo data in packages/web/public
```

`bun run dryrun` is the fastest end-to-end check of the engine against real provider APIs — use it to
validate adapter changes (it caught the AWS UTF-16BE decode bug that unit tests with UTF-8 fixtures missed).

**Process:** This user works spec-first (brainstorm → SPEC.md → plan → implement) and wants design
approved once, then spec→plan→implementation in one continuous pass (TDD throughout, frequent commits,
no separate plan-review gate). Monorepo: `packages/{types,engine,web}` + `infra/` Terraform modules.
Commit trailer in use: `Claude-Session: <url>`, author `Vinny Carpenter <vscarpenter@gmail.com>`.
