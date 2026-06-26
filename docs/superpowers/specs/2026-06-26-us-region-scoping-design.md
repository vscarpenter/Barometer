# Design: Make Barometer US-specific (region-scoped reading)

**Date:** 2026-06-26
**Status:** Approved (design gate passed)
**Scope:** US-region scoping of the engine reading + alerts. Telegram notifier and the
two skipped hardening items are explicitly out of scope (separate cycles).

---

## Problem

The engine flags a provider down for *any* active incident, regardless of region. A
provider with an incident affecting only Europe / Middle East / APAC marks down and can
flip the overall headline. Seen live: GCP partial outage for `asia-south2`
("Delhi, Chennai, Mumbai"); AWS `me-central-1` events. For a US audience, these should
not read as "the internet is unhealthy."

## Goal

Scope the **reading and the alerting** to the US: an incident that affects *only* non-US
regions must not influence a provider's status, the overall headline, alerts, or uptime.
Global and US-affecting incidents continue to count. Non-US incidents remain **visible**
on the provider card (tagged), so the dashboard stays honest about non-US events.

---

## Design decisions (resolved during brainstorming)

| Question | Decision | Rationale |
|---|---|---|
| Non-US-only incident → reading? | **Exclude from status/headline/alerts, but still show it on the card (tagged)** | US-scoped reading while staying honest about non-US events |
| Prose feeds (Statuspage, Azure) where region is unreliable? | **Fail open — count every incident** (no keyword parsing in v1) | Never wrongly hide a real US outage; avoids brittle prose extraction |
| US-region allowlist | A region counts as US if `id` starts with `us-` **or** equals `global` | Covers GCP (`us-central1`) and AWS (`us-east-1`, `us-gov-*`) with one rule; no enumeration to maintain |
| `global` / unlabeled incidents | **Count** (assume US-affecting) | `global` affects the US; unlabeled falls under fail-open |
| Multi-region incident (some US, some not) | **Counts** (any US/global region present → counts) | Matches "exclude only-non-US"; an incident touching the US is a US incident |
| Alerting scope | **US-scoped, automatically** | The alert machine keys off `status`; scoping `status` scopes alerts with no machine changes |
| UI | Per-incident region tag; mute + label non-US-only incidents. No region info on the headline. | Minimal, honest UI; YAGNI on a dual reading |

---

## Architecture

The chosen approach: **per-incident regions + one central US-relevance knob; each adapter
computes `status` from US-relevant incidents only.** This mirrors `availability.ts` being
the single availability knob — region policy lives in exactly one place.

Because the overall headline (`aggregate.ts`), the alert machine (`alerting/machine.ts`),
and uptime (`availability.classify`) all already derive from a provider's `status`,
scoping `status` cascades US-scoping through all of them with **no changes to those
modules**. The feature "touches every layer" but needs real changes in only the schema,
two adapters, and the web card.

### 1. The region knob — new `packages/types/src/region.ts`

Single source of truth for US-region policy. Sibling to `availability.ts`.

```ts
import type { Incident } from "./status.js";

/** A region id is US-relevant if it is `global` or starts with `us-`
 *  (GCP us-central1, AWS us-east-1 / us-gov-*). */
export function isUsRegion(id: string): boolean {
  return id === "global" || id.startsWith("us-");
}

/** Do these regions count toward the US reading?
 *  Fail-open: no region data → assumed US-affecting. This is the primitive the
 *  adapters use at the raw level (before an Incident exists). */
export function regionsAreUsRelevant(regions: string[] | undefined): boolean {
  const r = regions ?? [];
  if (r.length === 0) return true;              // fail open
  return r.some(isUsRegion);                    // any US/global region → counts
}

/** Convenience over a built Incident — used by the web card. */
export function isUsRelevant(incident: Incident): boolean {
  return regionsAreUsRelevant(incident.regions);
}
```

The only way to be excluded: have ≥1 region and have **all** of them be non-US.
`regionsAreUsRelevant(string[])` is the shared primitive so adapters (raw GCP
locations, raw AWS ARNs) and the web card (`Incident.regions`) apply one identical rule.

### 2. Schema — `packages/types/src/status.ts`

Add an optional `regions` array to `IncidentSchema`:

```ts
export const IncidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  impact: z.enum(["none", "minor", "major", "critical"]),
  status: z.string(),
  startedAt: z.string(),
  url: z.string(),
  regions: z.array(z.string()).optional(),   // NEW — adapters that can't extract omit it
});
```

Optional so prose adapters simply omit it. `regions` flows into `current.json` and
`summary.json` only (see "Persistence" below).

### 3. Adapters

**GCP — `adapters/gcp.ts`** (structured; the easy win):
- Extend `GcpIncidentSchema` with `currently_affected_locations: z.array(z.object({ id: z.string() })).nullish()`.
  `.nullish()` is load-bearing: an absent/null field must NOT degrade the provider to
  `unknown` (the documented over-strict-schema hardening lesson).
