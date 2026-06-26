import type { ProviderStatus, ProviderSnapshot, OverallReading } from "./status.js";
import { classify } from "./availability.js";

/**
 * Severity rank for the worst-case overall reading (SPEC §4). maintenance and
 * unknown are intentionally absent — they do not worsen the headline. A
 * provider in maintenance can't turn the whole barometer "Stormy".
 */
const SEVERITY: Record<"operational" | "degraded" | "partial_outage" | "major_outage", number> = {
  operational: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

const WEATHER_LABELS: Record<ProviderStatus, string> = {
  operational: "Fair — all clear (high pressure)",
  degraded: "Changeable",
  partial_outage: "Unsettled",
  major_outage: "Stormy",
  maintenance: "Scheduled maintenance",
  unknown: "Reading unavailable",
};

export function weatherLabel(status: ProviderStatus): string {
  return WEATHER_LABELS[status];
}

/**
 * Worst-case aggregate across providers. Considers only non-excluded statuses;
 * if none are present (all maintenance/unknown, or empty) the reading is
 * "unknown" — an instrument fault, usually paired with the stale banner.
 */
export function overallStatus(statuses: ProviderStatus[]): ProviderStatus {
  let worst: ProviderStatus | null = null;
  let worstRank = 0;
  for (const status of statuses) {
    if (classify(status) === "excluded") continue;
    const rank = SEVERITY[status as keyof typeof SEVERITY];
    if (rank > worstRank) {
      worstRank = rank;
      worst = status;
    }
  }
  return worst ?? "unknown";
}

export function buildOverallReading(
  snapshots: ProviderSnapshot[],
  generatedAt: string,
): OverallReading {
  const status = overallStatus(snapshots.map((s) => s.status));
  return {
    status,
    label: weatherLabel(status),
    providersOperational: snapshots.filter((s) => s.status === "operational").length,
    providersTotal: snapshots.length,
    generatedAt,
  };
}
