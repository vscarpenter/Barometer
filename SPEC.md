# Barometer — Design Spec

> Internet health monitor. A scheduled Lambda reads the public status of major cloud/network/AI providers,
> normalizes their formats into one schema, and serves a static dashboard that answers one question at a
> glance: **is the internet healthy right now?**

This is the single source of truth and the **one approval gate**. Once approved, build proceeds
spec → plan → implementation in a continuous pass (TDD, frequent commits), per the build order in §15.

---

## 1. Locked decisions

| Area | Decision |
|---|---|
| Language | TypeScript end to end. Shared schema in `packages/types`, consumed by engine and web. |
| Frontend | Vanilla TS + Vite. No framework runtime. Small render modules + a poll loop. |
| Alerts | Amazon SNS email only. Delivery sits behind a `Notifier` interface; Telegram is a future `Notifier` impl, not built in v1. |
| Domain | Custom domain `barometer.vinny.dev`. ACM cert in `us-east-1` + Route53 alias. Assumes the hosted zone already exists. |
| Providers (9) | AWS, Azure, GCP, Cloudflare, GitHub, Fastly, Anthropic, OpenAI, GitLab. |
| Check interval | 5 minutes (Terraform variable). |
| Retention | 48h high-resolution samples; 90 daily rollup buckets (Terraform variables). |
| Availability rule | `operational` = up. `degraded`/`partial_outage`/`major_outage` = down. `maintenance`/`unknown` excluded from the denominator. (Config knob.) |
| Tooling | Bun workspaces · esbuild (Lambda bundle) · Vite (web) · Vitest (tests) · zod (runtime validation) · Terraform (infra). |

---

## 2. Architecture & data flow

```
EventBridge Scheduler (every 5 min)
        |
        v
   Lambda (Barometer engine, Node 24)
        |  read prior state/history from S3   (single writer => no write races)
        |  fetch all providers concurrently   (capped, timeout + retries)
        |  normalize to common schema          (one provider failing => "unknown", run continues)
        |  detect transitions, debounce, alert
        |  update tiered history
        v
   S3 bucket (private; CloudFront OAC only)
     /status/current.json   latest snapshot          (cache 60s)
     /status/summary.json   headline + uptime windows (cache 60s)  <- frontend polls this
     /status/state.json     alert state machine       (internal; not served to UI)
     /history/recent.json   last 48h @ 5-min          (cache 60s)  <- frontend reads for sparklines
     /history/rollups.json  daily uptime, last 90d    (cache 60s)
     /app/...               built frontend, hashed    (immutable, 1y; index.html no-cache)
        |
        v
   CloudFront (OAC, HTTPS only, barometer.vinny.dev) ---> Browser
        ^
        |  frontend polls /status/summary.json every 60s (+ on tab refocus)
```

**Invariants (state these as code comments where they bite):**

- The scheduled Lambda is the **only writer** to `/status` and `/history`. No concurrent-write races on the JSON.
  The engine is stateless: it **reads** `state.json`, `recent.json`, `rollups.json` (and last `current.json` for
  conditional-GET reuse) from S3 at the start of each run, mutates them in memory, and writes them back.
- One provider failing must **never** fail the run. That provider is marked `unknown` and the run continues.
- File sizes are bounded by design: trim `recent.json` to 48h, cap `rollups.json` to 90 days every run.

---

## 3. Normalized data model (`packages/types`)

Every adapter returns this shape regardless of the provider's native format.

```ts
type ProviderStatus =
  | "operational"     // all good
  | "degraded"        // performance issues, still up
  | "partial_outage"  // some components down
  | "major_outage"    // significant outage
  | "maintenance"     // planned work
  | "unknown";        // could not determine (fetch failed, parse failed)

interface Incident {
  id: string;
  title: string;
  impact: "none" | "minor" | "major" | "critical";
  status: string;       // provider's incident lifecycle label, e.g. "investigating"
  startedAt: string;    // ISO 8601
  url: string;          // link to the provider's incident page
}

interface ProviderSnapshot {
  id: string;           // stable slug, e.g. "cloudflare"
  displayName: string;  // "Cloudflare"
  status: ProviderStatus;
  activeIncidents: Incident[];
  checkedAt: string;    // ISO 8601, when we fetched it
  sourceUrl: string;    // the status page or feed we read
}

interface OverallReading {
  status: ProviderStatus;     // worst-case aggregate (see §4)
  label: string;              // barometer-themed presentation label (see §9)
  providersOperational: number;
  providersTotal: number;
  generatedAt: string;        // ISO 8601
}
```

