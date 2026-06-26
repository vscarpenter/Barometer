import { z } from "zod";
import { ProviderStatusSchema, ProviderSnapshotSchema, OverallReadingSchema } from "./status.js";

/** Uptime over the four windows; null means "no data" (denominator 0). SPEC §4. */
export const UptimeWindowsSchema = z.object({
  "24h": z.number().nullable(),
  "7d": z.number().nullable(),
  "30d": z.number().nullable(),
  "90d": z.number().nullable(),
});
export type UptimeWindows = z.infer<typeof UptimeWindowsSchema>;

// /status/current.json — latest raw snapshot
export const CurrentFileSchema = z.object({
  generatedAt: z.string(),
  overall: OverallReadingSchema,
  providers: z.array(ProviderSnapshotSchema),
});
export type CurrentFile = z.infer<typeof CurrentFileSchema>;

// /status/summary.json — headline + per-provider current + uptime windows (polled by the UI)
export const SummaryProviderSchema = ProviderSnapshotSchema.extend({
  uptime: UptimeWindowsSchema,
});
export type SummaryProvider = z.infer<typeof SummaryProviderSchema>;

export const SummaryFileSchema = z.object({
  overall: OverallReadingSchema,
  providers: z.array(SummaryProviderSchema),
  generatedAt: z.string(),
});
export type SummaryFile = z.infer<typeof SummaryFileSchema>;

// /status/state.json — alert state machine (internal; never served to the UI)
export const ProviderAlertStateSchema = z.object({
  alertState: z.enum(["operational", "alerting"]),
  triggeringStatus: ProviderStatusSchema.nullable(),
  pendingStatus: ProviderStatusSchema.nullable(),
  consecutiveCount: z.number(),
  lastTransitionAt: z.string(),
  etag: z.string().nullable(),
});
export type ProviderAlertState = z.infer<typeof ProviderAlertStateSchema>;

export const StateFileSchema = z.object({
  providers: z.record(z.string(), ProviderAlertStateSchema),
  updatedAt: z.string(),
});
export type StateFile = z.infer<typeof StateFileSchema>;

// /history/recent.json — last 48h @ 5-min, trimmed every run
export const RecentSampleSchema = z.object({
  t: z.string(), // ISO 8601
  s: z.record(z.string(), ProviderStatusSchema),
});
export type RecentSample = z.infer<typeof RecentSampleSchema>;

export const RecentFileSchema = z.object({
  samples: z.array(RecentSampleSchema),
});
export type RecentFile = z.infer<typeof RecentFileSchema>;

// /history/rollups.json — last 90 daily buckets
export const DayBucketSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  providers: z.record(z.string(), z.object({ up: z.number(), down: z.number() })),
});
export type DayBucket = z.infer<typeof DayBucketSchema>;

export const RollupsFileSchema = z.object({
  days: z.array(DayBucketSchema),
});
export type RollupsFile = z.infer<typeof RollupsFileSchema>;
