import { describe, it, expect } from "vitest";
import { isUsRegion, regionsAreUsRelevant, isUsRelevant, extractRegions } from "../src/region.js";
import type { Incident } from "../src/status.js";

const incident = (regions?: string[]): Incident => ({
  id: "i", title: "t", impact: "major", status: "investigating",
  startedAt: "2026-06-25T00:00:00.000Z", url: "https://x/i", regions,
});

describe("isUsRegion", () => {
  it.each(["us-east-1", "us-central1", "us-gov-west-1", "global"])("counts %s", (r) =>
    expect(isUsRegion(r)).toBe(true));
  it.each(["asia-south2", "eu-west-1", "me-central-1", "europe-west1"])("rejects %s", (r) =>
    expect(isUsRegion(r)).toBe(false));
});

describe("regionsAreUsRelevant", () => {
  it("fails open on empty/undefined", () => {
    expect(regionsAreUsRelevant([])).toBe(true);
    expect(regionsAreUsRelevant(undefined)).toBe(true);
  });
  it("counts when an explicit us-* region is present", () => {
    expect(regionsAreUsRelevant(["eu-west-1", "us-east-1"])).toBe(true);
    expect(regionsAreUsRelevant(["us-central1", "global"])).toBe(true);
  });
  it("counts a bare global (truly worldwide)", () => {
    expect(regionsAreUsRelevant(["global"])).toBe(true);
    expect(regionsAreUsRelevant(["global", "global"])).toBe(true);
  });
  it("ignores a stray global when specific non-US regions are named", () => {
    // GCP tags region-specific incidents (e.g. the Delhi/Mumbai networking
    // event) with ["asia-south2","global"]; the global token must not pull it
    // into the US reading.
    expect(regionsAreUsRelevant(["asia-south2", "global"])).toBe(false);
  });
  it("excludes when every region is non-US", () => {
    expect(regionsAreUsRelevant(["asia-south2"])).toBe(false);
    expect(regionsAreUsRelevant(["eu-west-1", "me-central-1"])).toBe(false);
  });
});

describe("isUsRelevant", () => {
  it("delegates to the incident's regions", () => {
    expect(isUsRelevant(incident(undefined))).toBe(true);
    expect(isUsRelevant(incident(["us-east-1"]))).toBe(true);
    expect(isUsRelevant(incident(["asia-south2"]))).toBe(false);
    expect(isUsRelevant(incident(["asia-south2", "global"]))).toBe(false);
  });
});

describe("extractRegions", () => {
  it("returns [] when no region is mentioned (fail-open)", () => {
    expect(extractRegions("Elevated error rates on the API")).toEqual([]);
    expect(extractRegions("")).toEqual([]);
  });

  it("pulls the unambiguous cloud-region grammar", () => {
    expect(extractRegions("Increased latency in us-east-1")).toContain("us-east-1");
    expect(extractRegions("Networking issue affecting eu-west-2 and ap-southeast"))
      .toEqual(expect.arrayContaining(["eu-west-2", "ap-southeast"]));
  });

  it("maps explicit geographic phrases to representative tokens", () => {
    expect(extractRegions("Service disruption in Europe")).toContain("eu-detected");
    expect(extractRegions("Customers in the United States are impacted")).toContain("us-detected");
    expect(extractRegions("APAC region degraded")).toContain("ap-detected");
  });

  it("dedupes and lowercases", () => {
    const out = extractRegions("US-EAST-1 and us-east-1 both down");
    expect(out.filter((r) => r === "us-east-1")).toHaveLength(1);
  });

  it("composes with regionsAreUsRelevant: US text counts, non-US-only text excludes", () => {
    expect(regionsAreUsRelevant(extractRegions("Outage in us-west-2"))).toBe(true);
    expect(regionsAreUsRelevant(extractRegions("Outage limited to Europe"))).toBe(false);
    expect(regionsAreUsRelevant(extractRegions("Outage in Europe and us-east-1"))).toBe(true);
    // Unclassifiable text → [] → fail-open → counts.
    expect(regionsAreUsRelevant(extractRegions("Elevated 5xx errors"))).toBe(true);
  });
});