Each interface is mirrored by a **zod schema** in the same package. zod is the single definition; the TS
types are inferred from it (`z.infer`). Engine output is validated against these schemas in tests (contract test, §13).

---

## 4. Availability rule & aggregation (resolves brief ambiguities)

**Up/down classification** (the one knob that drives uptime math, alerting, and aggregation):

| Status | Class |
|---|---|
| `operational` | **up** |
| `degraded`, `partial_outage`, `major_outage` | **down** |
| `maintenance`, `unknown` | **excluded** (neither up nor down) |

- **Uptime %** over a window = `up / (up + down)`, excluding `maintenance`/`unknown` from the denominator.
  If the denominator is 0, uptime is `null` (UI shows "—", not "100%"). Planned work and our own fetch
  failures never punish a provider's score.

- **Overall severity ordering** (worst wins): `major_outage` > `partial_outage` > `degraded` > `operational`.
  `maintenance`/`unknown` do **not** worsen the headline (consistent with excluding them). `OverallReading.status`
  = the worst status among non-excluded providers; if none are worse than `operational`, it's `operational`;
  if **every** provider is excluded (e.g. total network failure), it's `unknown`.

- **Counts:** `providersTotal` = all configured providers. `providersOperational` = count with status exactly `operational`.

These rules live in `packages/types` (e.g. `availability.ts`) so engine and web agree.

---

## 5. Provider adapters

**Contract** — never throws; degrades to `unknown`:

```ts
interface ProviderAdapter {
  id: string;
  fetchSnapshot(): Promise<ProviderSnapshot>;  // catches everything; status "unknown" on any failure
}
```

**Typed config** (adding a provider is a one-line change):

```ts
interface ProviderConfig {
  id: string;
  displayName: string;
  type: "statuspage" | "aws" | "azure" | "gcp" | "custom";
  url: string;                 // status domain or feed URL
  componentFilter?: string[];  // optional, watch only specific components
}
```

Canonical provider list is a **typed file** in the engine (`providers.config.ts`), type-checked and compiled
into the bundle. An optional `BAROMETER_PROVIDERS_JSON` env var can override it at runtime (the Terraform
"provider list source" knob); default is the compiled-in list.

### 5.1 Statuspage adapter (one adapter, 6 providers)

Cloudflare, GitHub, Fastly, Anthropic, OpenAI, GitLab all run on Atlassian Statuspage. One parametrized
`StatuspageAdapter` reads `https://<status-domain>/api/v2/summary.json` (overall indicator + components +
active incidents) for all of them, fed base URLs from config.

Indicator → status mapping: `none`→`operational`, `minor`→`degraded`, `major`→`partial_outage`,
`critical`→`major_outage`. Refine with component states when `componentFilter` is set. Statuspage
`scheduled_maintenances` in progress → `maintenance`.

### 5.2 Bespoke adapters (AWS, Azure, GCP)

Each gets its own adapter isolating that provider's format and fragility. **Endpoints are verified by web
search at the start of the adapter phase** (§15 phase 4) — AWS/Azure/GCP have all changed their feeds before,
so we confirm the current machine-readable source before wiring, rather than hardcoding a guess here.
Starting points to verify (not assume): AWS Health Dashboard (`health.aws.amazon.com`) / historical RSS under
`status.aws.amazon.com`; Azure Status (`status.azure.com`) RSS; GCP (`status.cloud.google.com`) incidents JSON.
If no clean machine-readable source exists for one, fall back to scraping that provider's HTML page only,
isolated inside its adapter. Each bespoke adapter ships with recorded fixtures (healthy + active-incident).

### 5.3 Fetch behavior (shared HTTP client)

- Concurrent fetches across providers, capped (default 6).
- Per-request timeout (default 5s); 2 retries with exponential backoff.
- Descriptive `User-Agent`: `Barometer/1.0 (+https://barometer.vinny.dev)`.
- Conditional GET: when a prior `ETag` is known for a source (persisted in `state.json`), send `If-None-Match`;
  a `304` reuses the previous snapshot for that provider (read from last `current.json`). Graceful fallback to
  full GET. Politeness optimization, not correctness-critical.
- Catch everything. A thrown adapter degrades to `unknown`; it never crashes the run.

---

## 6. Storage layout — JSON file schemas

