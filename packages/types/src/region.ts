import type { Incident } from "./status.js";

/**
 * US-region policy — the single knob (sibling to availability.ts). A region id
 * is US-relevant if it is `global` or starts with `us-` (GCP `us-central1`,
 * AWS `us-east-1` / `us-gov-*`). SPEC: 2026-06-26-us-region-scoping-design.md.
 */
export function isUsRegion(id: string): boolean {
  return id === "global" || id.startsWith("us-");
}

/**
 * Do these regions count toward the US reading?
 *  - no data                          → fail-open (count it)
 *  - any explicit `us-*` region       → count it
 *  - only `global` (nothing specific) → count it (truly worldwide)
 *  - specific non-US regions named, none US → exclude
 *
 * The last rule is why this isn't a plain `.some(isUsRegion)`: feeds tag a
 * region-specific incident with a stray `global` token (GCP labels the
 * Delhi/Mumbai networking event `["asia-south2","global"]`). When specific
 * regions are present, we trust them and ignore the `global` co-tag, so a
 * non-US outage never flips the US reading.
 */
export function regionsAreUsRelevant(regions: string[] | undefined): boolean {
  const r = regions ?? [];
  if (r.length === 0) return true;
  if (r.some((id) => id.startsWith("us-"))) return true;
  return r.every((id) => id === "global");
}

/** Convenience over a built Incident — used by the web card. */
export function isUsRelevant(incident: Incident): boolean {
  return regionsAreUsRelevant(incident.regions);
}
