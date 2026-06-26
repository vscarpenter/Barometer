import type { MetricDatum } from "@aws-sdk/client-cloudwatch";
import type { SummaryFile } from "@barometer/types";

export const METRIC_NAMESPACE = "Barometer";

/**
 * Custom CloudWatch metrics for a run (SPEC §11). RunSuccess is the heartbeat
 * the meta-monitoring alarm watches (missing => engine broken). Pure so it is
 * unit-testable without CloudWatch.
 */
export function buildMetrics(summary: SummaryFile, durationMs: number): MetricDatum[] {
  const unknown = summary.providers.filter((p) => p.status === "unknown").length;
  const metrics: MetricDatum[] = [
    { MetricName: "RunSuccess", Value: 1, Unit: "Count" },
    { MetricName: "RunDurationMs", Value: durationMs, Unit: "Milliseconds" },
    { MetricName: "ProvidersOperational", Value: summary.overall.providersOperational, Unit: "Count" },
    { MetricName: "ProvidersTotal", Value: summary.overall.providersTotal, Unit: "Count" },
    { MetricName: "ProvidersUnknown", Value: unknown, Unit: "Count" },
  ];
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