`/status/current.json`
```jsonc
{ "generatedAt": "ISO", "overall": OverallReading, "providers": ProviderSnapshot[] }
```

`/status/summary.json`  ← the file the frontend polls
```jsonc
{
  "overall": OverallReading,
  "providers": [{
    "id": "cloudflare", "displayName": "Cloudflare", "status": "operational",
    "activeIncidents": Incident[], "checkedAt": "ISO", "sourceUrl": "...",
    "uptime": { "24h": 99.97, "7d": 99.9, "30d": 99.8, "90d": 99.5 }  // numbers or null
  }],
  "generatedAt": "ISO"
}
```

`/status/state.json`  (internal; not served to UI)
```jsonc
{
  "providers": {
    "<id>": {
      "alertState": "operational" | "alerting",
      "triggeringStatus": ProviderStatus | null,  // the down status that set the active alert
      "pendingStatus": ProviderStatus | null,      // latest status in the streak being counted
      "consecutiveCount": 0,                        // consecutive same-class samples in the streak
      "lastTransitionAt": "ISO",
      "etag": "..." | null                          // last ETag for conditional GET
    }
  },
  "updatedAt": "ISO"
}
```

`/history/recent.json`  (last 48h @ 5-min, trimmed every run)
```jsonc
{ "samples": [ { "t": "ISO", "s": { "<id>": "operational" /* ProviderStatus */ } } ] }
```

`/history/rollups.json`  (last 90 daily buckets)
```jsonc
{ "days": [ { "date": "YYYY-MM-DD", "providers": { "<id>": { "up": 288, "down": 0 } } } ] }
```

**Cache-Control:** status + history JSON = `max-age=60`. Hashed `/app` assets = `max-age=31536000, immutable`.
`index.html` = `no-cache` so deploys are picked up. `state.json` is internal (UI never fetches it).

---

## 7. Engine behavior per run

1. Read config; instantiate adapters. Read `state.json`, `recent.json`, `rollups.json`, last `current.json` from S3.
2. Fetch all snapshots concurrently (capped). Each adapter returns a `ProviderSnapshot` (`unknown` on failure).
3. Build current snapshot; compute `OverallReading` (§4); write `status/current.json`.
4. Update history:
   - Append a compact sample to `recent.json`; trim entries older than 48h.
   - Update today's bucket in `rollups.json` (per-provider up/down counts using §4 classes); cap to 90 days.
