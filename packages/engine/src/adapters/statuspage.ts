import { z } from "zod";
import { overallStatus, type ProviderSnapshot, type ProviderStatus, type Incident } from "@barometer/types";
import type { ProviderAdapter, AdapterDeps, ProviderConfig } from "./types.js";

/**
 * One parametrized adapter for every Atlassian Statuspage provider (Cloudflare,
 * GitHub, Fastly, Anthropic, OpenAI, GitLab). Reads /api/v2/summary.json:
 * overall indicator + components + incidents + scheduled maintenances. SPEC §5.1.
 */

const INDICATOR_MAP: Record<string, ProviderStatus> = {
  none: "operational",
  minor: "degraded",
  major: "partial_outage",
  critical: "major_outage",
};

const COMPONENT_MAP: Record<string, ProviderStatus> = {
  operational: "operational",
  degraded_performance: "degraded",
  partial_outage: "partial_outage",
  major_outage: "major_outage",
  under_maintenance: "maintenance",
};

const IMPACTS = ["none", "minor", "major", "critical"] as const;

const SummarySchema = z.object({
  status: z.object({ indicator: z.string() }).optional(),
  components: z
    .array(z.object({ id: z.string(), name: z.string(), status: z.string() }))
    .optional(),
  incidents: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        impact: z.string(),
        status: z.string(),
        started_at: z.string().optional(),
        created_at: z.string().optional(),
        resolved_at: z.string().nullable().optional(),
        shortlink: z.string().optional(),
      }),
    )
    .optional(),
  scheduled_maintenances: z.array(z.object({ status: z.string() })).optional(),
});

function normalizeImpact(impact: string): Incident["impact"] {
  return (IMPACTS as readonly string[]).includes(impact) ? (impact as Incident["impact"]) : "minor";
}

export class StatuspageAdapter implements ProviderAdapter {
  readonly id: string;
  private readonly sourceUrl: string;

  constructor(
    private readonly config: ProviderConfig,
    private readonly deps: AdapterDeps,
  ) {
    this.id = config.id;
    this.sourceUrl = `${config.url}/api/v2/summary.json`;
  }

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    try {
      const res = await this.deps.fetch(this.sourceUrl);
      if (res.status !== 200) return this.unknown();

      const data = SummarySchema.parse(JSON.parse(res.body));

      const activeIncidents: Incident[] = (data.incidents ?? [])
        .filter((i) => i.resolved_at == null)
        .map((i) => ({
          id: i.id,
          title: i.name,
          impact: normalizeImpact(i.impact),
          status: i.status,
          startedAt: i.started_at ?? i.created_at ?? this.deps.now(),
          url: i.shortlink ?? `${this.config.url}/incidents/${i.id}`,
        }));

      return {
        id: this.config.id,
        displayName: this.config.displayName,
        status: this.deriveStatus(data),
        activeIncidents,
        checkedAt: this.deps.now(),
        sourceUrl: this.sourceUrl,
      };
    } catch {
      return this.unknown();
    }
  }

  private deriveStatus(data: z.infer<typeof SummarySchema>): ProviderStatus {
    const filtered = this.statusFromComponents(data.components ?? []);
    if (filtered) return filtered;

    let status = INDICATOR_MAP[data.status?.indicator ?? ""] ?? "unknown";
    const maintenanceInProgress = (data.scheduled_maintenances ?? []).some(
      (m) => m.status === "in_progress",
    );
    if (status === "operational" && maintenanceInProgress) status = "maintenance";
    return status;
  }

  /** When componentFilter is set, derive status from the worst named component. */
  private statusFromComponents(
    components: { id: string; name: string; status: string }[],
  ): ProviderStatus | null {
    const filter = this.config.componentFilter;
    if (!filter || filter.length === 0) return null;
    const matched = components.filter((c) => filter.includes(c.name) || filter.includes(c.id));
    if (matched.length === 0) return null;

    const statuses = matched.map((c) => COMPONENT_MAP[c.status] ?? "unknown");
    const worst = overallStatus(statuses);
    if (worst !== "unknown") return worst;
    return statuses.some((s) => s === "maintenance") ? "maintenance" : "unknown";
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
