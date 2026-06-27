# Design: Barometer v2 — "Tell the truth, and show it"

**Date:** 2026-06-27
**Status:** Approved (design gate passed — user selected the three themes below)
**Scope:** Three themes, chosen from a multi-agent review of v1:
1. **Signal honesty** — stop blindly trusting vendor status pages.
2. **Incident archive** — persist incident lifecycle as a first-class artifact.
3. **Visual overhaul** — make the at-a-glance answer immediate and let users drill in.

Out of scope this cycle: multi-channel notifiers, public API/badges, subscriptions,
multi-region toggle, CI/canary (tracked as separate future work).

---

## Why (the multi-agent finding)

Four parallel reviews converged on one root weakness: **v1's reading is only as honest
as the vendor status pages it reads.** Three concrete failure modes:

- **Status pages lie / lag.** They stay green during real outages.
- **Hard-down reads as "no reading."** When a provider is truly down its status page
  often is too → the adapter's fetch fails → `status: "unknown"` → which is *excluded*
  from the reading. A fully-down provider can show as "instrument fault," not "Stormy."
- **History is thrown away.** Resolved incidents vanish: `recent.json`/`rollups.json`
  store only a `ProviderStatus` enum per provider per 5 min. No titles, no archive.

And the UI under-uses what it already has: the barometer **dial needle is hardcoded**
(`main.ts buildMasthead`, `d="M12 12L16.8 7.6"`) and never moves; `rollups.json` (90
daily buckets) is computed every run but **never fetched by the frontend**; cards render
**one** incident and discard `impact`/`startedAt`; providers render in config order.

This spec fixes the honesty gap, persists incidents, and cashes in the unused UI assets.

---

## Theme A — Signal honesty

### A1. Probe adapter (`type: "probe"`) — active reachability

A new adapter that **actually reaches an endpoint** instead of reading a status page.
It covers the foundational layer v1 has zero coverage of (DNS) and gives an independent,
non-self-reported signal.

- **Config:** `ProviderConfigSchema.type` gains `"probe"`. New optional `probe` object:
  ```ts
  probe: z.object({
    url: z.string(),               // HTTP(S) endpoint to GET/HEAD
    degradedMs: z.number().optional(), // latency over this → "degraded" (default: none)
    timeoutMs: z.number().optional(),  // default 5000 (matches http.ts)
  }).optional()
  ```
- **Mapping:**
  - HTTP 2xx/3xx within `timeoutMs` → `operational` (or `degraded` if `degradedMs` set
    and elapsed exceeds it).
  - HTTP ≥ 500 or network error/timeout (after retries) → `major_outage`.
  - HTTP 4xx → `degraded` (reachable but erroring; many health endpoints 200, a 404 is
    "something's off" not "down").
- **Why HTTP, not raw DNS/TCP:** the Lambda's `fetchWithRetry` already does timeout +
  backoff + injectable `fetchImpl` (so tests run with no network). DNS resolvers are
  probed via their **DNS-over-HTTPS** endpoints (`https://1.1.1.1/dns-query?...`,
  `https://dns.google/resolve?...`), which are real reachability checks but stay on the
  one transport the codebase already hardens and tests. Raw `dns`/`net` probing is
  deferred (Lambda VPC/DNS config + a second transport to test).
- **Standalone probe providers added to `PROVIDERS`** (foundational coverage):
  - `cloudflare-dns` — `https://1.1.1.1/dns-query?name=example.com&type=A` (DoH).
  - `google-dns` — `https://dns.google/resolve?name=example.com&type=A`.
  These give a real "is DNS resolving?" signal independent of any status page.
- **Incidents:** a probe failure synthesizes a single incident
  (`{ id: "<id>-probe", title: "Endpoint unreachable" | "Slow response (Nms)" , impact,
  status: "active", startedAt: now, url: probe.url }`) so the card/alert have context.
  No `regions` → fail-open (counts toward the US reading).
- **Never throws** (adapter contract): all failures map to a status, not an exception.

### A2. Probe-fallback decorator — fix "hard-down reads as unknown"

A `ProbeFallbackAdapter` that **wraps** any existing adapter (decorator; no per-adapter
edits). When a provider config has a `healthProbe` url:

