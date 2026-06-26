# Barometer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A serverless internet-health monitor — a scheduled Lambda normalizes 9 providers' status into one schema and writes tiered JSON to S3; a static CloudFront dashboard reads it and answers "is the internet healthy right now?"

**Architecture:** npm-workspaces monorepo. `packages/types` holds zod schemas + the availability rule (the shared contract). `packages/engine` is the Lambda: pure cores (aggregate, history, alerting) wrapped by thin I/O edges (http, store, notifier). `packages/web` is a vanilla-TS Vite dashboard polling `summary.json`. `infra/` is Terraform (S3+CloudFront OAC, Lambda, EventBridge Scheduler, SNS, monitoring). Single-writer Lambda → no write races.

**Tech Stack:** TypeScript (strict, ESM) · Node 20 · zod · esbuild (Lambda bundle) · Vite (web) · Vitest (tests) · AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/client-sns`, `@aws-sdk/client-cloudwatch`) · Terraform.

## Global Constraints

- **Source of truth:** `SPEC.md`. Every task implicitly inherits it. The availability rule, severity ordering, JSON schemas, and alert state machine are defined there — do not redefine, import from `types`.
- **Availability rule (verbatim):** `operational`=up; `degraded`/`partial_outage`/`major_outage`=down; `maintenance`/`unknown`=excluded from the denominator.
- **No network in tests.** Adapters/store/http are tested against recorded fixtures and in-memory fakes. Recording a fixture (one-time, dev-time) is allowed; a test reading it is not network.
- **Adapters never throw.** Any failure → `ProviderSnapshot` with `status: "unknown"`. A thrown adapter must never crash the run.
- **One writer.** The engine is the only writer to `/status` and `/history`. State that in code comments at the store boundary.
- **TypeScript strict.** `"strict": true`, `"noUncheckedIndexedAccess": true`, ESM (`"type": "module"`), `moduleResolution: "bundler"` (or `nodenext` for engine).
- **TDD always:** failing test → run (fail) → minimal impl → run (pass) → commit. Commit per task minimum.
- **User-Agent (verbatim):** `Barometer/1.0 (+https://barometer.vinny.dev)`.
- **Commit trailer:** end every commit message with `Claude-Session: https://claude.ai/code/session_014P2zwELCPhTxkgzYcrtFEe`.

---

## File Structure

```
packages/types/src/
  status.ts        ProviderStatus, Incident, ProviderSnapshot, OverallReading (zod + inferred types)
  files.ts         zod schemas for current/summary/state/recent/rollups JSON
  availability.ts  classify(status) -> "up"|"down"|"excluded"; UP/DOWN sets
  aggregate.ts     overallStatus(statuses), weatherLabel(status), buildOverallReading(...)
  index.ts         re-exports
packages/engine/src/
  http.ts          fetchWithRetry(url, opts) -> {status, body, etag} ; conditional GET
  adapters/
    types.ts       ProviderAdapter interface, AdapterDeps
    statuspage.ts  StatuspageAdapter
    aws.ts azure.ts gcp.ts
    factory.ts     buildAdapters(config, deps)
  config/providers.ts   typed ProviderConfig[] (9 providers) + env override loader
  history.ts       appendRecent/trimRecent, updateRollup/capRollups, uptimeWindows
  summary.ts       buildSummary(current, recent, rollups)
  alerting/
    machine.ts     stepAlerts(prevState, snapshots) -> {state, notifications}
    notifier.ts    Notifier iface, SnsNotifier, ConsoleNotifier
  store/
    types.ts       Store interface
    s3.ts          S3Store
    memory.ts      MemoryStore (tests + dry-run)
  run.ts           runOnce(deps): the per-run orchestration
  handler.ts       Lambda handler (wraps runOnce with S3Store + SnsNotifier + metrics)
  dryrun.ts        local CLI: runOnce with MemoryStore + ConsoleNotifier, prints summary.json
  fixtures/        recorded provider responses (*.json)
packages/web/
  index.html  src/main.ts  src/poll.ts  src/render/*.ts  src/tokens.css  vite.config.ts
infra/
  modules/{storage,cdn,engine,schedule,alerting,monitoring}/  + root {main,variables,outputs,providers}.tf
README.md
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.workspace.ts`, `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/engine/package.json`, `packages/engine/tsconfig.json`

**Interfaces:**
- Produces: workspace layout; `npm test` runs vitest across packages; `npm run build:types` compiles types.

- [ ] **Step 1:** Create root `package.json`:
```json
{
  "name": "barometer",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "npm run build -ws --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b packages/types packages/engine",
    "dryrun": "node --experimental-strip-types packages/engine/src/dryrun.ts"
  },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0", "@types/node": "^20.16.0" }
}
```

- [ ] **Step 2:** Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": false,
    "declaration": true, "composite": true, "esModuleInterop": true,
    "skipLibCheck": true, "verbatimModuleSyntax": true, "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3:** `packages/types/package.json` (name `@barometer/types`, `main`/`types` → `dist/index.js`, `exports` map, `build`: `tsc -b`). `packages/engine/package.json` (name `@barometer/engine`, deps: `@barometer/types`: `*`, `zod`, `@aws-sdk/client-s3`, `@aws-sdk/client-sns`, `@aws-sdk/client-cloudwatch`; devDeps: `esbuild`). Each `tsconfig.json` extends base, references `../types` where needed.

- [ ] **Step 4:** Create `vitest.workspace.ts`:
```ts
export default ["packages/types", "packages/engine"];
```

- [ ] **Step 5:** Run `npm install`. Expected: lockfile created, workspaces linked.

- [ ] **Step 6:** Run `npm test`. Expected: vitest reports "no test files" (exit 0) — scaffold works.

- [ ] **Step 7:** Commit: `chore: monorepo scaffold (npm workspaces, ts, vitest)`.

---

## Task 2: Shared status schema (`types`)

**Files:**
- Create: `packages/types/src/status.ts`, `packages/types/test/status.test.ts`

**Interfaces:**
- Produces: zod schemas `ProviderStatusSchema`, `IncidentSchema`, `ProviderSnapshotSchema`, `OverallReadingSchema` and inferred types `ProviderStatus`, `Incident`, `ProviderSnapshot`, `OverallReading`. `PROVIDER_STATUSES: readonly ProviderStatus[]`.

- [ ] **Step 1: Write failing test** (`status.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { ProviderSnapshotSchema, PROVIDER_STATUSES } from "../src/status.js";

describe("status schema", () => {
  it("lists all six statuses", () => {
    expect(PROVIDER_STATUSES).toEqual([
      "operational","degraded","partial_outage","major_outage","maintenance","unknown",
    ]);
  });
  it("validates a well-formed snapshot", () => {
    const ok = ProviderSnapshotSchema.safeParse({
      id: "cloudflare", displayName: "Cloudflare", status: "operational",
      activeIncidents: [], checkedAt: "2026-06-25T00:00:00.000Z", sourceUrl: "https://x",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects an unknown status string", () => {
    const bad = ProviderSnapshotSchema.safeParse({
      id: "x", displayName: "X", status: "on_fire",
      activeIncidents: [], checkedAt: "2026-06-25T00:00:00.000Z", sourceUrl: "https://x",
    });
    expect(bad.success).toBe(false);
  });
});
```
- [ ] **Step 2:** Run `npm test -- status` → FAIL (module not found).
- [ ] **Step 3: Implement** `status.ts`: define `PROVIDER_STATUSES` tuple, `ProviderStatusSchema = z.enum(PROVIDER_STATUSES)`, `IncidentSchema` (id, title, impact enum `none|minor|major|critical`, status string, startedAt string, url string), `ProviderSnapshotSchema`, `OverallReadingSchema` (status, label, providersOperational, providersTotal, generatedAt). Export `z.infer` types.
- [ ] **Step 4:** Run `npm test -- status` → PASS.
- [ ] **Step 5:** Commit: `feat(types): provider status + snapshot zod schemas`.

---

## Task 3: Availability rule (`types`)

**Files:** Create `packages/types/src/availability.ts`, `packages/types/test/availability.test.ts`

**Interfaces:**
- Consumes: `ProviderStatus`.
- Produces: `type Availability = "up"|"down"|"excluded"`; `classify(s: ProviderStatus): Availability`.

- [ ] **Step 1: Failing test:**
```ts
import { classify } from "../src/availability.js";
it("classifies per the availability rule", () => {
  expect(classify("operational")).toBe("up");
  for (const d of ["degraded","partial_outage","major_outage"] as const) expect(classify(d)).toBe("down");
  for (const e of ["maintenance","unknown"] as const) expect(classify(e)).toBe("excluded");
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `classify` with an exhaustive `switch` (no `default`; rely on `noUncheckedIndexedAccess`/exhaustiveness).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(types): availability classification rule`.

---

## Task 4: Aggregation + weather labels (`types`)

**Files:** Create `packages/types/src/aggregate.ts`, `packages/types/src/index.ts`, `packages/types/test/aggregate.test.ts`

**Interfaces:**
- Consumes: `ProviderStatus`, `ProviderSnapshot`.
- Produces: `overallStatus(statuses: ProviderStatus[]): ProviderStatus`; `weatherLabel(s: ProviderStatus): string`; `buildOverallReading(snaps: ProviderSnapshot[], generatedAt: string): OverallReading`.

- [ ] **Step 1: Failing tests:**
```ts
import { overallStatus, weatherLabel, buildOverallReading } from "../src/aggregate.js";
it("worst-case ignores maintenance/unknown", () => {
  expect(overallStatus(["operational","maintenance","unknown"])).toBe("operational");
  expect(overallStatus(["operational","degraded"])).toBe("degraded");
  expect(overallStatus(["partial_outage","major_outage"])).toBe("major_outage");
});
it("all-excluded => unknown", () => {
  expect(overallStatus(["maintenance","unknown"])).toBe("unknown");
  expect(overallStatus([])).toBe("unknown");
});
it("maps weather labels", () => {
  expect(weatherLabel("operational")).toMatch(/Fair/);
  expect(weatherLabel("major_outage")).toBe("Stormy");
  expect(weatherLabel("unknown")).toMatch(/unavailable/i);
});
it("counts operational over total", () => {
  const snaps = [
    { id:"a",displayName:"A",status:"operational",activeIncidents:[],checkedAt:"t",sourceUrl:"u" },
    { id:"b",displayName:"B",status:"degraded",activeIncidents:[],checkedAt:"t",sourceUrl:"u" },
  ] as const;
  const r = buildOverallReading([...snaps], "2026-06-25T00:00:00.000Z");
  expect(r.providersOperational).toBe(1);
  expect(r.providersTotal).toBe(2);
  expect(r.status).toBe("degraded");
  expect(r.label).toBe(weatherLabel("degraded"));
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Severity rank `{operational:1,degraded:2,partial_outage:3,major_outage:4}`; `overallStatus` = highest-rank among `classify !== "excluded"`; if none non-excluded → `"unknown"`. `weatherLabel` map per SPEC §9 (operational→"Fair — all clear (high pressure)", degraded→"Changeable", partial_outage→"Unsettled", major_outage→"Stormy", maintenance→"Scheduled maintenance", unknown→"Reading unavailable"). `buildOverallReading` composes it. Create `index.ts` re-exporting status/availability/aggregate/files.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(types): overall aggregation + weather labels`.

---

## Task 5: File schemas (`types`)

**Files:** Create `packages/types/src/files.ts`, `packages/types/test/files.test.ts`

**Interfaces:**
- Produces: `CurrentFileSchema`, `SummaryFileSchema`, `StateFileSchema`, `RecentFileSchema`, `RollupsFileSchema` + inferred types. Also export the nested types `RecentSample` (`{ t: string; s: Record<string, ProviderStatus> }`) and `DayBucket` (`{ date: string; providers: Record<string, { up: number; down: number }> }`) — Task 12 consumes both. `UptimeWindows` type `{ "24h": number|null; "7d": number|null; "30d": number|null; "90d": number|null }`.

- [ ] **Step 1: Failing test:** round-trip a minimal valid object of each schema through `.parse` (assert success), and assert `SummaryFileSchema` rejects a provider missing `uptime`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the five schemas per SPEC §6 (state uses `pendingStatus`, `consecutiveCount`, `triggeringStatus`, `lastTransitionAt`, `etag`). Export types.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(types): JSON file schemas (current/summary/state/recent/rollups)`. Then `npm run build:types`.

---

## Task 6: HTTP client (`engine`)

**Files:** Create `packages/engine/src/http.ts`, `packages/engine/test/http.test.ts`

**Interfaces:**
- Produces: `interface FetchResult { status: number; body: string; etag: string | null }`; `fetchWithRetry(url: string, opts?: { etag?: string|null; timeoutMs?: number; retries?: number; fetchImpl?: typeof fetch }): Promise<FetchResult>`. Sends `User-Agent` + `If-None-Match` when etag given. Retries on network error / 5xx with exponential backoff. A `304` returns `{status:304, body:"", etag}`.

- [ ] **Step 1: Failing tests** (inject a fake `fetchImpl`, no real network): (a) passes `User-Agent` + `If-None-Match`; (b) retries once after a thrown error then succeeds; (c) returns 304 passthrough; (d) throws after exhausting retries.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** with `AbortController` timeout, backoff `2^n * base`, configurable `fetchImpl` (default global `fetch`). Backoff sleep via injectable timer or `0` in tests.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(engine): http client with timeout/retry/conditional-GET`.

---

## Task 7: Statuspage adapter + fixtures (`engine`)

**Files:** Create `packages/engine/src/adapters/types.ts`, `adapters/statuspage.ts`, `fixtures/statuspage-healthy.json`, `fixtures/statuspage-incident.json`, `fixtures/statuspage-maintenance.json`, `test/statuspage.test.ts`

**Interfaces:**
- Consumes: `FetchResult`, `fetchWithRetry`, `ProviderConfig`, `ProviderSnapshot`.
- Produces: `interface AdapterDeps { fetch: typeof fetchWithRetry; now: () => string }`; `interface ProviderAdapter { id: string; fetchSnapshot(): Promise<ProviderSnapshot> }`; `class StatuspageAdapter implements ProviderAdapter` (ctor `(config: ProviderConfig, deps: AdapterDeps)`).

- [ ] **Step 1:** Record fixtures (dev-time, allowed): fetch `https://www.cloudflarestatus.com/api/v2/summary.json` → save as `statuspage-healthy.json`. Hand-craft `statuspage-incident.json` (indicator `major`, one unresolved incident) and `statuspage-maintenance.json` (a `scheduled_maintenances` in progress) from the real shape.
- [ ] **Step 2: Failing tests:** feed each fixture via a fake `fetch` returning `{status:200, body: JSON, etag:null}`; assert: healthy→`operational`; incident (indicator `major`)→`partial_outage` with `activeIncidents[0].title/url` populated; maintenance→`maintenance`; malformed body→`unknown` (never throws); contract: output `ProviderSnapshotSchema.parse` succeeds.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: Implement** `StatuspageAdapter.fetchSnapshot`: GET `${config.url}/api/v2/summary.json`; map `status.indicator` (none→operational, minor→degraded, major→partial_outage, critical→major_outage); if `scheduled_maintenances` has an in-progress entry and indicator is none→`maintenance`; map unresolved `incidents` → `Incident[]`; wrap everything in try/catch → `unknown` snapshot. Use zod to parse the provider payload defensively.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit: `feat(engine): statuspage adapter + fixtures`.

---

## Task 8: AWS adapter (`engine`)

**Files:** Create `packages/engine/src/adapters/aws.ts`, `fixtures/aws-*.json` (or `.xml`), `test/aws.test.ts`

**Interfaces:** Produces `class AwsAdapter implements ProviderAdapter`.

- [ ] **Step 1: Verify endpoint by web search** (SPEC §5.2): confirm the current machine-readable AWS Health source. Record real healthy + active-incident fixtures. If none is machine-readable, scrape the HTML page (isolated here) and document it in a header comment.
- [ ] **Step 2: Failing tests:** fixture → normalized `ProviderSnapshot`; malformed → `unknown`; contract parse succeeds.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: Implement** the parse for the verified format → `ProviderSnapshot`; never throws.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit: `feat(engine): aws adapter (endpoint verified <url>)`.

---

## Task 9: Azure adapter — same structure as Task 8 for `status.azure.com` (verify feed first). Commit `feat(engine): azure adapter`.

## Task 10: GCP adapter — same structure for `status.cloud.google.com` incidents JSON (verify first). Commit `feat(engine): gcp adapter`.

> Tasks 9 and 10 repeat Task 8's six steps exactly (verify → record fixtures → failing tests → fail → implement → pass → commit), substituting the provider's verified endpoint and format. Each adapter is independent and isolates its own fragility.

---

## Task 11: Provider config + adapter factory (`engine`)

**Files:** Create `packages/engine/src/config/providers.ts`, `adapters/factory.ts`, `test/factory.test.ts`

**Interfaces:**
- Produces: `PROVIDERS: ProviderConfig[]` (the 9, with `type` + `url`); `loadProviders(env?: Record<string,string|undefined>): ProviderConfig[]` (uses `BAROMETER_PROVIDERS_JSON` override if set, else `PROVIDERS`); `buildAdapters(configs: ProviderConfig[], deps: AdapterDeps): ProviderAdapter[]`.

- [ ] **Step 1: Failing tests:** `PROVIDERS` has 9 entries with unique ids incl. `aws,azure,gcp,cloudflare,github,fastly,anthropic,openai,gitlab`; `buildAdapters` returns a `StatuspageAdapter` for `type:"statuspage"` and the right class per `type`; `loadProviders` honors a JSON override.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Statuspage URLs: cloudflare→`https://www.cloudflarestatus.com`, github→`https://www.githubstatus.com`, fastly→`https://www.fastlystatus.com`, anthropic→`https://status.anthropic.com`, openai→`https://status.openai.com`, gitlab→`https://status.gitlab.com`. `aws/azure/gcp` URLs = verified endpoints from Tasks 8–10. `factory` switches on `type`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(engine): provider config (9) + adapter factory`.

---

## Task 12: History math (`engine`)

**Files:** Create `packages/engine/src/history.ts`, `test/history.test.ts`

**Interfaces:**
- Produces (all pure):
  - `appendRecent(recent: RecentFile, sample: RecentSample, nowMs: number, retentionHours: number): RecentFile`
  - `updateRollups(rollups: RollupsFile, snaps: ProviderSnapshot[], date: string, retentionDays: number): RollupsFile`
  - `uptimeFromRecent(recent: RecentFile, providerId: string, nowMs: number, windowHours: number): number|null`
  - `uptimeFromRollups(rollups: RollupsFile, providerId: string, windowDays: number, today?: DayBucket): number|null`

- [ ] **Step 1: Failing tests:** (a) `appendRecent` drops samples older than 48h, keeps newer; (b) `updateRollups` increments today's `up`/`down` per `classify`, excludes maintenance/unknown, caps to 90 days; (c) `uptimeFromRecent` = up/(up+down) over window, `null` when denominator 0; (d) `uptimeFromRollups` sums buckets in window incl. partial today, `null` when empty.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** pure transforms using injected `nowMs`/`date` (no `Date.now()` inside — pass it in, keeps tests deterministic).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(engine): tiered history append/trim/rollup + uptime windows`.

---

## Task 13: Summary builder (`engine`)

**Files:** Create `packages/engine/src/summary.ts`, `test/summary.test.ts`

**Interfaces:**
- Consumes: history fns, `buildOverallReading`.
- Produces: `buildSummary(snaps: ProviderSnapshot[], recent: RecentFile, rollups: RollupsFile, nowMs: number, generatedAt: string): SummaryFile`.

- [ ] **Step 1: Failing test:** given snapshots + known history, assert each provider's `uptime["24h"|"7d"|"30d"|"90d"]` and that `overall` matches `buildOverallReading`. Validate output with `SummaryFileSchema.parse`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** by composing Task 12 window fns + aggregation.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(engine): summary.json builder`.

---

## Task 14: Alert state machine (`engine`)

**Files:** Create `packages/engine/src/alerting/machine.ts`, `test/machine.test.ts`

**Interfaces:**
- Produces: `interface Notification { kind: "outage"|"recovery"; providerId: string; displayName: string; status: ProviderStatus; incidentTitle?: string; incidentUrl?: string }`; `stepAlerts(prev: StateFile, snaps: ProviderSnapshot[], nowIso: string, threshold = 2): { state: StateFile; notifications: Notification[] }`.

- [ ] **Step 1: Failing tests** (the heart of alerting — be thorough):
  - single down sample → no alert (debounce); second consecutive down → one `outage` notification, `alertState:"alerting"`.
  - sustained down across 5 runs → exactly one outage notification total (no re-alert).
  - down→down with worsening status (degraded then major_outage) → alerts on 2nd check, status `major_outage`.
  - recovery: 2 consecutive operational after alerting → one `recovery`, back to `operational`.
  - `unknown`/`maintenance` while operational → never alerts; resets the down streak.
  - `unknown` while alerting → stays alerting, no recovery.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the class-based debounce per SPEC §8 (pure function; `nowIso` injected).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(engine): alert state machine (class-based debounce)`.

---

## Task 15: Store + Notifier boundaries (`engine`)

**Files:** Create `packages/engine/src/store/types.ts`, `store/memory.ts`, `store/s3.ts`, `alerting/notifier.ts`, `test/memory-store.test.ts`

**Interfaces:**
- Produces:
  - `interface Store { readJson<T>(key: string, schema: ZodType<T>, fallback: T): Promise<T>; writeJson(key: string, value: unknown, cacheControl: string): Promise<void> }`
  - `class MemoryStore implements Store` (in-memory map; used by tests + dry-run)
  - `class S3Store implements Store` (AWS SDK v3; `// SINGLE WRITER — only the engine writes these keys`)
  - `interface Notifier { send(n: Notification): Promise<void> }`; `ConsoleNotifier`, `SnsNotifier` (ctor: topicArn, SNS client)
- [ ] **Step 1: Failing tests:** `MemoryStore` round-trips writes/reads, returns `fallback` for missing keys, validates with schema. `ConsoleNotifier.send` collects messages.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `MemoryStore`, `ConsoleNotifier` (tested); `S3Store`/`SnsNotifier` as thin SDK wrappers (not unit-tested — no network; covered by dry-run + deploy).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(engine): store + notifier boundaries (memory + s3 + sns)`.

---

## Task 16: Run orchestration + dry-run (`engine`)

**Files:** Create `packages/engine/src/run.ts`, `src/dryrun.ts`, `test/run.test.ts`

**Interfaces:**
- Produces: `interface RunDeps { adapters: ProviderAdapter[]; store: Store; notifier: Notifier; now: () => Date; concurrency?: number; retentionHours?: number; retentionDays?: number }`; `runOnce(deps: RunDeps): Promise<SummaryFile>`.

- [ ] **Step 1: Failing test:** build `runOnce` with two fake adapters (one returns `operational`, one throws internally→`unknown`) + `MemoryStore` + `ConsoleNotifier`; assert `current.json`, `summary.json`, `recent.json`, `rollups.json`, `state.json` were written; assert the run did not throw despite the failing adapter; assert `summary.overall.providersTotal === 2`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `runOnce`: read prior files (fallbacks for first run) → fetch all snapshots with a concurrency cap (default 6) → write current → update history → build+write summary → stepAlerts→send notifications→write state. `dryrun.ts`: assemble real adapters + `MemoryStore` + `ConsoleNotifier`, `console.log(JSON.stringify(summary, null, 2))`.
- [ ] **Step 4:** Run → PASS. Then run `npm run dryrun` (hits live provider APIs; this is a manual/local run, not a test) and eyeball the printed `summary.json`.
- [ ] **Step 5:** Commit: `feat(engine): run orchestration + dry-run entry`.

---

## Task 17: Lambda handler + bundle (`engine`)

**Files:** Create `packages/engine/src/handler.ts`, `packages/engine/esbuild.mjs`, `packages/engine/package.json` (add `build` script)

**Interfaces:** Produces `export const handler` (EventBridge trigger) wiring `S3Store` + `SnsNotifier` from env (`BUCKET`, `SNS_TOPIC_ARN`, `TELEGRAM_ENABLED` reserved), emitting CloudWatch metrics (`RunSuccess=1`, per-provider success/failure, run duration) and structured JSON logs; never lets one provider fail the run.

- [ ] **Step 1: Failing test:** import `handler`; with env stubbed and AWS clients mocked (`vi.mock`), assert it calls `runOnce` and emits a `RunSuccess` metric. (Keep it light — handler is glue.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `handler`; `esbuild.mjs` bundles `handler.ts` → `dist/handler.js` (platform node, target node20, format esm, external aws-sdk v3 is bundled since Node20 runtime no longer ships v2; bundle v3 to be safe). Add `"build": "node esbuild.mjs"`.
- [ ] **Step 4:** Run → PASS; run `npm run build -w @barometer/engine` → `dist/handler.js` exists.
- [ ] **Step 5:** Commit: `feat(engine): lambda handler + esbuild bundle + metrics`.

---

## Task 18: Web scaffold + design tokens (`web`)

> **Before this task:** consult `impeccable` and `modern-web-guidance` skills for styling direction (SPEC §9). The dashboard must not read as a default template.

**Files:** Create `packages/web/package.json`, `vite.config.ts`, `index.html`, `src/tokens.css`, `src/styles.css`, `src/main.ts`

**Interfaces:** Produces a Vite app that builds to `dist/`; `tokens.css` defines all color/spacing/font CSS custom properties (status colors green/amber/red with AA contrast, plus icon glyphs per status). `main.ts` mounts an app shell.

- [ ] **Step 1:** `npm create`-style minimal Vite TS config (no framework). `vite.config.ts` sets `base: "/app/"` (assets live under `/app`), build outDir `dist`.
- [ ] **Step 2:** Author `tokens.css` (design tokens only) + `styles.css` (consumes tokens). Headline band + responsive card grid via CSS grid.
- [ ] **Step 3:** `main.ts` renders a static shell (headline placeholder + empty grid). Run `npm run build -w web` → `dist/index.html` exists.
- [ ] **Step 4:** Commit: `feat(web): vite scaffold + design tokens`.

---

## Task 19: Web data layer (`web`)

**Files:** Create `packages/web/src/poll.ts`, `packages/web/test/poll.test.ts`, add web to `vitest.workspace.ts`

**Interfaces:** Produces `isStale(generatedAt: string, nowMs: number, thresholdMin = 15): boolean`; `secondsAgo(iso: string, nowMs: number): number`; `createPoller({ url, intervalMs, fetchImpl, onData, onError }): { start(): void; stop(): void; refresh(): Promise<void> }` (polls + refetches on `visibilitychange`).

- [ ] **Step 1: Failing tests:** `isStale` true when `generatedAt` > 15min old, false otherwise; `secondsAgo` math; `createPoller.refresh` calls `onData` with parsed JSON (fake `fetchImpl`), `onError` on failure.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** pure helpers + poller (inject `fetchImpl` + timer for tests). Add `packages/web` to `vitest.workspace.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat(web): poll loop + stale/age helpers`.

---

## Task 20: Web render — headline, cards, sparkline, states (`web`)

**Files:** Create `src/render/headline.ts`, `render/card.ts`, `render/sparkline.ts`, `render/banner.ts`, wire in `main.ts`; `test/render.test.ts`

**Interfaces:** Produces DOM-returning render fns: `renderHeadline(overall): HTMLElement`; `renderCard(providerSummary, recentForProvider): HTMLElement`; `renderSparkline(statuses: ProviderStatus[]): SVGElement`; `renderStaleBanner(): HTMLElement`. Each pairs color with icon + text label (accessibility).

- [ ] **Step 1: Failing tests** (jsdom via vitest `environment: "jsdom"`): `renderHeadline` shows the weather label + raw status as data-attr; `renderCard` includes provider name, a text status label (not color alone), and incident title when present; `renderSparkline` emits N points; stale banner present only when `isStale`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** render fns from `types` data; `main.ts` subscribes the poller (summary every 60s + recent on load), renders, shows "updated Xs ago", stale banner, empty/error states.
- [ ] **Step 4:** Run → PASS; `npm run build -w web`.
- [ ] **Step 5:** Commit: `feat(web): headline + cards + sparklines + stale guard`.

---

## Task 21: Terraform — storage module

**Files:** Create `infra/modules/storage/{main,variables,outputs}.tf`

**Interfaces:** Produces an S3 bucket (public access fully blocked), bucket policy granting **only** the CloudFront distribution `s3:GetObject` (condition `AWS:SourceArn = var.distribution_arn`), outputs `bucket_id`, `bucket_arn`, `bucket_regional_domain_name`.

- [ ] **Step 1:** Write module: `aws_s3_bucket`, `aws_s3_bucket_public_access_block` (all true), `aws_s3_bucket_policy` (OAC read), variables `bucket_name`, `distribution_arn`.
- [ ] **Step 2:** `terraform -chdir=infra/modules/storage init -backend=false && terraform ... validate` → success (or validate from root in Task 26).
- [ ] **Step 3:** Commit: `feat(infra): storage module (s3 + OAC bucket policy)`.

---

## Task 22: Terraform — cdn module (OAC + custom domain)

**Files:** Create `infra/modules/cdn/{main,variables,outputs}.tf`

**Interfaces:** Produces `aws_cloudfront_origin_access_control` (sigv4/always), `aws_cloudfront_distribution` (default behavior → `/app` SPA with `index.html` root; ordered behaviors for `/status/*` and `/history/*` short TTL; HTTPS redirect), ACM cert in `us-east-1` (`aws_acm_certificate` + `aws_acm_certificate_validation` via a `us-east-1`-aliased provider), Route53 alias A/AAAA records for `var.domain_name`. Variables `bucket_regional_domain_name`, `domain_name`, `route53_zone_id`, `acm_provider` alias. Outputs `distribution_arn`, `distribution_domain_name`, `url`.

- [ ] **Step 1:** Write module + a `providers.tf` requiring an aliased `aws.us_east_1`. Cache policies: managed CachingOptimized for `/app`, a short-TTL (60s) custom policy for `/status/*` + `/history/*`.
- [ ] **Step 2:** `terraform validate` from root (Task 26) — note module here.
- [ ] **Step 3:** Commit: `feat(infra): cloudfront cdn module (OAC + acm us-east-1 + route53)`.

---

## Task 23: Terraform — engine module (Lambda + least-priv IAM)

**Files:** Create `infra/modules/engine/{main,variables,outputs,iam.tf}`

**Interfaces:** Produces `aws_lambda_function` (Node20, handler `handler.handler`, zip from `var.bundle_path`), env vars (`BUCKET`, `SNS_TOPIC_ARN`, `BAROMETER_PROVIDERS_JSON` optional, retention vars), `aws_cloudwatch_log_group`, execution role with policy: `s3:GetObject`+`s3:PutObject` on `${bucket_arn}/status/*` and `${bucket_arn}/history/*` only; `sns:Publish` on `var.sns_topic_arn` only; `cloudwatch:PutMetricData` with condition `cloudwatch:namespace = "Barometer"`; logs. Outputs `function_arn`, `function_name`.

- [ ] **Step 1:** Write module + `iam.tf` (no wildcards — enumerate the two prefixes and the one topic).
- [ ] **Step 2:** validate (root).
- [ ] **Step 3:** Commit: `feat(infra): engine lambda module (least-privilege iam)`.

---

## Task 24: Terraform — schedule + alerting modules

**Files:** Create `infra/modules/schedule/*.tf`, `infra/modules/alerting/*.tf`

**Interfaces:** schedule → `aws_scheduler_schedule` (rate = `var.check_interval_minutes`) + role that may `lambda:InvokeFunction` only `var.function_arn`. alerting → `aws_sns_topic` + `aws_sns_topic_subscription` (email, `var.alert_email`); outputs `topic_arn`.

- [ ] **Step 1:** Write both modules.
- [ ] **Step 2:** validate (root).
- [ ] **Step 3:** Commit: `feat(infra): eventbridge schedule + sns alerting modules`.

---

## Task 25: Terraform — monitoring module + root wiring

**Files:** Create `infra/modules/monitoring/*.tf`, `infra/{providers,main,variables,outputs}.tf`, `infra/example.tfvars`

**Interfaces:** monitoring → `aws_cloudwatch_metric_alarm` on Lambda `Errors` (>0) and on custom `RunSuccess` (missing/`<1` for N periods, `treat_missing_data="breaching"`), actions → SNS topic. Root wires all modules in dependency order (alerting → storage needs distribution_arn from cdn → cdn needs bucket domain → engine needs bucket+topic → schedule needs function), declares the `us-east-1` aliased provider, exposes all SPEC §10 variables, outputs the site `url` + `bucket_id`.

- [ ] **Step 1:** Write monitoring module + root. Resolve the storage/cdn circular hint: create bucket first with a policy that references the distribution via `var.distribution_arn` set after cdn (or use `aws_cloudfront_distribution` then attach bucket policy referencing it — order: bucket → distribution(origin = bucket regional domain) → bucket_policy(distribution_arn)). Document the apply order.
- [ ] **Step 2:** `terraform -chdir=infra init -backend=false && terraform -chdir=infra validate && terraform -chdir=infra fmt -check -recursive` → all pass.
- [ ] **Step 3:** Commit: `feat(infra): monitoring alarms + root composition`.

---

## Task 26: README + deploy/teardown scripts

**Files:** Create `README.md`, `scripts/deploy.sh`, `scripts/seed.sh`

**Interfaces:** README documents: what/why, architecture diagram, the availability rule, configuration (all Terraform vars + the provider config file + `BAROMETER_PROVIDERS_JSON`), local dev (`npm run dryrun`), deploy steps (build web → `npm run build -w web`; bundle lambda → `npm run build -w @barometer/engine`; `terraform apply`; upload `web/dist` → `s3://.../app/`; optional first-run seed via manual Lambda invoke), teardown (`terraform destroy` + empty bucket), and the few-dollars/month cost note. `deploy.sh` automates build+apply+sync; `seed.sh` invokes the Lambda once.

- [ ] **Step 1:** Write README + scripts.
- [ ] **Step 2:** `bash -n scripts/deploy.sh scripts/seed.sh` (syntax check) → pass.
- [ ] **Step 3:** Commit: `docs: README (config, deploy, teardown, cost) + scripts`.

---

## Final verification (after all tasks)

- [ ] `npm test` → all packages green, zero network.
- [ ] `npm run typecheck` → clean.
- [ ] `npm run dryrun` → prints a valid `summary.json` (manual, hits live APIs).
- [ ] `npm run build` (web + engine) → `web/dist` + `engine/dist/handler.js` exist.
- [ ] `terraform -chdir=infra validate` + `fmt -check` → pass.
- [ ] Re-read SPEC §16 Definition of Done; confirm each bullet maps to shipped code.

## Self-review notes (spec coverage)

Every SPEC section maps to a task: §3 data model→T2/T5; §4 availability/aggregation→T3/T4; §5 adapters→T6–T11; §6 storage schemas→T5; §7 engine run→T12/T13/T16; §8 alerting→T14/T15; §9 frontend→T18–T20; §10 infra→T21–T25; §11 observability→T17/T25; §12 testing→every task (TDD) + fixtures; §13 repo structure→T1; §15 build order→task order. No placeholders except the inherently data-dependent AWS/Azure/GCP parse code (Tasks 8–10), which is gated on a verify-endpoint step by design (SPEC §5.2).
