import { z } from "zod";
import { regionsAreUsRelevant } from "@barometer/types";
import type { ProviderSnapshot, ProviderStatus, Incident } from "@barometer/types";
import type { ProviderAdapter, AdapterDeps, ProviderConfig } from "./types.js";

/**
 * Adapter for Google Cloud Platform status.
 * Reads config.url (https://status.cloud.google.com/incidents.json) — a flat
 * JSON array where each element is an incident. Active incidents have no `end`
 * field. SPEC §5.2.
 */

const STATUS_IMPACT_TO_PROVIDER_STATUS: Record<string, ProviderStatus> = {
  SERVICE_OUTAGE: "major_outage",
  SERVICE_DISRUPTION: "partial_outage",
  SERVICE_INFORMATION: "degraded",
};

const SEVERITY_TO_IMPACT: Record<string, Incident["impact"]> = {
  high: "critical",
  medium: "major",
  low: "minor",
};

const GcpIncidentSchema = z.object({
  id: z.string(),
  begin: z.string(),
  end: z.string().nullish(), // absent OR null both mean "still active"
  external_desc: z.string(),
  most_recent_update: z.object({ status: z.string() }).optional(),
  status_impact: z.string(),
  severity: z.string(),
  uri: z.string(),
  currently_affected_locations: z.array(z.object({ id: z.string() })).nullish(),
});

const GcpResponseSchema = z.array(GcpIncidentSchema);

function worstProviderStatus(statuses: ProviderStatus[]): ProviderStatus {
  const rank: Record<string, number> = {
    degraded: 1,
    partial_outage: 2,
    major_outage: 3,
  };
  return statuses.reduce<ProviderStatus>((worst, s) => {
    return (rank[s] ?? 0) > (rank[worst] ?? 0) ? s : worst;
  }, "operational");
}

export class GcpAdapter implements ProviderAdapter {
  readonly id: string;
  private readonly sourceUrl: string;

  constructor(
    private readonly config: ProviderConfig,
    private readonly deps: AdapterDeps,
  ) {
    this.id = config.id;
    this.sourceUrl = config.url;
  }

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    try {
      const res = await this.deps.fetch(this.sourceUrl);
      if (res.status !== 200) return this.unknown();

      const incidents = GcpResponseSchema.parse(JSON.parse(res.body));
      const activeRaw = incidents.filter((i) => !i.end);

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

      return {
        id: this.config.id,
        displayName: this.config.displayName,
        status,
        activeIncidents,
        checkedAt: this.deps.now(),
        sourceUrl: this.sourceUrl,
      };
    } catch {
      return this.unknown();
    }
  }

  private unknown(): ProviderSnapshot {
    return {
      id: this.config.id,
      displayName: this.config.displayName,
      status: "unknown",
      activeIncidents: [],
      checkedAt: this.deps.now(),
      sourceUrl: this.sourceUrl,
    };
  }
}
