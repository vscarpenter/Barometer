# US-Region Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope the engine's reading and alerts to the US — an incident affecting only non-US regions no longer marks a provider down, but stays visible (tagged) on the card.

**Architecture:** One central region knob in `@barometer/types` (`region.ts`, sibling to `availability.ts`); each `Incident` gains an optional `regions` array; the GCP and AWS adapters extract regions and compute `status` from US-relevant incidents only. The headline, alert machine, and uptime inherit US-scoping for free because they already derive from `status`.

**Tech Stack:** TypeScript (strict), zod, vitest, Bun (package manager + task runner), esbuild/Vite.

## Global Constraints

- Run tests/typecheck via **Bun**: `bun run test` (full vitest suite), `bun run typecheck`. Targeted file: `bunx vitest run <path>`. Never `bun test` (that bypasses vitest).
- Adapters **never throw** — degrade to `status: "unknown"` only on real fetch/parse failure, never because of region data.
- Region policy lives **only** in `region.ts`. Adapters call `regionsAreUsRelevant(string[])`; the web calls `isUsRelevant(incident)`. Never re-derive the allowlist.
- Fail open: an incident with no region data counts (assumed US-affecting).
- Zod schema additions for vendor feeds must be **lenient** (`.optional()`/`.nullish()`) so a missing field never degrades a provider to `unknown`.
- Every commit ends with the trailer `Claude-Session: https://claude.ai/code/session_01RJAmxfs8iDydv4nvUDbERs`, author `Vinny Carpenter <vscarpenter@gmail.com>`.
- Spec: `docs/superpowers/specs/2026-06-26-us-region-scoping-design.md`.

---

### Task 1: The region knob + schema field

**Files:**
- Create: `packages/types/src/region.ts`
- Modify: `packages/types/src/status.ts` (add `regions` to `IncidentSchema`)
- Modify: `packages/types/src/index.ts` (export `region.js`)
- Test: `packages/types/test/region.test.ts`

**Interfaces:**
- Produces: `isUsRegion(id: string): boolean`, `regionsAreUsRelevant(regions: string[] | undefined): boolean`, `isUsRelevant(incident: Incident): boolean`. `IncidentSchema` gains `regions?: string[]`.

- [ ] **Step 1: Write the failing test** — `packages/types/test/region.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isUsRegion, regionsAreUsRelevant, isUsRelevant } from "../src/region.js";
import type { Incident } from "../src/status.js";

const incident = (regions?: string[]): Incident => ({
  id: "i", title: "t", impact: "major", status: "investigating",
  startedAt: "2026-06-25T00:00:00.000Z", url: "https://x/i", regions,
});

describe("isUsRegion", () => {
  it.each(["us-east-1", "us-central1", "us-gov-west-1", "global"])("counts %s", (r) =>
    expect(isUsRegion(r)).toBe(true));
  it.each(["asia-south2", "eu-west-1", "me-central-1", "europe-west1"])("rejects %s", (r) =>
    expect(isUsRegion(r)).toBe(false));
});

describe("regionsAreUsRelevant", () => {
  it("fails open on empty/undefined", () => {
    expect(regionsAreUsRelevant([])).toBe(true);
    expect(regionsAreUsRelevant(undefined)).toBe(true);
  });
  it("counts if any region is US or global", () => {
    expect(regionsAreUsRelevant(["asia-south2", "global"])).toBe(true);
    expect(regionsAreUsRelevant(["eu-west-1", "us-east-1"])).toBe(true);
  });
  it("excludes only when every region is non-US", () => {
    expect(regionsAreUsRelevant(["asia-south2"])).toBe(false);
    expect(regionsAreUsRelevant(["eu-west-1", "me-central-1"])).toBe(false);
  });
});

describe("isUsRelevant", () => {
  it("delegates to the incident's regions", () => {
    expect(isUsRelevant(incident(undefined))).toBe(true);
    expect(isUsRelevant(incident(["us-east-1"]))).toBe(true);
    expect(isUsRelevant(incident(["asia-south2"]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../src/region.js'`)

Run: `bunx vitest run packages/types/test/region.test.ts`
Expected: FAIL (module/export not found).

- [ ] **Step 3: Add `regions` to `IncidentSchema`** — `packages/types/src/status.ts`, inside `IncidentSchema` after the `url` line:

```ts
  url: z.string(),
  regions: z.array(z.string()).optional(), // affected region ids; absent = unknown (fail-open)
```

- [ ] **Step 4: Create `packages/types/src/region.ts`**

