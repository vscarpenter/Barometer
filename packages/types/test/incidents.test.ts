import { describe, it, expect } from "vitest";
import { maxImpact, IncidentRecordSchema, IncidentsFileSchema } from "../src/incidents.js";

describe("maxImpact", () => {
  it("returns the more severe impact", () => {
    expect(maxImpact("minor", "critical")).toBe("critical");
    expect(maxImpact("major", "minor")).toBe("major");
    expect(maxImpact("none", "none")).toBe("none");
  });
});

describe("IncidentRecordSchema", () => {
  it("accepts a valid ongoing record", () => {
    const ok = IncidentRecordSchema.safeParse({
      key: "github:abc",
      providerId: "github",
      providerName: "GitHub",
      title: "Elevated errors",
      impact: "major",
      url: "https://x/abc",
      firstSeen: "2026-06-25T00:00:00.000Z",
      lastSeen: "2026-06-25T00:05:00.000Z",
      resolvedAt: null,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an unknown impact", () => {
    const bad = IncidentRecordSchema.safeParse({
      key: "k", providerId: "p", providerName: "P", title: "t", impact: "catastrophic",
      url: "u", firstSeen: "t", lastSeen: "t", resolvedAt: null,
    });
    expect(bad.success).toBe(false);
  });

  it("IncidentsFileSchema wraps an array", () => {
    expect(IncidentsFileSchema.safeParse({ incidents: [] }).success).toBe(true);
  });
});
