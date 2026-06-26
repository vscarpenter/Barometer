import { z } from "zod";

/**
 * Normalized provider status. Ordered operational -> unknown; the "down"
 * severity (degraded < partial_outage < major_outage) is contiguous so the
 * aggregation rank in aggregate.ts reads naturally. See SPEC.md §3-4.
 */
export const PROVIDER_STATUSES = [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
  "unknown",
] as const;

export const ProviderStatusSchema = z.enum(PROVIDER_STATUSES);
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const IncidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  impact: z.enum(["none", "minor", "major", "critical"]),
  status: z.string(), // provider's lifecycle label, e.g. "investigating"
  startedAt: z.string(), // ISO 8601
  url: z.string(),
  regions: z.array(z.string()).optional(), // affected region ids; absent = unknown (fail-open)
});
export type Incident = z.infer<typeof IncidentSchema>;

export const ProviderSnapshotSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  status: ProviderStatusSchema,
  activeIncidents: z.array(IncidentSchema),
  checkedAt: z.string(), // ISO 8601, when we fetched it
  sourceUrl: z.string(),
});
export type ProviderSnapshot = z.infer<typeof ProviderSnapshotSchema>;

export const OverallReadingSchema = z.object({
  status: ProviderStatusSchema,
  label: z.string(), // barometer-themed presentation label
  providersOperational: z.number(),
  providersTotal: z.number(),
  generatedAt: z.string(), // ISO 8601
});
export type OverallReading = z.infer<typeof OverallReadingSchema>;
