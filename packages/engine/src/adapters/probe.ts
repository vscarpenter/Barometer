import type { ProviderSnapshot, ProviderStatus, Incident } from "@barometer/types";
import type { ProviderAdapter, AdapterDeps, ProviderConfig, ProbeConfig } from "./types.js";

/**
 * Active-reachability adapter (v2 signal honesty). Instead of reading a vendor
 * status page, it actually GETs an endpoint and maps the outcome to a status —
 * an independent signal that catches "the status page says green but it's down",
 * and covers the foundational layer (DNS, via DNS-over-HTTPS endpoints) that the
 * status-page adapters can't. Never throws: every failure maps to a status.
 *
 *   2xx/3xx within timeout                → operational (degraded if slow + degradedMs set)
 *   4xx (reachable but erroring)          → degraded
 *   ≥500 / network error / timeout        → major_outage
 */
export function classifyProbe(
  httpStatus: number,
  elapsedMs: number,
  degradedMs?: number,
): { status: ProviderStatus; reason: string | null } {
  if (httpStatus >= 500) return { status: "major_outage", reason: `HTTP ${httpStatus}` };
  if (httpStatus >= 400) return { status: "degraded", reason: `HTTP ${httpStatus}` };
  if (httpStatus >= 200) {
    if (degradedMs !== undefined && elapsedMs > degradedMs) {
      return { status: "degraded", reason: `Slow response (${elapsedMs}ms)` };
    }
    return { status: "operational", reason: null };
  }
  return { status: "degraded", reason: `HTTP ${httpStatus}` };
}

export class ProbeAdapter implements ProviderAdapter {
  readonly id: string;
  private readonly probe: ProbeConfig;

  constructor(
    private readonly config: ProviderConfig,
    private readonly deps: AdapterDeps,
  ) {
    this.id = config.id;
    // Fall back to the provider url if no explicit probe block is given.
    this.probe = config.probe ?? { url: config.url };
  }

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    const clock = this.deps.monotonicMs ?? (() => Date.now());
    const start = clock();
    try {
      const res = await this.deps.fetch(this.probe.url, {
        timeoutMs: this.probe.timeoutMs ?? 5000,
        ...(this.probe.headers ? { headers: this.probe.headers } : {}),
      });
      const elapsed = clock() - start;
      const { status, reason } = classifyProbe(res.status, elapsed, this.probe.degradedMs);
      return this.snapshot(status, reason);
    } catch {
      return this.snapshot("major_outage", "Endpoint unreachable");
    }
  }

  private snapshot(status: ProviderStatus, reason: string | null): ProviderSnapshot {
    const incidents: Incident[] =
      status === "operational" || reason === null
        ? []
        : [
            {
              id: `${this.config.id}-probe`,
              title: reason,
              impact: status === "major_outage" ? "critical" : "minor",
              status: "active",
              startedAt: this.deps.now(),
              url: this.probe.url,
            },
          ];
    return {
      id: this.config.id,
      displayName: this.config.displayName,
      status,
      activeIncidents: incidents,
      checkedAt: this.deps.now(),
      sourceUrl: this.probe.url,
    };
  }
}
