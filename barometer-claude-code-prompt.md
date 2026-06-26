# Build Prompt: Barometer (Internet Health Monitor)

> Paste this whole document into Claude Code as the project brief. It is written as instructions to you, the agent. Work spec-first: produce `SPEC.md` and confirm the design before writing implementation code.

## 1. What we are building

**Barometer** is a small, serverless web application that periodically reads the public status of major cloud and network providers, normalizes their wildly different formats into one schema, and serves a clean dashboard that answers a single question at a glance: is the internet healthy right now?

The name is the design language. A barometer reads pressure changes before the storm arrives, so the dashboard should feel like a weather station for the internet. Lead with an overall reading, then show per-provider detail.

Design philosophy for this build:

- Spec-driven. Define the data model and the provider adapter contract before implementing anything.
- Lean and serverless. No servers to patch, no idle cost. The whole thing should run for a few dollars a month.
- Modular adapters. Adding or removing a provider should be a config change plus, at most, one small module.
- Static-first. The frontend reads static JSON from S3 through CloudFront. No API Gateway.

## 2. Tech stack

- **Language: TypeScript end to end.** The Lambda and the frontend share one normalized schema from a common `types` package. This is a deliberate DRY choice. Swap points are called out below if a different language is preferred.
  - Lambda swap: the adapter contract is language-agnostic. Go (with `gofeed` for RSS) or Python (with `httpx` and `feedparser`) are clean alternatives. If swapping, keep the same schema and config shape.
- **Backend: AWS Lambda**, Node 20 runtime, bundled with `esbuild` or `tsup`. Note that Lambda already runs every invocation inside a Firecracker microVM, so the microVM isolation is built in. No separate service is needed.
- **Schedule: Amazon EventBridge Scheduler**, fixed rate of 5 minutes. Make the rate a Terraform variable.
- **Frontend: Vite plus TypeScript**, no heavy framework required for a polling dashboard. React is acceptable if it makes the component model cleaner, but keep dependencies minimal and the bundle small.
- **Storage and delivery: Amazon S3 plus CloudFront.** One bucket holds the built frontend and the data JSON under separate prefixes. CloudFront uses Origin Access Control, not the legacy Origin Access Identity.
- **Alerting: Amazon SNS** as the default, with an optional Telegram webhook path behind a feature flag.
- **Infrastructure: Terraform.** Clean modules, least-privilege IAM, no wildcard policies.

## 3. Architecture and data flow

```
EventBridge Scheduler (every 5 min)
        |
        v
   Lambda (Barometer engine)
        |  fetch all providers concurrently
        |  normalize to common schema
        |  detect state transitions, debounce, alert
        |  maintain history (tiered JSON)
        v
   S3 bucket
     /status/current.json   (latest snapshot, short cache)
     /status/summary.json   (headline reading + uptime windows, short cache)
     /status/state.json     (alert state machine, internal)
     /history/recent.json   (last 48h at 5-min resolution)
     /history/rollups.json  (daily uptime rollups, last 90 days)
     /app/...               (built frontend assets, long cache, hashed)
        |
        v
   CloudFront (OAC) ---> Browser
        ^
        |  frontend polls /status/summary.json every 60s
```

Key properties:

- A single scheduled Lambda is the only writer to the data prefix, so there are no concurrent-write races on the JSON files. State this assumption in code comments.
- One provider failing must never fail the run. Mark that provider `unknown` and continue.
- Cache-Control matters. `current.json` and `summary.json` get a short max-age, around 30 to 60 seconds. Built assets use content hashing and a long max-age.

## 4. Normalized data model

Define this in the shared `types` package. Every adapter must return data in this shape regardless of the provider's native format.

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
  status: string;        // provider's incident lifecycle label, e.g. "investigating"
  startedAt: string;     // ISO 8601
  url: string;           // link to the provider's incident page
}

