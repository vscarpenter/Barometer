import { z } from "zod";

/**
 * Incident archive (v2). v1 threw resolved incidents away — history was only a
 * ProviderStatus enum per provider per 5 min. This persists incident lifecycle
 * (open → updated → resolved) as a first-class, bounded artifact the dashboard
 * drill-down reads, and the substrate any future RSS/SLA feature builds on.
 */

export const IMPACT_ORDER = ["none", "minor", "major", "critical"] as const;
export const IncidentImpactSchema = z.enum(IMPACT_ORDER);
export type IncidentImpact = z.infer<typeof IncidentImpactSchema>;

/** The more severe of two impacts (peak-impact tracking across a record's life). */
export function maxImpact(a: IncidentImpact, b: IncidentImpact): IncidentImpact {
  return IMPACT_ORDER.indexOf(a) >= IMPACT_ORDER.indexOf(b) ? a : b;
}

export const IncidentRecordSchema = z.object({
  key: z.string(), // `${providerId}:${incident.id}` — stable identity across runs
  providerId: z.string(),
  providerName: z.string(),
  title: z.string(),
  impact: IncidentImpactSchema, // peak impact seen over the record's life
  url: z.string(),
  regions: z.array(z.string()).optional(),
  firstSeen: z.string(), // ISO — first run we saw it active
  lastSeen: z.string(), // ISO — most recent run still active
  resolvedAt: z.string().nullable(), // ISO when it left the active set; null = ongoing
});
export type IncidentRecord = z.infer<typeof IncidentRecordSchema>;

// /history/incidents.json — bounded archive (all ongoing + most recent resolved)
export const IncidentsFileSchema = z.object({
  incidents: z.array(IncidentRecordSchema),
});
export type IncidentsFile = z.infer<typeof IncidentsFileSchema>;