- Run the inner adapter first.
- **Only if** the inner snapshot is `status: "unknown"` (i.e. the status feed was
  unreachable/unparseable), probe `healthProbe`:
  - probe **unreachable** (network error / ≥500 after retries) → escalate the snapshot to
    `major_outage` with a synthesized incident ("Status page and endpoint both
    unreachable") — the honest "it's actually down" reading.
  - probe **reachable** → keep `unknown` (the status page hiccuped but the service is up;
    excluding it from the reading is correct).
- Inner snapshot already `operational`/`degraded`/etc. → pass through untouched (the
  status page is talking; trust it). The probe only ever runs on `unknown`, so it adds at
  most one extra request per *failing* provider per run — negligible cost.

Config:
```ts
healthProbe: z.string().optional()  // endpoint to confirm a real outage when the feed is down
```
Wired for the status-page providers where a canonical endpoint exists (e.g. GitHub →
`https://api.github.com`, Cloudflare → `https://www.cloudflare.com`). Providers without a
`healthProbe` behave exactly as v1.

**Decision — escalate to `major_outage`, not `degraded`:** if both the status page and the
service endpoint are unreachable from us, "Stormy" is the honest reading. False positives
are bounded by the existing 2-sample alert debounce (`stepAlerts`), so a single transient
double-failure never pages.

### A3. Region extraction for prose feeds (conservative, fail-open)

v1 deliberately punted region scoping for Statuspage/Azure (fail-open, count everything).
v2 adds a **conservative** extractor so obviously-non-US incidents stop flipping the US
reading — without the brittleness that punt was avoiding.

- New `extractRegions(text): string[]` in `packages/types/src/region.ts`:
  - Matches **only unambiguous tokens**: the cloud-region grammar
    `/\b(?:us|eu|ap|sa|ca|me|af|cn)-[a-z]+-?\d?\b/gi` (e.g. `us-east-1`, `eu-west-2`,
    `ap-southeast`), plus an explicit small phrase allowlist mapped to region ids
    (`"us-east"/"us-west"/"u.s."/"united states"` → `us-`; `"europe"/"emea"` → `eu-`;
    `"asia"/"apac"` → `ap-`; etc.). Returns `[]` when nothing matches.
  - **Fail-open is preserved:** `regionsAreUsRelevant([])` → `true`, so an incident whose
    text we can't classify still counts. We only ever *exclude* when we positively
    identify **all** regions as non-US. Never hides a US incident.
- Statuspage + Azure adapters call `extractRegions(title [+ description])`, attach
  `incident.regions` when non-empty, and filter the status-deriving incident set by
  `regionsAreUsRelevant` (same pattern AWS/GCP already use). `activeIncidents` keeps all
  incidents (muted/tagged in the UI, exactly as today).
- Heavily unit-tested with real-world phrasings to pin the conservative behavior.

---

## Theme B — Incident archive (`history/incidents.json`)

The keystone data change. Persist incident lifecycle across runs so resolved incidents
are no longer lost.

### Schema (`packages/types/src/status.ts` or new `incidents.ts`)

```ts
export const IncidentRecordSchema = z.object({
  key: z.string(),            // `${providerId}:${incident.id}` — stable identity
  providerId: z.string(),
  providerName: z.string(),
  title: z.string(),
  impact: z.enum(["none", "minor", "major", "critical"]), // peak impact seen
  url: z.string(),
  regions: z.array(z.string()).optional(),
  firstSeen: z.string(),      // ISO — first run we saw it active
  lastSeen: z.string(),       // ISO — most recent run still active
  resolvedAt: z.string().nullable(), // ISO when it left the active set; null = ongoing
});

export const IncidentsFileSchema = z.object({
  incidents: z.array(IncidentRecordSchema), // newest firstSeen last; bounded
});
```

### Engine module — `packages/engine/src/incidents.ts` (pure)

`updateIncidents(prev, snapshots, nowIso, cap): IncidentsFile`:

- Build the current active set: every `incident` across all snapshots, keyed
  `${providerId}:${incident.id}`.
- For each prev record:
  - still active → update `lastSeen`, raise `impact` to the max seen, refresh
    `title`/`url`/`regions` (vendors edit these), keep `resolvedAt: null`.
  - no longer active and `resolvedAt == null` → set `resolvedAt = nowIso` (just resolved).
  - already resolved → keep as-is.
- New active keys not in prev → append a fresh record (`firstSeen = lastSeen = nowIso`,
  `resolvedAt: null`).
- **Bound** the file: keep all ongoing incidents + the most recent `cap` resolved ones
  (default 200), so the file can't grow without limit (it's served to the browser).
- Pure + deterministic (time passed in), mirroring `history.ts`. Reuses the
  read-modify-write pattern already in `run.ts`.

### Wiring (`run.ts`)

