import type { ProviderSnapshot } from "@barometer/types";
import type { ProviderAdapter, AdapterDeps, ProviderConfig, SnapshotFetchContext } from "./types.js";

/**
 * Decorator that fixes v1's "hard-down reads as unknown" blind spot. When a
 * provider is truly down its status page is often down too, so the inner adapter
 * fetch fails → status "unknown" → which the availability rule *excludes* from
 * the reading. A fully-down provider then shows as "instrument fault", not down.
 *
 * This wrapper only acts when the inner snapshot is "unknown": it probes a
 * canonical service endpoint to tell the two cases apart.
 *   - endpoint unreachable (network error / ≥500) → escalate to major_outage
 *     (the honest "it's actually down" reading)
 *   - endpoint reachable                           → keep "unknown" (the status
 *     page hiccuped but the service is up; excluding it is correct)
 *
 * It never touches a non-unknown snapshot (the status page is talking → trust
 * it), so it adds at most one extra request per failing provider per run. Single
 * transient double-failures are absorbed by the alert machine's 2-sample debounce.
 */
export class ProbeFallbackAdapter implements ProviderAdapter {
  readonly id: string;

  constructor(
    private readonly inner: ProviderAdapter,
    private readonly healthProbeUrl: string,
    private readonly config: ProviderConfig,
    private readonly deps: AdapterDeps,
  ) {
    this.id = inner.id;
  }

  async fetchSnapshot(context?: SnapshotFetchContext): Promise<ProviderSnapshot> {
    const snap = await this.inner.fetchSnapshot(context);
    if (snap.status !== "unknown") return snap;

    try {
      const res = await this.deps.fetch(this.healthProbeUrl, { timeoutMs: 5000 });
      if (res.status >= 500) return this.escalate(snap);
      return snap; // reachable (2xx/3xx/4xx) → service is up, status page just hiccuped
    } catch {
      return this.escalate(snap); // network error / timeout → real outage
    }
  }

  private escalate(snap: ProviderSnapshot): ProviderSnapshot {
    return {
      ...snap,
      status: "major_outage",
      activeIncidents: [
        {
          id: `${this.config.id}-probe-fallback`,
          title: "Status page and service endpoint both unreachable",
          impact: "critical",
          status: "active",
          startedAt: this.deps.now(),
          url: this.healthProbeUrl,
        },
      ],
    };
  }
}