```ts
import type { Incident } from "./status.js";

/**
 * US-region policy — the single knob (sibling to availability.ts). A region id
 * is US-relevant if it is `global` or starts with `us-` (GCP `us-central1`,
 * AWS `us-east-1` / `us-gov-*`). SPEC: 2026-06-26-us-region-scoping-design.md.
 */
export function isUsRegion(id: string): boolean {
  return id === "global" || id.startsWith("us-");
}

/** Do these regions count toward the US reading? Fail-open on no data. */
export function regionsAreUsRelevant(regions: string[] | undefined): boolean {
  const r = regions ?? [];
  if (r.length === 0) return true;
  return r.some(isUsRegion);
}

/** Convenience over a built Incident — used by the web card. */
export function isUsRelevant(incident: Incident): boolean {
  return regionsAreUsRelevant(incident.regions);
}
```

- [ ] **Step 5: Export it** — `packages/types/src/index.ts`, add after the availability line:

```ts
export * from "./region.js";
```

- [ ] **Step 6: Run tests + typecheck — expect PASS**

Run: `bunx vitest run packages/types/test/region.test.ts && bun run typecheck`
Expected: region tests PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/region.ts packages/types/src/status.ts packages/types/src/index.ts packages/types/test/region.test.ts
git commit -m "feat(types): US-region knob (isUsRelevant) + Incident.regions"
```

---

### Task 2: GCP adapter — extract regions, US-scoped status

**Files:**
- Modify: `packages/engine/src/adapters/gcp.ts`
- Test: `packages/engine/test/gcp.test.ts`

**Interfaces:**
- Consumes: `regionsAreUsRelevant` from `@barometer/types`.

- [ ] **Step 1: Write/adjust the failing tests** — in `packages/engine/test/gcp.test.ts`.

(a) Add `regions` assertion to the existing "maps SERVICE_OUTAGE to major_outage…" test (after the `inc.url` assertion, ~line 68):

```ts
    expect(inc.regions).toEqual(["asia-south2", "global"]); // global → still counts
```

(b) Add a new test (the real exclusion case — asia-south2 only, no global):

```ts
  it("excludes a non-US-only incident from status but still lists it", async () => {
    const body = JSON.stringify([
      {
        id: "apac1", begin: "2026-06-25T00:00:00.000Z", end: null,
        external_desc: "APAC latency", status_impact: "SERVICE_OUTAGE",
        severity: "high", uri: "incidents/apac1",
        currently_affected_locations: [{ id: "asia-south2" }],
      },
    ]);
    const snap = await new GcpAdapter(config, deps(body)).fetchSnapshot();
    expect(snap.status).toBe("operational");        // asia-south2 only → excluded
    expect(snap.activeIncidents).toHaveLength(1);    // still shown
    expect(snap.activeIncidents[0]!.regions).toEqual(["asia-south2"]);
  });
```

- [ ] **Step 2: Run — expect FAIL** (new test fails: status is currently `major_outage`; `regions` is `undefined`).

Run: `bunx vitest run packages/engine/test/gcp.test.ts`
Expected: FAIL on the two new assertions.

- [ ] **Step 3: Implement** — `packages/engine/src/adapters/gcp.ts`.

Import the knob (extend the existing types import line):

```ts
import { regionsAreUsRelevant } from "@barometer/types";
```

Extend `GcpIncidentSchema` (after the `uri` line) — `.nullish()` is load-bearing:

```ts
  uri: z.string(),
  currently_affected_locations: z.array(z.object({ id: z.string() })).nullish(),
```

Replace the `activeIncidents` map + `status` computation (current lines ~68-82) with:

```ts
      const activeIncidents: Incident[] = activeRaw.map((i) => ({
        id: i.id,
        title: i.external_desc,
        impact: SEVERITY_TO_IMPACT[i.severity] ?? "minor",
        status: i.most_recent_update?.status ?? "active",
        startedAt: i.begin,
        url: `https://status.cloud.google.com/${i.uri}`,
        regions: (i.currently_affected_locations ?? []).map((l) => l.id),
      }));

      // US-scoped status: only incidents whose regions count feed worstProviderStatus.
      const usRelevantStatuses = activeRaw
        .filter((i) => regionsAreUsRelevant((i.currently_affected_locations ?? []).map((l) => l.id)))
        .map((i) => STATUS_IMPACT_TO_PROVIDER_STATUS[i.status_impact] ?? "degraded");
      const status =
        usRelevantStatuses.length === 0 ? "operational" : worstProviderStatus(usRelevantStatuses);
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run packages/engine/test/gcp.test.ts && bun run typecheck`
Expected: all GCP tests PASS (including the unchanged `major_outage` fixture test — global keeps it counting).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/adapters/gcp.ts packages/engine/test/gcp.test.ts
git commit -m "feat(engine): GCP adapter scopes status to US-relevant incidents"
```

---

### Task 3: AWS adapter — parse ARN region, US-scoped status

**Files:**
- Modify: `packages/engine/src/adapters/aws.ts`
- Test: `packages/engine/test/aws.test.ts`

**Interfaces:**
- Consumes: `regionsAreUsRelevant` from `@barometer/types`.

