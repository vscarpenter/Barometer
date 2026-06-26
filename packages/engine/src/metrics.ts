import type { MetricDatum } from "@aws-sdk/client-cloudwatch";
import type { SummaryFile, ProviderStatus } from "@barometer/types";

export const METRIC_NAMESPACE = "Barometer";

/**
 * status -> CloudWatch metric name. Declared as a total Record so adding a new
 * ProviderStatus fails the type check until its metric is named here — the
 * status-count set can never silently fall out of sync with the data model.
 */
const STATUS_METRIC: Record<ProviderStatus, string> = {
  operational: "ProvidersOperational",
  degraded: "ProvidersDegraded",
  partial_outage: "ProvidersPartialOutage",
  major_outage: "ProvidersMajorOutage",
  maintenance: "ProvidersMaintenance",
  unknown: "ProvidersUnknown",
};

/**
 * Custom CloudWatch metrics for a run (SPEC §11). RunSuccess is the heartbeat
 * the meta-monitoring alarm watches (missing => engine broken). Every status
 * bucket is emitted every run — including 0 — so the graphs stay continuous and
 * you can alarm on e.g. "any provider in major_outage". Pure so it is
 * unit-testable without CloudWatch.
 */
export function buildMetrics(summary: SummaryFile, durationMs: number): MetricDatum[] {
  const counts: Record<ProviderStatus, number> = {
    operational: 0,
    degraded: 0,
    partial_outage: 0,
    major_outage: 0,
    maintenance: 0,
    unknown: 0,
  };
  for (const p of summary.providers) counts[p.status]++;

  const metrics: MetricDatum[] = [
    { MetricName: "RunSuccess", Value: 1, Unit: "Count" },
    { MetricName: "RunDurationMs", Value: durationMs, Unit: "Milliseconds" },
    { MetricName: "ProvidersTotal", Value: summary.overall.providersTotal, Unit: "Count" },
  ];

  for (const status of Object.keys(STATUS_METRIC) as ProviderStatus[]) {
    metrics.push({ MetricName: STATUS_METRIC[status], Value: counts[status], Unit: "Count" });
  }

  for (const p of summary.providers) {
    metrics.push({
      MetricName: "FetchSuccess",
      Value: p.status === "unknown" ? 0 : 1,
      Unit: "Count",
      Dimensions: [{ Name: "Provider", Value: p.id }],
    });
  }
  return metrics;
}
