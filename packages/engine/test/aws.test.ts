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

  it("shows non-US (Middle East) events but excludes them from status", async () => {
    const snap = await new AwsAdapter(config, deps(fixture("aws-incident.json"))).fetchSnapshot();
    expect(snap.status).toBe("operational");     // me-central-1 + me-south-1 → excluded
    expect(snap.activeIncidents).toHaveLength(2); // still shown
    const inc = snap.activeIncidents[0]!;
    expect(inc.title).toBe("Increased Error Rates (Multiple services)");
    expect(inc.impact).toBe("major");
    expect(inc.regions).toEqual(["me-central-1"]);
    expect(inc.id).toBe(
      "arn:aws:health:me-central-1::event/MULTIPLE_SERVICES/AWS_MULTIPLE_SERVICES_OPERATIONAL_ISSUE/AWS_MULTIPLE_SERVICES_OPERATIONAL_ISSUE_5E6B8_EF2498889B5",
    );
  });

  it("derives status from US events only; a worse non-US event does not escalate", async () => {
    const body = JSON.stringify([
      { arn: "arn:aws:health:us-east-1::event/EC2/AWS_EC2_OPERATIONAL_ISSUE/a", status: "3" }, // US → partial_outage
      { arn: "arn:aws:health:eu-west-1::event/EC2/AWS_EC2_OPERATIONAL_ISSUE/b", status: "5" }, // non-US → would be major
    ]);
    const snap = await new AwsAdapter(config, deps(body)).fetchSnapshot();
    expect(snap.status).toBe("partial_outage"); // eu-west-1 major excluded
    expect(snap.activeIncidents).toHaveLength(2);
  });

  it("fails open for a global AWS event with no region in the ARN", async () => {
    const body = JSON.stringify([
      { arn: "arn:aws:health::event/IAM/AWS_IAM_OPERATIONAL_ISSUE/g", status: "3" },
    ]);
    const snap = await new AwsAdapter(config, deps(body)).fetchSnapshot();
    expect(snap.status).toBe("partial_outage"); // no region → counts
    expect(snap.activeIncidents[0]!.regions).toEqual([]);
  });

  it("tolerates events missing display-only fields instead of degrading the whole provider", async () => {
    // A single event without summary/service_name/date must not nuke AWS to unknown:
    // severity is still derivable from arn + status, and the missing date falls back to now().
    const body = JSON.stringify([
      {
        arn: "arn:aws:health:us-east-1::event/EC2/AWS_EC2_OPERATIONAL_ISSUE/abc",
        status: "3",
      },
    ]);
    const snap = await new AwsAdapter(config, deps(body)).fetchSnapshot();
    expect(snap.status).toBe("partial_outage"); // OPERATIONAL_ISSUE + code 3
    expect(snap.activeIncidents).toHaveLength(1);
    const inc = snap.activeIncidents[0]!;
    expect(inc.startedAt).toBe(NOW); // missing date → now()
    expect(inc.impact).toBe("major"); // OPERATIONAL_ISSUE
    expect(ProviderSnapshotSchema.safeParse(snap).success).toBe(true);
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