5. Recompute `summary.json`: per-provider current status, active incidents, uptime for 24h (from `recent.json`),
   7d/30d/90d (from `rollups.json` + today's partial bucket), plus the overall reading.
6. Run the alert state machine (§8); write `state.json`.
7. Emit structured JSON logs + custom metrics (§11). Emit `RunSuccess=1` on completion.

**Dry-run mode:** a local entry point runs steps 1–6 against the network but prints the resulting `summary.json`
to stdout — no S3 writes, no alerts. (Reads can be stubbed with fixtures for fully offline runs.)

---

## 8. Alerting state machine

Alert on **transitions only**, never repeatedly while a provider stays down. Debounce threshold = 2 consecutive
samples (config knob). Applied **symmetrically** to trigger and recovery to kill flapping.

Debounce works on the **class** (up / down / hold), not the exact status, so a worsening outage
(`degraded`→`major_outage` across two checks) still alerts on the second check while single blips are filtered.
Classes (§4): `operational` = **up**; `{degraded, partial_outage, major_outage}` = **down** (alertable);
`maintenance`/`unknown` = **hold** — they do not trigger, do not count as recovery, and reset the active
streak, so planned work and transient fetch failures generate no alert noise.

| Current alertState | Incoming class | Action |
|---|---|---|
| operational | up | reset streak; stay operational |
| operational | down (streak already down) | `consecutiveCount++`; `pendingStatus`=incoming; if ≥2 → **send outage alert** (latest down status), alertState=alerting, `triggeringStatus`=incoming, reset streak |
| operational | down (streak not yet down) | start streak: `pendingStatus`=incoming, count=1 |
| operational | hold | reset streak; stay operational |
| alerting | up (streak already up) | `consecutiveCount++`; if ≥2 → **send recovery notice**, alertState=operational, reset streak |
| alerting | up (streak not yet up) | start recovery streak: count=1 |
| alerting | down | stay alerting; **no re-alert** (no spam); reset recovery streak |
| alerting | hold | stay alerting; reset recovery streak |

Outage alert payload: provider name, new status, active incident title, incident URL. Recovery: single notice.
Delivery via a `Notifier` interface; v1 implements `SnsNotifier`. (No-op/console notifier used in dry-run.)

---

## 9. Frontend (Vanilla TS + Vite)

Static dashboard polling `status/summary.json` every 60s and on tab refocus; reads `history/recent.json` for sparklines.

**Headline reading** — prominent barometer-style band mapped from `OverallReading.status` (raw enum stays in data; label is presentation-only):

| status | label |
|---|---|
| `operational` | "Fair — all clear (high pressure)" |
| `degraded` | "Changeable" |
| `partial_outage` | "Unsettled" |
| `major_outage` | "Stormy" |
| `unknown` | "Reading unavailable" (instrument fault — usually paired with the stale banner) |

**Provider cards** — responsive grid. Each: name, color-coded status (green/amber/red), active incident title if
any, and a small sparkline of recent status. **Color is never the only signal** — every status pairs color with an
icon and a text label. Target WCAG AA contrast.

**Behavior:** "updated Xs ago" indicator. **Stale-data guard:** if `summary.json`'s `generatedAt` is older than
15 minutes, show a clear banner that the engine may be down (makes a dead Lambda visible instead of silently
serving stale green). Graceful empty + error states.

**Theming:** all colors/fonts/spacing come from design tokens (CSS custom properties) so the palette can be
swapped later without touching components. Frontend styling direction comes from the `impeccable` /
`modern-web-guidance` skills at the start of the frontend phase — it must not read as a default template.

---

## 10. Infrastructure (Terraform, least-privilege)

Composable modules; no wildcard IAM.

- **storage** — one S3 bucket, public access blocked, served only via CloudFront OAC. Prefixes `/app`,
  `/status`, `/history`. Bucket policy grants the CloudFront distribution `s3:GetObject` (conditioned on the
  distribution ARN). Optional lifecycle rules.
- **cdn** — CloudFront with OAC, HTTPS-only (redirect), default behavior → `/app` (SPA), short-TTL behaviors
  for `/status/*` and `/history/*`. Custom domain `barometer.vinny.dev`; ACM cert in **us-east-1** (aliased
  provider) with Route53 DNS validation + alias record.
- **engine** — Lambda (Node 24, esbuild bundle), env vars for config, CloudWatch log group. Execution role
  (least-privilege): `s3:GetObject`+`s3:PutObject` on **only** `/status/*` and `/history/*` of the bucket;
  `sns:Publish` on **only** the one topic ARN; `cloudwatch:PutMetricData` conditioned on the `Barometer`
  namespace; standard logs.
- **schedule** — EventBridge Scheduler, rate = `var.check_interval_minutes` (default 5), with a role that may
  `lambda:InvokeFunction` only the engine function.
- **alerting** — SNS topic + email subscription (`var.alert_email`).
- **monitoring** — "watch the watcher": CloudWatch alarms on the Lambda's `Errors` and on the custom
  `RunSuccess` metric (missing/`0` for N periods → breaching). Alarm actions → the SNS topic.

**Variables:** `check_interval_minutes`, `provider_config_json` (override), `retention_recent_hours` (48),
`retention_rollup_days` (90), `domain_name` (`barometer.vinny.dev`), `route53_zone_id`, `alert_email`,
plus `telegram_enabled` reserved (flag only; delivery not built in v1).

---

## 11. Observability & cost

- Structured JSON logs: per-provider fetch outcome (status, latency, retries), run duration, adapter failures.
- Custom CloudWatch metrics (namespace `Barometer`): run duration, per-provider fetch success/failure,
  count of providers in each status, `RunSuccess`.
- Meta-monitoring alarm (§10) closes the loop so a broken Barometer alerts rather than failing quietly.
- **Expected cost: a few dollars/month at most.** ~8.6k Lambda invocations/month (tiny/short), ~tens of
  thousands of small S3 PUTs, minimal CloudFront traffic, SNS within free tier. README documents this.

---

## 12. Testing strategy (no network in tests)

| Test | Asserts |
|---|---|
| Statuspage adapter | Recorded fixtures (healthy, active incident, maintenance) → correct normalized output + indicator mapping. |
| AWS/Azure/GCP adapters | Recorded fixtures of each real format → normalized output; malformed payload → `unknown`. |
| Contract | Every adapter's output validates against the `ProviderSnapshot` zod schema. |
| State machine | Debounce (2-sample), no-re-alert during sustained outage, single recovery, hold-state handling. |
| Uptime math | Window calcs + availability rule against known sample histories (incl. null/empty denominators). |
| Aggregation | Overall severity ordering + maintenance/unknown exclusion. |
| Dry-run | Full fetch+normalize prints `summary.json`; no S3 writes, no alerts. |

Fixtures are recorded real responses in `packages/engine/fixtures/`. Runtime validation via zod.

---

## 13. Repository structure

```
barometer/
  packages/
    types/         shared zod schemas + inferred types + availability rule
    engine/        Lambda: http client, adapters, normalizer, history, alerting, notifier, s3 store
      adapters/    statuspage.ts, aws.ts, azure.ts, gcp.ts
      fixtures/    recorded sample responses for tests
    web/           Vite frontend (tokens, headline, cards, sparkline, poll loop, stale guard)
  infra/           Terraform modules (storage, cdn, engine, schedule, alerting, monitoring) + root
  SPEC.md          this document
  README.md        setup, deploy, configuration, cost notes, teardown
```

Bun workspaces. `packages/types` is the shared dependency of `engine` and `web`.

---

## 14. Module boundaries (isolation)

- `types`: pure schemas + availability/aggregation helpers. No I/O. Depended on by everything.
- `engine/http`: fetch with timeout/retry/UA/conditional-GET. No provider knowledge.
- `engine/adapters/*`: each takes config + http client, returns a `ProviderSnapshot`, never throws.
- `engine/normalize` + `engine/aggregate`: build current snapshot + overall reading from snapshots.
- `engine/history`: pure transforms over `recent.json`/`rollups.json` (append, trim, rollup, uptime windows).
- `engine/alerting`: pure state-machine transition fn (old state + new snapshots → new state + notifications).
- `engine/notifier`: `Notifier` interface + `SnsNotifier` + console notifier.
- `engine/store`: S3 read/write of the JSON files (the only I/O boundary to storage).
- `engine/run`: orchestrates a run; `engine/dryrun`: local entry calling the same orchestration sans writes/alerts.

Pure cores (history, alerting, aggregate, normalize) are unit-tested without I/O; `store`/`http`/`notifier`
are the thin I/O edges.

---

## 15. Build order (continuous pass after spec approval)

1. **Spec** — this document. ← approval gate
2. **Types & config** — zod schemas, inferred types, availability rule, typed provider config (9 providers).
3. **Statuspage adapter + http client** — fixtures + tests; prove the pattern on Cloudflare/GitHub/Fastly.
4. **Bespoke adapters** — verify AWS/Azure/GCP endpoints by web search, then build each with fixtures + tests.
5. **Engine assembly** — concurrency, current snapshot, history tiers, summary computation, store, dry-run.
6. **Alerting** — state machine + debounce + `SnsNotifier`.
7. **Frontend** — tokens, headline, cards, sparklines, stale guard (consult frontend skills first).
8. **Terraform** — storage, cdn (OAC + custom domain), engine, schedule, alerting, monitoring.
9. **README & deploy** — end-to-end deploy + teardown.

Each phase: TDD, verify, commit.

---

## 16. Definition of done

- Scheduled Lambda fetches all 9 providers, normalizes, writes the data files to S3.
- CloudFront serves the dashboard at `barometer.vinny.dev`: overall reading + per-provider status + recent
  history, and warns when data is stale.
- One provider failing degrades only that provider; the run never breaks.
- Alerts fire on transitions only, with 2-sample debounce + single recovery, via SNS email.
- Terraform stands the stack up from scratch and tears it down cleanly, least-privilege throughout.
- Tests pass with no network access. Dry-run prints `summary.json` locally.
- README documents configuration, the availability rule, deploy steps, expected low cost, and teardown.

---

## 17. Assumptions & open items

- `barometer.vinny.dev` Route53 hosted zone exists in the target AWS account (cert + alias depend on it).
- AWS/Azure/GCP endpoints confirmed in phase 4; HTML-scrape fallback only if no machine-readable source exists.
- Telegram is out of scope for v1 (flag reserved); SNS email is the only channel.
- Alerting ignores `maintenance`/`unknown` and does not escalate within the down class (no re-alert on
  `degraded`→`major_outage`) — matches "no spam." Flagged here in case you want escalation later.
- Sparkline window is a frontend constant (default: last 24h of `recent.json`).