- New key `history/incidents.json`; load with `IncidentsFileSchema` default
  `{ incidents: [] }`; call `updateIncidents`; write with `SHORT_CACHE`. Gated by the
  same `historyMode` as recent/rollups (so `dryrun`/`current-only` doesn't write it).
- Impact-max uses the `["none","minor","major","critical"]` ordering.

This file is the substrate the drill-down UI (C4) reads. RSS/SLA pages are future work
that become cheap once this exists.

---

## Theme C — Visual overhaul

### C1. Worst-first sort + name the offenders (S)

- **Sort:** in `main.ts render()`, sort `summary.providers` by severity before mapping to
  cards, reusing the `PROVIDER_STATUSES` index in `status.ts` (already severity-ranked
  operational→unknown). Stable secondary sort by display name. Problems float to the top.
- **Offenders:** `renderHeadline` appends the worst offenders to `reading__sub`, e.g.
  "6 of 9 operational · GitHub down, GCP degraded". Clamp to top 3 + "+N more".
  The count source of truth stays the text (SPEC §8 rule).

### C2. Live sweeping barometer dial (M)

Replace the static 4-position linear marker in `headline.ts` with a **real dial whose
needle sweeps to the reading**, making good on the project's instrument motif.

- New `render/dial.ts`: an SVG semicircular gauge (Stormy→Fair arc) with colored zones
  and a needle. `needleAngleFor(status)` maps each status to an angle (discrete, eased —
  not continuous; we don't imply false precision):
  `major_outage`→far left … `operational`→far right; `maintenance`→"fair" zone;
  `unknown`→center with a distinct dashed/again treatment.
- The needle rotates via a CSS `transform: rotate()` transition on `--needle-angle`, so a
  poll that changes the reading **animates** the sweep.
- **Reduced-motion:** gated by the existing global `prefers-reduced-motion` reset in
  `styles.css` (snap instead of sweep).
- **Authority unchanged:** the weather word + "X of Y operational" text remain the
  accessible source of truth (`aria-label` on the reading); the dial is `aria-hidden`.
- The masthead mini-mark can reuse `needleAngleFor` so even the small logo needle reflects
  the live reading (kills the hardcoded path).

### C3. 90-day uptime bars from `rollups.json` (M)

The data + schema (`RollupsFileSchema`) already exist and are simply unfetched.

- Add a third poller in `main.ts` (mirror `recentPoller`) for `/history/rollups.json`;
  non-critical (ignore errors), like recent.
- New `render/uptimeBar.ts`: for a provider, render up to 90 day-cells from
  `DayBucket.providers[id].{up,down}` → per-day uptime %, colored
  (green/amber/red/empty-for-no-data), each with a `<title>` tooltip (date + uptime).
- Shown in the provider **drill-down** (C4) to avoid crowding the card grid; a compact
  30-cell strip may also sit on the card under a container query (progressive).

### C4. Provider drill-down dialog (M)

Cards become interactive, surfacing data already fetched + the new archive.

- Card `<article>` → focusable; click/Enter opens a native `<dialog>` (top-layer,
  focus-trapped, `Escape` to close). View Transitions used if available (reduced-motion
  gated), else plain show.
- Dialog content for the provider:
  - all `activeIncidents` (not just one) — title, `impact` dot, "started Nh ago"
    (from `startedAt`), regions (tagged/muted via `isUsRelevant`), safe `http(s)` link
    (reuse `isSafeHttpUrl`).
  - the 90-day uptime bar (C3).
  - recent **resolved** incidents for this provider from `history/incidents.json`
    (new fourth poller; non-critical).
  - the four uptime windows.
- Security: every vendor-supplied URL still passes the `^https?://` allowlist; regions and
  titles render as text (`textContent`), never HTML.

---

## Files touched (high level)

| Area | Files |
|---|---|
| types | `status.ts` (probe/healthProbe config? no — config lives in engine types), `region.ts` (`extractRegions`), new `incidents.ts` (records), `files.ts` (incidents file), `index.ts` |
| engine | `adapters/types.ts` (config: `probe`, `healthProbe`, `"probe"` type), new `adapters/probe.ts`, new `adapters/probeFallback.ts`, `adapters/factory.ts`, `adapters/statuspage.ts` + `azure.ts` (regions), new `incidents.ts`, `run.ts` (wire incidents), `config/providers.ts` (probe providers + healthProbe), `metrics.ts` (optional probe metrics) |
| web | new `render/dial.ts`, `render/uptimeBar.ts`, `render/dialog.ts`; `render/headline.ts`, `render/card.ts`, `main.ts`, `styles.css` |
| docs | `README.md`, `CLAUDE.md`/`AGENTS.md` (new providers, archive, dial), this spec + a plan |
| tests | new + extended across all three packages (TDD) |

## Testing (TDD throughout)

- **types:** `extractRegions` matrix; `incidents` record schema; impact-max ordering.
- **engine:** probe adapter (reachable/slow/4xx/5xx/timeout via injected `fetchImpl`);
  probeFallback (unknown+unreachable→major_outage, unknown+reachable→unknown,
  operational→passthrough); statuspage/azure region extraction + US filtering;
  `updateIncidents` lifecycle (open→update→resolve→bound); `run` writes incidents.json.
- **web:** dial `needleAngleFor` mapping; worst-first sort order; offenders text + clamp;
  uptimeBar cell colors/tooltips/no-data; dialog open/close + a11y + URL allowlist.
- **end-to-end:** `bun run dryrun` against live feeds (probes hit real DoH endpoints;
  region extraction surfaces on real incidents).

## Non-goals / guardrails

- Keep the "no servers, few dollars/month, single-writer Lambda, read-only frontend"
  ethos. Everything here is either more static files or more outbound fetches.
- Adapters still never throw. Availability rule + US-region knob remain the single knobs.
- Fail-open everywhere region/probe data is ambiguous; never invent a false outage from a
  single transient failure (debounce covers alerts).
