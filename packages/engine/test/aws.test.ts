import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ProviderSnapshotSchema } from "@barometer/types";
import { AwsAdapter } from "../src/adapters/aws.js";
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
  id: "aws",
  displayName: "Amazon Web Services",
  type: "aws",
  url: "https://health.aws.amazon.com/public/currentevents",
};

describe("AwsAdapter", () => {
  it("maps an empty array to operational with no incidents", async () => {
    const snap = await new AwsAdapter(config, deps(fixture("aws-healthy.json"))).fetchSnapshot();
    expect(snap.status).toBe("operational");
    expect(snap.activeIncidents).toEqual([]);
    expect(snap.id).toBe("aws");
    expect(snap.displayName).toBe("Amazon Web Services");
    expect(snap.checkedAt).toBe(NOW);
    expect(snap.sourceUrl).toContain("health.aws.amazon.com");
  });

  it("maps active OPERATIONAL_ISSUE events to partial_outage and populates incidents", async () => {
    const snap = await new AwsAdapter(config, deps(fixture("aws-incident.json"))).fetchSnapshot();
    expect(snap.status).toBe("partial_outage");
    expect(snap.activeIncidents).toHaveLength(2);

    const inc = snap.activeIncidents[0]!;
    expect(inc.title).toBe("Increased Error Rates (Multiple services)");
    expect(inc.impact).toBe("major"); // OPERATIONAL_ISSUE → "major"
    expect(inc.status).toBe("monitoring"); // code "3" → "monitoring"
    expect(inc.startedAt).toBe("2026-03-01T12:51:25.000Z"); // epoch 1772369485
    expect(inc.url).toBe("https://health.aws.amazon.com/health/status");
    expect(inc.id).toBe(
      "arn:aws:health:me-central-1::event/MULTIPLE_SERVICES/AWS_MULTIPLE_SERVICES_OPERATIONAL_ISSUE/AWS_MULTIPLE_SERVICES_OPERATIONAL_ISSUE_5E6B8_EF2498889B5",
    );
  });

  it("uses worse of code-derived and arn-derived status per event", async () => {
    // status "3" → partial_outage; OPERATIONAL_ISSUE → partial_outage → worse = partial_outage
    const snap = await new AwsAdapter(config, deps(fixture("aws-incident.json"))).fetchSnapshot();
    expect(snap.status).toBe("partial_outage");
  });

  it("degrades to unknown on malformed body without throwing", async () => {
    const snap = await new AwsAdapter(config, deps("not json {{{")).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
    expect(snap.id).toBe("aws");
    expect(snap.checkedAt).toBe(NOW);
  });

  it("degrades to unknown on a non-200 response without throwing", async () => {
    const snap = await new AwsAdapter(config, deps("", 500)).fetchSnapshot();
    expect(snap.status).toBe("unknown");
    expect(snap.activeIncidents).toEqual([]);
  });

  it("always emits a schema-valid snapshot for each fixture", async () => {
    for (const f of ["aws-healthy.json", "aws-incident.json"]) {
      const snap = await new AwsAdapter(config, deps(fixture(f))).fetchSnapshot();
      const result = ProviderSnapshotSchema.safeParse(snap);
      expect(result.success, `fixture ${f} failed schema validation`).toBe(true);
    }
    // unknown snapshot is also schema-valid
    const unknown = await new AwsAdapter(config, deps("bad", 503)).fetchSnapshot();
    expect(ProviderSnapshotSchema.safeParse(unknown).success).toBe(true);
  });
});