interface ProviderSnapshot {
  id: string;            // stable slug, e.g. "cloudflare"
  displayName: string;   // "Cloudflare"
  status: ProviderStatus;
  activeIncidents: Incident[];
  checkedAt: string;     // ISO 8601, when we fetched it
  sourceUrl: string;     // the status page or feed we read
}

interface OverallReading {
  status: ProviderStatus;        // worst-case aggregate across providers
  label: string;                 // barometer-themed, see section 8
  providersOperational: number;
  providersTotal: number;
  generatedAt: string;           // ISO 8601
}
```

`summary.json` combines `OverallReading` with, per provider, the current status, active incidents, and uptime percentages for the 24h, 7d, 30d, and 90d windows.

**Availability rule for uptime math (make this a config knob):** count `operational` as up. Count `degraded`, `partial_outage`, and `major_outage` as down. Treat `maintenance` and `unknown` as excluded from the denominator by default so planned work and our own fetch failures do not punish a provider's score. Document this clearly.

## 5. Provider adapters

This is the most important architectural decision, so get it right.

**Most providers run on Atlassian Statuspage**, which exposes a stable JSON API at `https://<status-domain>/api/v2/summary.json` (and `/api/v2/status.json`). That single endpoint returns an overall indicator plus components plus active incidents. This means one parametrized `StatuspageAdapter` covers Cloudflare, GitHub, Fastly, and many others. Build that adapter once and feed it base URLs from config.

Statuspage indicator mapping: `none` to `operational`, `minor` to `degraded`, `major` to `partial_outage`, `critical` to `major_outage`. Refine using component states if needed.

**The big three clouds use bespoke formats** and need custom adapters: AWS, Azure, and GCP.

> Verify these endpoints at build time. AWS, Azure, and GCP have all changed their status feeds before, so do not trust a hardcoded guess. Use web search and confirm the current, working source before wiring it in. Starting points to verify, not to assume:
> - AWS: the AWS Health Dashboard at `health.aws.amazon.com`. Historically there were per-service RSS feeds under `status.aws.amazon.com`. Confirm what is current and machine-readable today.
> - Azure: Azure Status at `status.azure.com`, which has historically offered an RSS feed. Confirm the current feed URL and format.
> - GCP: Google Cloud Status at `status.cloud.google.com`, which has historically published an incidents JSON. Confirm the current JSON endpoint.
>
> If a clean machine-readable source does not exist for one of these, fall back to scraping the HTML status page for that provider only, and isolate that fragility inside its adapter.

**Adapter contract:**

```ts
interface ProviderAdapter {
  id: string;
  fetchSnapshot(): Promise<ProviderSnapshot>;  // never throws; returns status "unknown" on failure
}
```

**Provider config** lives in one typed file so adding a provider is a one-line change:

```ts
interface ProviderConfig {
  id: string;
  displayName: string;
  type: "statuspage" | "aws" | "azure" | "gcp" | "custom";
  url: string;                 // status domain or feed URL
  componentFilter?: string[];  // optional, to watch only specific components
}
```

**Starting provider list** (edit freely):

- AWS, Azure, GCP, Cloudflare, GitHub, Fastly.
- Suggested additions given the agent and AI context: Anthropic (`status.anthropic.com`) and OpenAI (`status.openai.com`), both on Statuspage, so they cost nothing extra to add.
- A DNS or CDN provider is worth including for breadth. GitLab (`status.gitlab.com`) is also a one-line add since it is Statuspage-based.

**Fetch behavior for every adapter:**

- Concurrent fetches across providers with a sane concurrency cap.
- Per-request timeout, a couple of retries with exponential backoff.
- A descriptive `User-Agent` that identifies Barometer.
- Use conditional GET with `ETag` and `If-None-Match` where the source supports it, to be a polite client.
- Catch everything. A thrown adapter must degrade to `unknown`, not crash the run.

## 6. Engine (Lambda) behavior per run

