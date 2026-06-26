import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import type { SummaryFile } from "@barometer/types";
import { fetchWithRetry } from "./http.js";
import { buildAdapters } from "./adapters/factory.js";
import { loadProviders } from "./config/providers.js";
import { S3Store } from "./store/s3.js";
import { SnsNotifier } from "./alerting/notifier.js";
import { runOnce } from "./run.js";
import { buildMetrics, METRIC_NAMESPACE } from "./metrics.js";

/**
 * Lambda entry point (EventBridge Scheduler trigger). Wires the S3 store + SNS
 * notifier from env and runs one cycle. One provider failing never fails the
 * run; only infra failures (S3/SNS) throw, surfacing to the CloudWatch Errors
 * alarm. Metrics are best-effort and never fail the run. SPEC §6, §11.
 */
export async function handler(): Promise<void> {
  const start = Date.now();
  const bucket = requireEnv("BUCKET");
  const topicArn = requireEnv("SNS_TOPIC_ARN");

  const adapters = buildAdapters(loadProviders(process.env), {
    fetch: fetchWithRetry,
    now: () => new Date().toISOString(),
  });

  try {
    const summary = await runOnce({
      adapters,
      store: new S3Store(bucket),
      notifier: new SnsNotifier(topicArn),
      now: () => new Date(),
    });
    const durationMs = Date.now() - start;
    log({
      event: "run_complete",
      durationMs,
      overall: summary.overall.status,
      providersOperational: summary.overall.providersOperational,
      providersTotal: summary.overall.providersTotal,
      providers: summary.providers.map((p) => ({ id: p.id, status: p.status })),
    });
    await emitMetrics(summary, durationMs);
  } catch (err) {
    log({ event: "run_failed", error: err instanceof Error ? err.message : String(err) });
    throw err; // surface to Lambda -> CloudWatch Errors alarm fires
  }
}

async function emitMetrics(summary: SummaryFile, durationMs: number): Promise<void> {
  try {
    await new CloudWatchClient({}).send(
      new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: buildMetrics(summary, durationMs),
      }),
    );
  } catch (err) {
    log({ event: "metrics_failed", error: err instanceof Error ? err.message : String(err) });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}
