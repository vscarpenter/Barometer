import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProviderSnapshotSchema, type ProviderSnapshot } from "@barometer/types";
import { StatuspageAdapter } from "../src/adapters/statuspage.js";
import type { AdapterDeps, ProviderConfig } from "../src/adapters/types.js";
import type { FetchResult } from "../src/http.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, "..", "fixtures", name), "utf8");

const NOW = "2026-06-25T00:00:00.000Z";

function deps(body: string, status = 200): AdapterDeps {
  const fetch = (async (): Promise<FetchResult> => ({ status, body, etag: null })) as AdapterDeps["fetch"];
  return { fetch, now: () => NOW };
}

const config: ProviderConfig = {
  id: "cloudflare",
  displayName: "Cloudflare",
  type: "statuspage",
  url: "https://www.cloudflarestatus.com",
};

describe("StatuspageAdapter", () => {
  it("maps a healthy page to operational", async () => {
    const snap = await new StatuspageAdapter(config, deps(fixture("statuspage-healthy.json"))).fetchSnapshot();
    expect(snap.status).toBe("operational");
    expect(snap.activeIncidents).toEqual([]);
    expect(snap.id).toBe("cloudflare");
    expect(snap.checkedAt).toBe(NOW);
    expect(snap.sourceUrl).toContain("cloudflarestatus.com");
  });

  it("maps indicator 'major' to partial_outage and surfaces only unresolved incidents", async () => {
    const snap = await new StatuspageAdapter(config, deps(fixture("statuspage-incident.json"))).fetchSnapshot();
    expect(snap.status).toBe("partial_outage");
    expect(snap.activeIncidents).toHaveLength(1);
    const inc = snap.activeIncidents[0]!;
    expect(inc.title).toBe("Elevated 5xx errors on the CDN edge");
    expect(inc.impact).toBe("major");
    expect(inc.status).toBe("investigating");
    expect(inc.url).toBe("https://stspg.io/hp348196t57r");
    expect(inc.startedAt).toBe("2026-06-25T14:02:19.230Z");
  });

  it("maps an in-progress scheduled maintenance to maintenance", async () => {
    const snap = await new StatuspageAdapter(config, deps(fixture("statuspage-maintenance.json"))).fetchSnapshot();
    expect(snap.status).toBe("maintenance");
  });

  it("derives status from a componentFilter when provided", async () => {
    const filtered: ProviderConfig = {
      ...config,
      componentFilter: ["Cloudflare Sites and Services - Workers AI"],
    };
    const snap = await new StatuspageAdapter(filtered, deps(fixture("statuspage-incident.json"))).fetchSnapshot();
    // The filtered component is partial_outage even though only one component is named.
    expect(snap.status).toBe("partial_outage");
  });

  it("degrades to unknown on a malformed body without throwing", async () => {
    const snap = await new StatuspageAdapter(config, deps("not json {{{")).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
  });

  it("degrades to unknown on a non-200 response", async () => {
    const snap = await new StatuspageAdapter(config, deps("", 500)).fetchSnapshot();
    expect(snap.status).toBe("unknown");
  });

  it("reuses the previous snapshot on 304 and records the new ETag", async () => {
    let seenEtag: string | null | undefined;
    let recordedEtag: string | null | undefined;
    const fetch: AdapterDeps["fetch"] = async (_url, opts) => {
      seenEtag = opts?.etag;
      return { status: 304, body: "", etag: "\"new\"" };
    };
    const previous: ProviderSnapshot = {
      id: "cloudflare",
      displayName: "Cloudflare",
      status: "partial_outage",
      activeIncidents: [],
      checkedAt: "2026-06-24T00:00:00.000Z",
      sourceUrl: "https://old",
    };

    const snap = await new StatuspageAdapter(config, { fetch, now: () => NOW }).fetchSnapshot({
      etag: "\"old\"",
      previousSnapshot: previous,
      recordEtag: (etag) => {
        recordedEtag = etag;
      },
    });

    expect(seenEtag).toBe("\"old\"");
    expect(recordedEtag).toBe("\"new\"");
    expect(snap.status).toBe("partial_outage");
    expect(snap.checkedAt).toBe(NOW);
    expect(snap.sourceUrl).toBe("https://www.cloudflarestatus.com/api/v2/summary.json");
  });

  it("always emits a schema-valid snapshot", async () => {
    for (const f of ["statuspage-healthy.json", "statuspage-incident.json", "statuspage-maintenance.json"]) {
      const snap = await new StatuspageAdapter(config, deps(fixture(f))).fetchSnapshot();
      expect(ProviderSnapshotSchema.safeParse(snap).success).toBe(true);
    }
  });
});