- Map `currently_affected_locations[].id` → `incident.regions` on every active incident.
- Compute `status` from only the active incidents whose regions pass
  `regionsAreUsRelevant(...)`: filter `activeRaw` by each item's mapped region ids, then
  feed the survivors to `worstProviderStatus`. If none survive → `operational`. All active
  incidents still populate `activeIncidents`.

**AWS — `adapters/aws.ts`** (semi-structured):
- Parse the region segment from the event ARN: `arn.split(":")[3]`
  (`arn:aws:health:<region>:<account>:event/...`; global services have an empty segment →
  `regions: []` → fail-open). Attach as `incident.regions` (`[]` when empty).
- The status loop currently folds `worseStatus` over **all** `events`; add a
  `if (!regionsAreUsRelevant(regionFor(ev))) continue;` guard so only US-relevant events
  contribute to `status`. `activeIncidents` keeps all events.

**Statuspage / Azure — unchanged.** They emit incidents with no `regions`, so
`isUsRelevant` returns `true` and they count exactly as today (fail-open). No prose
parsing in v1.

> Implementation note: both adapters call the shared `regionsAreUsRelevant(string[])`
> primitive — neither re-derives the allowlist. GCP and AWS keep their own status-severity
> logic (`worstProviderStatus` / `worseStatus`); region filtering only changes *which*
> incidents feed it.

### 4. Cascade — no code changes

- `aggregate.ts` (`overallStatus`/`buildOverallReading`) reads `status` → US-scoped headline.
- `alerting/machine.ts` does `classify(snap.status)` → US-scoped alerts.
- Uptime via `availability.classify(status)` → US-scoped uptime.

These modules are **not** modified; they inherit scoping through `status`.

### 5. UI — `packages/web/src/render/card.ts`

- Render a small region tag on incidents that carry `regions`.
- Reuse `isUsRelevant` (from `@barometer/types`) to **mute** non-US-only incidents and
  label them, e.g. *"Outside US — not counted."* A provider can read green while showing
  an EU/APAC incident beneath it.
- Region strings are vendor-supplied → continue to render as text only (the existing
  `^https?://` allowlist applies to incident `url`, not regions; regions are not links).

### Persistence

`Incident.regions` appears only in `current.json` + `summary.json` (both embed
`ProviderSnapshot`). `recent.json` and `rollups.json` store `Record<providerId,
ProviderStatus>` (status only); `state.json` is alert state. None of those need schema
changes — they inherit US-scoping through `status`.

---

## Error handling / edge cases

- **No region data** (prose feeds, GCP `currently_affected_locations` absent/null, AWS
  empty ARN region) → `regions: []`/omitted → **counts** (fail-open). Never hides a US issue.
- **All-non-US incident** → excluded from `status`; provider may read `operational` while
  `activeIncidents` still lists it (muted in the UI).
- **Provider's only incident is non-US** → `status: operational`, card shows the incident.
- **Schema leniency** → the GCP locations field is `.nullish()`; AWS region parse never
  throws (missing segment → empty). Adapters still degrade to `unknown` only on real fetch
  /parse failure, never because of region data.

---

## Testing (TDD)

- **`types/region.test.ts`** — `isUsRegion` / `isUsRelevant` matrix: `us-east-1`,
  `us-central1`, `us-gov-west-1`, `global`, `[]`/omitted (→ true), `asia-south2` only
  (→ false), mixed US+non-US (→ true), all-non-US (→ false).
- **`engine/gcp.test.ts`** — `asia-south2`-only incident → `operational`; `us-central1`
  → counts; mixed → counts; missing `currently_affected_locations` → fail-open + not
  `unknown`; regions attached to incidents.
- **`engine/aws.test.ts`** — `me-central-1` ARN → excluded; `us-east-1` → counts; empty
  region (global) → counts; regions attached.
- **`types/aggregate.test.ts`** — a non-US-only incident does not flip the headline.
- **`web/render.test.ts`** — non-US incident rendered muted + tagged; US/global incident
  rendered normally.

Use `npm`→`bun run test` (vitest). `bun run dryrun` against live feeds as the end-to-end
check (it surfaces real GCP/AWS region data).

---

## Out of scope (v1 — YAGNI)

- Prose keyword extraction for Statuspage / Azure regions.
- A dual global + US reading.
- Per-provider `regionAware` config flags.
- Region info on the overall headline (per-incident only).
- The Telegram notifier and the two skipped hardening items.

---

## Files touched

| File | Change |
|---|---|
| `packages/types/src/region.ts` | **new** — `isUsRegion`, `isUsRelevant` (the knob) |
| `packages/types/src/status.ts` | add optional `regions` to `IncidentSchema` |
| `packages/types/src/index.ts` | export `region.ts` |
| `packages/engine/src/adapters/gcp.ts` | parse `currently_affected_locations`; US-relevant status |
| `packages/engine/src/adapters/aws.ts` | parse ARN region; US-relevant status |
| `packages/web/src/render/card.ts` | region tags; mute/label non-US incidents |
| tests (types, engine, web) | per the testing section |
| `CLAUDE.md` | move item 1 from Future work → done; note the region knob |