> Note: the `aws-incident.json` fixture has only `me-central-1` + `me-south-1` (both non-US), so its status MUST change `partial_outage` → `operational`. This is the feature working — two existing assertions are updated below, not broken.

- [ ] **Step 1: Update existing tests + add new ones** — `packages/engine/test/aws.test.ts`.

(a) Rewrite the "maps active OPERATIONAL_ISSUE events to partial_outage…" test:

```ts
  it("shows non-US (Middle East) events but excludes them from status", async () => {
    const snap = await new AwsAdapter(config, deps(fixture("aws-incident.json"))).fetchSnapshot();
    expect(snap.status).toBe("operational");     // me-central-1 + me-south-1 → excluded
    expect(snap.activeIncidents).toHaveLength(2); // still shown
    const inc = snap.activeIncidents[0]!;
    expect(inc.title).toBe("Increased Error Rates (Multiple services)");
    expect(inc.impact).toBe("major");
    expect(inc.regions).toEqual(["me-central-1"]);
    expect(inc.id).toBe(
      "arn:aws:health:me-central-1::event/MULTIPLE_SERVICES/AWS_MULTIPLE_SERVICES_OPERATIONAL_ISSUE/AWS_MULTIPLE_SERVICES_OPERATIONAL_ISSUE_5E6B8_EF2498889B5",
    );
  });
```

(b) Replace the "uses worse of code-derived and arn-derived status per event" test (it relied on the now-operational ME fixture):

```ts
  it("derives status from US events only; a worse non-US event does not escalate", async () => {
    const body = JSON.stringify([
      { arn: "arn:aws:health:us-east-1::event/EC2/AWS_EC2_OPERATIONAL_ISSUE/a", status: "3" }, // US → partial_outage
      { arn: "arn:aws:health:eu-west-1::event/EC2/AWS_EC2_OPERATIONAL_ISSUE/b", status: "5" }, // non-US → would be major
    ]);
    const snap = await new AwsAdapter(config, deps(body)).fetchSnapshot();
    expect(snap.status).toBe("partial_outage"); // eu-west-1 major excluded
    expect(snap.activeIncidents).toHaveLength(2);
  });
```

(c) Add a fail-open (empty-region / global) test:

```ts
  it("fails open for a global AWS event with no region in the ARN", async () => {
    const body = JSON.stringify([
      { arn: "arn:aws:health::event/IAM/AWS_IAM_OPERATIONAL_ISSUE/g", status: "3" },
    ]);
    const snap = await new AwsAdapter(config, deps(body)).fetchSnapshot();
    expect(snap.status).toBe("partial_outage"); // no region → counts
    expect(snap.activeIncidents[0]!.regions).toEqual([]);
  });
```

