import type { ProviderStatus, SummaryProvider } from "@barometer/types";
import { classify } from "@barometer/types";

/**
 * Display severity rank for worst-first ordering. Distinct from the schema's
 * PROVIDER_STATUSES order (which puts unknown last): on a bad day the user wants
 * the *problems* at the top, operational sunk to the bottom, and the ambiguous
 * hold states (maintenance/unknown) in between.
 */
const DISPLAY_RANK: Record<ProviderStatus, number> = {
  major_outage: 0,
  partial_outage: 1,
  degraded: 2,
  maintenance: 3,
  unknown: 4,
  operational: 5,
};

export function severityRank(status: ProviderStatus): number {
  return DISPLAY_RANK[status];
}

/** Worst-first, then alphabetical. Does not mutate the input. */
export function sortProvidersBySeverity<T extends Pick<SummaryProvider, "status" | "displayName">>(
  providers: readonly T[],
): T[] {
  return [...providers].sort(
    (a, b) => severityRank(a.status) - severityRank(b.status) || a.displayName.localeCompare(b.displayName),
  );
}

/**
 * The down providers (worst-first) — the ones the headline names as offenders.
 * "Down" comes straight from the availability knob (classify), so this can never
 * drift from the reading it sits beside if that rule ever changes.
 */
export function offenders<T extends Pick<SummaryProvider, "status" | "displayName">>(
  providers: readonly T[],
): T[] {
  return sortProvidersBySeverity(providers.filter((p) => classify(p.status) === "down"));
}
