import { describe, it, expect } from "vitest";
import { ProviderSnapshotSchema } from "@barometer/types";
import { ProbeAdapter, classifyProbe } from "../src/adapters/probe.js";
import type { AdapterDeps, ProviderConfig } from "../src/adapters/types.js";
import type { FetchResult } from "../src/http.js";

const NOW = "2026-06-25T00:00:00.000Z";

const config: ProviderConfig = {
  id: "cloudflare-dns",
  displayName: "Cloudflare DNS",
  type: "probe",
  url: "https://1.1.1.1/dns-query?name=example.com&type=A",
  probe: { url: "https://1.1.1.1/dns-query?name=example.com&type=A", degradedMs: 1500 },
};

/** Build deps whose fetch returns a status and advances a shared clock by `elapsedMs`. */
function deps(opts: { status?: number; throws?: boolean; elapsedMs?: number }): AdapterDeps {
  const clock = { t: 0 };
  const fetch = (async (): Promise<FetchResult> => {
    clock.t += opts.elapsedMs ?? 0;
    if (opts.throws) throw new Error("network down");
    return { status: opts.status ?? 200, body: "{}", etag: null };
  }) as AdapterDeps["fetch"];
  return { fetch, now: () => NOW, monotonicMs: () => clock.t };
}

describe("classifyProbe", () => {
  it("maps reachable to operational", () => {
    expect(classifyProbe(200, 10).status).toBe("operational");
    expect(classifyProbe(301, 10).status).toBe("operational");
  });
  it("maps slow reachable to degraded when degradedMs is set", () => {
    expect(classifyProbe(200, 2000, 1500).status).toBe("degraded");
    expect(classifyProbe(200, 1000, 1500).status).toBe("operational");
  });
  it("maps 4xx to degraded and 5xx to major_outage", () => {
    expect(classifyProbe(404, 10).status).toBe("degraded");
    expect(classifyProbe(503, 10).status).toBe("major_outage");
  });
});

describe("ProbeAdapter", () => {
  it("reads operational on a fast 200 with no incidents", async () => {
    const snap = await new ProbeAdapter(config, deps({ status: 200, elapsedMs: 50 })).fetchSnapshot();
    expect(snap.status).toBe("operational");
    expect(snap.activeIncidents).toEqual([]);
    expect(snap.id).toBe("cloudflare-dns");
    expect(snap.checkedAt).toBe(NOW);
  });

  it("reads degraded on a slow response and synthesizes an incident", async () => {
    const snap = await new ProbeAdapter(config, deps({ status: 200, elapsedMs: 3000 })).fetchSnapshot();
    expect(snap.status).toBe("degraded");
    expect(snap.activeIncidents).toHaveLength(1);
    expect(snap.activeIncidents[0]!.title).toMatch(/slow response/i);
  });

  it("reads major_outage on a network error", async () => {
    const snap = await new ProbeAdapter(config, deps({ throws: true })).fetchSnapshot();
    expect(snap.status).toBe("major_outage");
    expect(snap.activeIncidents[0]!.title).toMatch(/unreachable/i);
    expect(snap.activeIncidents[0]!.impact).toBe("critical");
  });

  it("reads major_outage on a 5xx", async () => {
    const snap = await new ProbeAdapter(config, deps({ status: 503 })).fetchSnapshot();
    expect(snap.status).toBe("major_outage");
  });

  it("always emits a schema-valid snapshot", async () => {
    for (const o of [{ status: 200 }, { status: 503 }, { throws: true }] as const) {
      const snap = await new ProbeAdapter(config, deps(o)).fetchSnapshot();
      expect(ProviderSnapshotSchema.safeParse(snap).success).toBe(true);
    }
  });
});