- [ ] **Step 2: Run — expect FAIL** (status assertions don't match yet; `regions` undefined).

Run: `bunx vitest run packages/engine/test/aws.test.ts`
Expected: FAIL on the new/updated assertions.

- [ ] **Step 3: Implement** — `packages/engine/src/adapters/aws.ts`.

Import the knob (extend the existing import):

```ts
import { regionsAreUsRelevant } from "@barometer/types";
```

Add a region parser near the other helpers (after `statusFromArn`):

```ts
/** Region id from a Health event ARN: arn:aws:health:<region>::event/... (empty for global). */
function regionsFromArn(arn: string): string[] {
  const region = arn.split(":")[3] ?? "";
  return region ? [region] : [];
}
```

In `fetchSnapshot`, add `regions` to each incident (in the `events.map`, after `url`):

```ts
          url: INCIDENT_URL,
          regions: regionsFromArn(ev.arn),
```

Guard the status fold (current lines ~166-169) so only US-relevant events count:

```ts
      let overallStatus: ProviderStatus = "operational";
      for (const ev of events) {
        if (!regionsAreUsRelevant(regionsFromArn(ev.arn))) continue;
        overallStatus = worseStatus(overallStatus, deriveEventStatus(ev.status, ev.arn));
      }
```

- [ ] **Step 4: Run — expect PASS**

Run: `bunx vitest run packages/engine/test/aws.test.ts && bun run typecheck`
Expected: all AWS tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/adapters/aws.ts packages/engine/test/aws.test.ts
git commit -m "feat(engine): AWS adapter parses ARN region, scopes status to US"
```

---

### Task 4: Web card — region tags + mute non-US incidents

**Files:**
- Modify: `packages/web/src/render/card.ts`
- Modify: `packages/web/src/styles.css` (muted + tag styling)
- Test: `packages/web/test/render.test.ts`

**Interfaces:**
- Consumes: `isUsRelevant` from `@barometer/types`; `Incident.regions`.

- [ ] **Step 1: Add failing tests** — in `packages/web/test/render.test.ts`, inside `describe("renderCard", …)`:

```ts
  it("mutes and labels a non-US-only incident", () => {
    const p: SummaryProvider = {
      ...provider, status: "operational",
      activeIncidents: [{ id: "n1", title: "APAC latency", impact: "major", status: "monitoring", startedAt: "t", url: "https://x/n1", regions: ["asia-south2"] }],
    };
    const c = renderCard(p, []);
    expect(c.querySelector(".card__incident--muted")).not.toBeNull();
    expect(c.textContent?.toLowerCase()).toContain("not counted");
    expect(c.textContent).toContain("asia-south2");
  });

  it("tags a US/global incident without muting it", () => {
    const p: SummaryProvider = {
      ...provider, status: "partial_outage",
      activeIncidents: [{ id: "u1", title: "Edge errors", impact: "major", status: "monitoring", startedAt: "t", url: "https://x/u1", regions: ["us-east-1", "global"] }],
    };
    const c = renderCard(p, []);
    expect(c.querySelector(".card__incident--muted")).toBeNull();
    expect(c.textContent).toContain("us-east-1");
  });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bunx vitest run packages/web/test/render.test.ts`
Expected: FAIL (no muted class / region text yet).

- [ ] **Step 3: Implement** — `packages/web/src/render/card.ts`.

Add import:

```ts
import { isUsRelevant } from "@barometer/types";
```

Replace the incident block (current lines ~35-52) with:

```ts
  const incident = provider.activeIncidents[0];
  if (incident) {
    const counted = isUsRelevant(incident);
    const para = el("p", counted ? "card__incident" : "card__incident card__incident--muted");
    if (isSafeHttpUrl(incident.url)) {
      const link = el("a");
      link.href = incident.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = incident.title;
      para.appendChild(link);
    } else {
      para.textContent = incident.title;
    }
    if (incident.regions && incident.regions.length > 0) {
      const tag = el("span", "card__regions");
      tag.textContent = counted
        ? incident.regions.join(", ")
        : `${incident.regions.join(", ")} — outside US, not counted`;
      para.appendChild(document.createTextNode(" "));
      para.appendChild(tag);
    }
    card.appendChild(para);
  }
```

- [ ] **Step 4: Add styling** — `packages/web/src/styles.css`, append:

```css
.card__incident--muted { opacity: 0.6; }
.card__regions { font-size: 0.75em; opacity: 0.7; white-space: nowrap; }
```

- [ ] **Step 5: Run — expect PASS** (and the existing statuspage card tests stay green — those incidents have no `regions`, so they render normally).

Run: `bunx vitest run packages/web/test/render.test.ts && bun run typecheck`
Expected: all render tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/render/card.ts packages/web/src/styles.css packages/web/test/render.test.ts
git commit -m "feat(web): tag incident regions, mute non-US-only incidents"
```

---

### Task 5: Full verification + docs

**Files:**
- Modify: `CLAUDE.md` (mark Future-work item done; document the region knob)

- [ ] **Step 1: Full suite + typecheck + build**

Run: `bun run test && bun run typecheck && bun run build`
Expected: all green; engine + web artifacts build.

- [ ] **Step 2: Live end-to-end check**

Run: `bun run dryrun`
Expected: 9 providers; GCP/AWS snapshots now carry `regions` on incidents; any ME/APAC-only incident reads `operational` while still listed. (Network; informational — exact statuses vary.)

- [ ] **Step 3: Update `CLAUDE.md`**

(a) In the availability-rule bullet under "Architecture decisions & rationale", append:

```
  Region scoping is a second knob (`packages/types/src/region.ts`, `isUsRelevant`): an incident
  counts toward the reading only if it has no region data (fail-open), a `global` region, or a
  `us-*` region — so non-US-only incidents stay visible but never flip the US reading or alerts.
```

(b) In "## Future work", delete the entire `### 1. Make Barometer US-specific  ← next task` subsection (through its closing "Start with brainstorming → SPEC.md, not code." line), and renumber `### 2. Other` → `### 1. Other`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark US-region scoping done; document the region knob"
```

---

## Self-review (completed during authoring)

- **Spec coverage:** region knob → T1; schema → T1; GCP → T2; AWS → T3; cascade (no code) → verified by T2/T3 status assertions + T5 dryrun; UI → T4; persistence (current/summary only) → unchanged schemas; docs → T5. ✅
- **Fixture reality encoded:** GCP fixture has `global` (stays `major_outage`); AWS fixture is ME-only (flips to `operational`, two existing assertions updated in T3). ✅
- **Type consistency:** `regionsAreUsRelevant(string[])` used by adapters; `isUsRelevant(Incident)` by web; `regions?: string[]` on `IncidentSchema`. Names match across tasks. ✅
- **No placeholders:** every step has concrete code + exact `bunx vitest run` / `bun run` commands. ✅
