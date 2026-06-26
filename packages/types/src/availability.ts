import type { ProviderStatus } from "./status.js";

/**
 * The single availability knob driving uptime math, aggregation, and alerting.
 * SPEC §4: operational = up; degraded/partial_outage/major_outage = down;
 * maintenance/unknown = excluded (neither up nor down — planned work and our
 * own fetch failures never punish a provider's score).
 */
export type Availability = "up" | "down" | "excluded";

export function classify(status: ProviderStatus): Availability {
  switch (status) {
    case "operational":
      return "up";
    case "degraded":
    case "partial_outage":
    case "major_outage":
      return "down";
    case "maintenance":
    case "unknown":
      return "excluded";
  }
}