1. Load provider config, instantiate adapters.
2. Fetch all snapshots concurrently.
3. Build the current snapshot and write `status/current.json`.
4. Compute the `OverallReading` (worst-case aggregate, with counts).
5. Update history:
   - Append a compact sample to `history/recent.json`, then trim entries older than 48 hours.
   - Update today's bucket in `history/rollups.json` (sample count, up count, down count per provider), and keep only the last 90 daily buckets.
6. Recompute `status/summary.json`: per-provider current status, active incidents, and uptime for 24h (from `recent.json`), 7d, 30d, and 90d (from `rollups.json` plus today's partial bucket), plus the overall reading.
7. Run the alert state machine (section 7) and write `status/state.json`.
8. Emit structured JSON logs and custom metrics (section 10).

Keep file sizes bounded by design. The trimming and rollup steps are what prevent unbounded growth and write amplification.

## 7. Alerting

Alert on **state transitions only**, never on every run while a provider stays down.

- **Debounce:** a new status must persist for 2 consecutive checks before it triggers an alert. This kills flapping on transient blips.
- **Trigger:** when a provider transitions from operational to any non-operational state (and survives the debounce), send a "degraded" or "outage" alert with the provider name, the new status, the active incident title, and the incident URL.
- **Recovery:** when a provider returns to operational, send a single recovery notice.
- **No spam:** while a provider stays down, do not re-alert. Track per-provider alert state in `state.json`: current alert state, the status that triggered it, the consecutive-sample counter, and the last transition timestamp.

**Channels:**

- Default: publish to an SNS topic. Terraform provisions the topic and an email subscription variable.
- Optional: a Telegram webhook behind a `TELEGRAM_ENABLED` flag with bot token and chat ID from environment or Secrets Manager. Reuse the same transition logic; only the delivery differs.

## 8. Frontend

A clean, fast, static dashboard that polls `status/summary.json` every 60 seconds.

**Design direction (lean into the name):**

- A prominent overall "reading" at the top, like a barometer face or a single bold status band, with a weather-themed label mapped from the underlying enum:
  - `operational` to "Fair, all clear (high pressure)"
  - `degraded` to "Changeable"
  - `partial_outage` to "Unsettled"
  - `major_outage` to "Stormy"
  - Keep the raw enum in the data; the weather label is presentation only.
- Below the headline, a responsive grid of provider cards. Each card shows the provider name, a color-coded status (green, amber, red), the active incident title if any, and a small sparkline of recent status from `recent.json`.
- Color must not be the only signal. Pair every color with an icon and a text label for accessibility. Target WCAG AA contrast.

**Behavior:**

- Poll on an interval and on tab refocus. Show a subtle "updated Xs ago" indicator.
- **Stale-data guard:** if `summary.json`'s `generatedAt` is older than 15 minutes, show a clear banner that the engine may be down. This makes a dead Lambda visible instead of silently serving stale green.
- Graceful empty and error states.

**Theming:** drive all colors, fonts, and spacing from design tokens (CSS custom properties) so the palette can be swapped to the Inkwell / Signal Ledger system later without touching components. Before building the UI, consult the frontend-design skill for styling direction so the result does not read as a default template.

## 9. Infrastructure (Terraform)

Structure as clean, composable modules with least-privilege IAM throughout.

- **S3:** one bucket, public access blocked, served only through CloudFront via OAC. Prefixes for `/app` and `/status` and `/history`. Lifecycle rules if useful.
- **CloudFront:** OAC to S3, sensible default behaviors, short TTL on the `status` and `history` JSON, long TTL on hashed assets. HTTPS only.
- **ACM and Route 53 (optional, behind a variable):** if a custom domain is set, request the certificate in us-east-1 for CloudFront and wire the DNS. Suggested domain placeholder: `barometer.vinny.dev`.
- **Lambda:** the engine function, environment variables for config, a tight execution role that can write only the data prefixes of the bucket and publish only to the one SNS topic.
- **EventBridge Scheduler:** the 5-minute rule, rate as a variable.
- **SNS:** the alert topic and an email subscription variable.
- **Meta-monitoring (watch the watcher):** a CloudWatch alarm on the engine Lambda's errors and on a custom "successful run" metric, so a broken Barometer alerts you rather than failing quietly.

Make every tunable a Terraform variable: check interval, provider list source, retention window, domain, alert email, Telegram flag.

## 10. Observability and cost

- Structured JSON logging from the Lambda. Log per-provider fetch outcome, run duration, and any adapter failures.
- Custom CloudWatch metrics: run duration, per-provider fetch success or failure, count of providers in each status.
- The meta-monitoring alarm from section 9 closes the loop.
- State in the README that expected cost is a few dollars a month at most: Lambda invocations are tiny, S3 and CloudFront traffic is minimal, and SNS is near free at this volume.

## 11. Testing

Tests must not hit the network. Capture real sample responses as fixtures and test against them.

- **Adapter unit tests:** feed each adapter recorded fixture payloads (a healthy Statuspage response, one with an active incident, the AWS and Azure and GCP formats) and assert the normalized output.
- **Contract test:** validate that every adapter's output conforms to the `ProviderSnapshot` schema. Consider a JSON schema or a runtime validator like `zod`.
- **State machine tests:** verify the alert debounce, the no-re-alert behavior during a sustained outage, and the recovery notice.
- **Uptime math tests:** verify window calculations and the availability rule against known sample histories.
- **Dry-run mode:** a local entry point that runs the full fetch and normalize and prints the resulting `summary.json` to stdout without writing to S3 or sending alerts. Invaluable for local iteration.

## 12. Repository structure

A small monorepo:

```
barometer/
  packages/
    types/         shared schema and the availability rule
    engine/        Lambda: adapters, normalizer, history, alerting
      adapters/    statuspage.ts, aws.ts, azure.ts, gcp.ts
      fixtures/    recorded sample responses for tests
    web/           Vite frontend
  infra/           Terraform modules and root config
  SPEC.md          the design doc you produce first
  README.md        setup, deploy, configuration, cost notes
```

## 13. Build order

Do not write everything at once. Proceed in phases and check in after each.

1. **Spec.** Produce `SPEC.md`: confirm the schema, the adapter contract, the provider list, and the storage layout. Pause for review.
2. **Types and config.** The shared schema and the typed provider config.
3. **Statuspage adapter plus fixtures plus tests.** Prove the pattern on Cloudflare, GitHub, and Fastly first.
4. **Custom adapters.** AWS, Azure, GCP, after verifying their current endpoints by web search. Fixtures and tests for each.
5. **Engine assembly.** Concurrency, current snapshot, history tiers, summary computation, dry-run mode.
6. **Alerting.** State machine, debounce, SNS, optional Telegram.
7. **Frontend.** Headline reading, provider cards, sparklines, stale-data guard, tokens.
8. **Terraform.** Buckets, CloudFront with OAC, Lambda, scheduler, SNS, optional domain, meta-monitoring.
9. **README and deploy.** End-to-end deploy steps and a teardown path.

## 14. Definition of done

- A scheduled Lambda fetches all configured providers, normalizes them, and writes the data files to S3.
- CloudFront serves a clean dashboard that shows an overall reading plus per-provider status and recent history, and that warns when data is stale.
- One provider failing degrades only that provider and never breaks the run.
- Alerts fire on transitions only, with debounce and recovery, defaulting to SNS.
- Terraform stands the whole stack up from scratch and tears it down cleanly, with least-privilege IAM.
- Tests pass without network access. A dry-run mode prints `summary.json` locally.
- The README documents configuration, the availability rule, deploy steps, and the expected low cost.

## 15. Config to confirm before deploy

Fill these in. They are intentionally left open:

- **Provider list:** the section 5 starting set, plus any additions.
- **Custom domain:** on or off, and the hostname (suggested `barometer.vinny.dev`).
- **Alert channel:** SNS email only, or SNS plus Telegram.
- **Check interval:** default 5 minutes.
- **Retention:** default 90 days of daily rollups, 48 hours of high-resolution samples.
