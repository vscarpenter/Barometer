import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProviderSnapshotSchema } from "@barometer/types";
import { AzureAdapter } from "../src/adapters/azure.js";
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
  id: "azure",
  displayName: "Microsoft Azure",
  type: "azure",
  url: "https://azure.status.microsoft/en-us/status/feed/",
};

describe("AzureAdapter", () => {
  it("maps a healthy (empty) feed to operational with no incidents", async () => {
    const snap = await new AzureAdapter(config, deps(fixture("azure-healthy.xml"))).fetchSnapshot();
    expect(snap.status).toBe("operational");
    expect(snap.activeIncidents).toEqual([]);
    expect(snap.id).toBe("azure");
    expect(snap.displayName).toBe("Microsoft Azure");
    expect(snap.checkedAt).toBe(NOW);
    expect(snap.sourceUrl).toBe("https://azure.status.microsoft/en-us/status/feed/");
  });

  it("maps an incident feed to major_outage (worst across items) and populates activeIncidents", async () => {
    const snap = await new AzureAdapter(config, deps(fixture("azure-incident.xml"))).fetchSnapshot();
    expect(snap.status).toBe("major_outage");
    expect(snap.activeIncidents).toHaveLength(2);

    // First item: outage → major impact
    const outageInc = snap.activeIncidents[0]!;
    expect(outageInc.title).toBe("Azure Storage – Outage in East US");
    expect(outageInc.impact).toBe("major");
    expect(outageInc.status).toBe("active");
    expect(outageInc.startedAt).toBe("2026-06-25T13:15:00.000Z");
    expect(outageInc.url).toBe("https://azure.status.microsoft/en-us/status/");
    expect(outageInc.id).toBe("https://azure.status.microsoft/en-us/status/#azure-storage-outage-eastus-2026-06-25");

    // Second item: latency → minor impact
    const latencyInc = snap.activeIncidents[1]!;
    expect(latencyInc.title).toBe("Azure App Service – Elevated Latency in West Europe");
    expect(latencyInc.impact).toBe("minor");
    expect(latencyInc.status).toBe("active");
    expect(latencyInc.startedAt).toBe("2026-06-25T12:30:00.000Z");
  });

  it("degrades to unknown on a malformed body without throwing", async () => {
    const snap = await new AzureAdapter(config, deps("<<< not valid xml >>>")).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
    expect(snap.checkedAt).toBe(NOW);
  });

  it("degrades to unknown on a non-200 response without throwing", async () => {
    const snap = await new AzureAdapter(config, deps("", 500)).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
  });

  it("always emits a schema-valid snapshot", async () => {
    for (const f of ["azure-healthy.xml", "azure-incident.xml"]) {
      const snap = await new AzureAdapter(config, deps(fixture(f))).fetchSnapshot();
      const result = ProviderSnapshotSchema.safeParse(snap);
      expect(result.success).toBe(true);
    }

    // Also validate unknown snapshots
    const malformed = await new AzureAdapter(config, deps("bad xml")).fetchSnapshot();
    expect(ProviderSnapshotSchema.safeParse(malformed).success).toBe(true);

    const non200 = await new AzureAdapter(config, deps("", 404)).fetchSnapshot();
    expect(ProviderSnapshotSchema.safeParse(non200).success).toBe(true);
  });

  it("attaches extracted regions to incidents", async () => {
    const snap = await new AzureAdapter(config, deps(fixture("azure-incident.xml"))).fetchSnapshot();
    // "East US" → us-detected; "West Europe" → eu-detected.
    expect(snap.activeIncidents[0]!.regions).toEqual(expect.arrayContaining(["us-detected"]));
    expect(snap.activeIncidents[1]!.regions).toEqual(expect.arrayContaining(["eu-detected"]));
  });

  it("reads operational when every active item is non-US, but still lists the incidents", async () => {
    const euOnly = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Azure Status</title>
    <item>
      <title><![CDATA[Azure App Service – Outage in West Europe]]></title>
      <description><![CDATA[<p>An outage is affecting West Europe only.</p>]]></description>
      <pubDate>Wed, 25 Jun 2026 12:30:00 Z</pubDate>
      <link>https://azure.status.microsoft/en-us/status/</link>
      <guid>eu-only-1</guid>
    </item>
  </channel>
</rss>`;
    const snap = await new AzureAdapter(config, deps(euOnly)).fetchSnapshot();
    expect(snap.status).toBe("operational");
    expect(snap.activeIncidents).toHaveLength(1);
    expect(snap.activeIncidents[0]!.regions).toEqual(expect.arrayContaining(["eu-detected"]));
  });

  it("uses deps.now() as fallback startedAt when pubDate is missing or invalid", async () => {
    const badDateXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Azure Status</title>
    <item>
      <title>Some Degraded Service</title>
      <pubDate>not-a-date</pubDate>
      <link>https://azure.status.microsoft/en-us/status/</link>
      <guid>some-unique-guid-123</guid>
    </item>
  </channel>
</rss>`;
    const snap = await new AzureAdapter(config, deps(badDateXml)).fetchSnapshot();
    expect(snap.activeIncidents).toHaveLength(1);
    expect(snap.activeIncidents[0]!.startedAt).toBe(NOW);
  });
});
