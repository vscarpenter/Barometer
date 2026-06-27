import { describe, it, expect } from "vitest";
import { isUsRegion, regionsAreUsRelevant, isUsRelevant } from "../src/region.js";
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
