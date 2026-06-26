import { z } from "zod";
import { type ProviderSnapshot, type ProviderStatus, type Incident } from "@barometer/types";
import type { ProviderAdapter, AdapterDeps, ProviderConfig } from "./types.js";

/**
 * Adapter for the AWS Health public endpoint. Fetches:
 *   GET https://health.aws.amazon.com/public/currentevents
 * The raw bytes are UTF-16BE (BOM feff); the http client decodes them to UTF-8
 * before this adapter sees the body. The response is a JSON array of current
 * (active) events — empty array means fully operational.
 *
 * Status mapping (numeric string codes observed in the wild):
 *   "0" → operational
 *   "1" → degraded      (early investigating stage)
 *   "2" → degraded      (identified; still degraded severity)
 *   "3" → partial_outage (broader impact confirmed)
 *   "4"+ → major_outage  (conservatively escalated)
 *
 * ARN-type modifier (applied as the worse of code-derived and arn-derived):
 *   *OPERATIONAL_ISSUE* → at least partial_outage
 *   *INFORMATIONAL*     → degraded
 *   *MAINTENANCE*       → maintenance
 *
 * Lifecycle label (Incident.status) derived from the numeric code:
 *   "0" → "resolved"
 *   "1" → "investigating"
 *   "2" → "identified"
 *   "3" → "monitoring"
 *   other → "active"
 */

// config.url is the full feed endpoint (https://health.aws.amazon.com/public/currentevents).
// INCIDENT_URL is the separate human-facing dashboard link surfaced on incidents.
const INCIDENT_URL = "https://health.aws.amazon.com/health/status";

// ── Status derivation ────────────────────────────────────────────────────────

const CODE_STATUS: Record<string, ProviderStatus> = {
  "0": "operational",
  "1": "degraded",
  "2": "degraded",
  "3": "partial_outage",
};

function statusFromCode(code: string): ProviderStatus {
  return CODE_STATUS[code] ?? "major_outage"; // ≥4 treated as major conservatively
}

function statusFromArn(arn: string): ProviderStatus | null {
  if (arn.includes("OPERATIONAL_ISSUE")) return "partial_outage";
  if (arn.includes("INFORMATIONAL")) return "degraded";
  if (arn.includes("MAINTENANCE")) return "maintenance";
  return null;
}

/**
 * Severity rank for "use the worse of two statuses".
 * maintenance sits just above operational — an outage always wins over maintenance.
 * unknown is excluded from comparison (rank -1); the other value wins.
 */
const SEVERITY_RANK: Record<ProviderStatus, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
  unknown: -1,
};

function worseStatus(a: ProviderStatus, b: ProviderStatus): ProviderStatus {
  const ra = SEVERITY_RANK[a];
  const rb = SEVERITY_RANK[b];
  if (ra === -1) return b;
  if (rb === -1) return a;
  return ra >= rb ? a : b;
}

function deriveEventStatus(code: string, arn: string): ProviderStatus {
  const codeStatus = statusFromCode(code);
  const arnStatus = statusFromArn(arn);
  return arnStatus ? worseStatus(codeStatus, arnStatus) : codeStatus;
}

// ── Incident lifecycle label ─────────────────────────────────────────────────

const LIFECYCLE_LABELS: Record<string, string> = {
  "0": "resolved",
  "1": "investigating",
  "2": "identified",
  "3": "monitoring",
};

function lifecycleLabel(code: string): string {
  return LIFECYCLE_LABELS[code] ?? "active";
}

// ── Zod schema ───────────────────────────────────────────────────────────────
// Defensive: validate ONLY the fields this adapter reads, so unrelated shape
// changes (event_log, impacted_services) never force the snapshot to "unknown".
// Zod's default strip mode drops everything else.

const AwsEventSchema = z.object({
  date: z.string(),
  arn: z.string(),
  status: z.string(),
  service_name: z.string(),
  summary: z.string(),
});

const AwsEventsSchema = z.array(AwsEventSchema);

// ── Adapter ──────────────────────────────────────────────────────────────────

export class AwsAdapter implements ProviderAdapter {
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

      const events = AwsEventsSchema.parse(JSON.parse(res.body));

      if (events.length === 0) {
        return {
          id: this.config.id,
          displayName: this.config.displayName,
          status: "operational",
          activeIncidents: [],
          checkedAt: this.deps.now(),
          sourceUrl: this.sourceUrl,
        };
      }

      const activeIncidents: Incident[] = events.map((ev) => {
        const rawMs = Number(ev.date) * 1000;
        const startedAt = isNaN(rawMs) ? this.deps.now() : new Date(rawMs).toISOString();

        return {
          id: ev.arn,
          title: `${ev.summary} (${ev.service_name})`,
          impact: ev.arn.includes("OPERATIONAL_ISSUE") ? "major" : "minor",
          status: lifecycleLabel(ev.status),
          startedAt,
          url: INCIDENT_URL,
        };
      });

      // Overall = worst single-event status across all current events
      let overallStatus: ProviderStatus = "operational";
      for (const ev of events) {
        overallStatus = worseStatus(overallStatus, deriveEventStatus(ev.status, ev.arn));
      }

      return {
        id: this.config.id,
        displayName: this.config.displayName,
        status: overallStatus,
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
