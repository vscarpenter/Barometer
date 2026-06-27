import { describe, it, expect } from "vitest";
import { ProviderSnapshotSchema, type ProviderSnapshot, type ProviderStatus } from "@barometer/types";
import { ProbeFallbackAdapter } from "../src/adapters/probeFallback.js";
import type { AdapterDeps, ProviderAdapter, ProviderConfig } from "../src/adapters/types.js";
import type { FetchResult } from "../src/http.js";

const NOW = "2026-06-25T00:00:00.000Z";

const config: ProviderConfig = {
  id: "github",
  displayName: "GitHub",
  type: "statuspage",
  url: "https://www.githubstatus.com",
  healthProbe: "https://api.github.com",
};

function innerReturning(status: ProviderStatus): ProviderAdapter {
  const snap: ProviderSnapshot = {
    id: config.id,
    displayName: config.displayName,
    status,
    activeIncidents: [],
    checkedAt: NOW,
    sourceUrl: "https://www.githubstatus.com/api/v2/summary.json",
  };
  return { id: config.id, fetchSnapshot: async () => snap };
}

function deps(probe: { status?: number; throws?: boolean }): AdapterDeps {
  const fetch = (async (): Promise<FetchResult> => {
    if (probe.throws) throw new Error("network down");
    return { status: probe.status ?? 200, body: "", etag: null };
  }) as AdapterDeps["fetch"];
  return { fetch, now: () => NOW };
}

describe("ProbeFallbackAdapter", () => {
  it("passes through a non-unknown inner snapshot without probing", async () => {
    let probed = false;
    const d: AdapterDeps = {
      fetch: (async () => {
        probed = true;
        return { status: 200, body: "", etag: null };
      }) as AdapterDeps["fetch"],
      now: () => NOW,
    };
    const snap = await new ProbeFallbackAdapter(innerReturning("operational"), config.healthProbe!, config, d).fetchSnapshot();
    expect(snap.status).toBe("operational");
    expect(probed).toBe(false);
  });

  it("escalates unknown to major_outage when the endpoint is unreachable", async () => {
    const snap = await new ProbeFallbackAdapter(
      innerReturning("unknown"),
      config.healthProbe!,
      config,
      deps({ throws: true }),
    ).fetchSnapshot();
    expect(snap.status).toBe("major_outage");
    expect(snap.activeIncidents).toHaveLength(1);
    expect(snap.activeIncidents[0]!.title).toMatch(/both unreachable/i);
  });

  it("escalates unknown to major_outage on a 5xx endpoint", async () => {
    const snap = await new ProbeFallbackAdapter(
      innerReturning("unknown"),
      config.healthProbe!,
      config,
      deps({ status: 503 }),
    ).fetchSnapshot();
    expect(snap.status).toBe("major_outage");
  });

  it("keeps unknown when the endpoint is reachable (status page hiccup, service up)", async () => {
    const snap = await new ProbeFallbackAdapter(
      innerReturning("unknown"),
      config.healthProbe!,
      config,
      deps({ status: 200 }),
    ).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
  });

  it("keeps unknown on a 4xx (reachable, server responding)", async () => {
    const snap = await new ProbeFallbackAdapter(
      innerReturning("unknown"),
      config.healthProbe!,
      config,
      deps({ status: 404 }),
    ).fetchSnapshot();
    expect(snap.status).toBe("unknown");
  });

  it("emits schema-valid snapshots", async () => {
    const snap = await new ProbeFallbackAdapter(
      innerReturning("unknown"),
      config.healthProbe!,
      config,
      deps({ throws: true }),
    ).fetchSnapshot();
    expect(ProviderSnapshotSchema.safeParse(snap).success).toBe(true);
  });
});
