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
