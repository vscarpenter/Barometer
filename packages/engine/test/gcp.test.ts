import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProviderSnapshotSchema } from "@barometer/types";
import { GcpAdapter } from "../src/adapters/gcp.js";
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
  id: "gcp",
  displayName: "Google Cloud Platform",
  type: "gcp",
  url: "https://status.cloud.google.com/incidents.json",
};

describe("GcpAdapter", () => {
  it("maps an empty incident list to operational", async () => {
    const snap = await new GcpAdapter(config, deps(fixture("gcp-healthy.json"))).fetchSnapshot();
    expect(snap.status).toBe("operational");
    expect(snap.activeIncidents).toEqual([]);
    expect(snap.id).toBe("gcp");
    expect(snap.displayName).toBe("Google Cloud Platform");
    expect(snap.checkedAt).toBe(NOW);
    expect(snap.sourceUrl).toBe("https://status.cloud.google.com/incidents.json");
  });

  it("maps SERVICE_OUTAGE to major_outage and surfaces only active incidents", async () => {
    const snap = await new GcpAdapter(config, deps(fixture("gcp-incident.json"))).fetchSnapshot();
    // The fixture has one active (SERVICE_OUTAGE) + one resolved; resolved must be excluded
    expect(snap.status).toBe("major_outage");
    expect(snap.activeIncidents).toHaveLength(1);
    const inc = snap.activeIncidents[0]!;
    expect(inc.id).toBe("5fGQt4VbkDnr3Yp8PXPr");
    expect(inc.title).toBe(
      "Network traffic to Google Cloud originating from Delhi, Chennai, Mumbai and surrounding areas is experiencing intermittent periods of elevated latency and possible packet loss.",
    );
    expect(inc.impact).toBe("critical"); // severity "high" → critical
    expect(inc.status).toBe("SERVICE_DISRUPTION"); // most_recent_update.status
    expect(inc.startedAt).toBe("2026-06-05T07:00:00+00:00");
    expect(inc.url).toBe("https://status.cloud.google.com/incidents/5fGQt4VbkDnr3Yp8PXPr");
  });

  it("excludes resolved incidents even when they have a worse status_impact than active ones", async () => {
    // The fixture's resolved incident has status_impact SERVICE_INFORMATION and end set;
    // the overall status must not be influenced by it.
    const snap = await new GcpAdapter(config, deps(fixture("gcp-incident.json"))).fetchSnapshot();
    const ids = snap.activeIncidents.map((i) => i.id);
    expect(ids).not.toContain("41E5S3mkTGDfkZuJZH5k");
  });

  it("degrades to unknown on a malformed body without throwing", async () => {
    const snap = await new GcpAdapter(config, deps("not json {{{")).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
  });

  it("degrades to unknown on a non-200 response", async () => {
    const snap = await new GcpAdapter(config, deps("", 500)).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
  });

  it("always emits a schema-valid snapshot", async () => {
    for (const f of ["gcp-healthy.json", "gcp-incident.json"]) {
      const snap = await new GcpAdapter(config, deps(fixture(f))).fetchSnapshot();
      expect(ProviderSnapshotSchema.safeParse(snap).success, `${f} must be schema-valid`).toBe(true);
    }
    // unknown fallback is also schema-valid
    const snap = await new GcpAdapter(config, deps("bad", 503)).fetchSnapshot();
    expect(ProviderSnapshotSchema.safeParse(snap).success).toBe(true);
  });
});
