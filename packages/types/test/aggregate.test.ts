import { describe, it, expect } from "vitest";
import type { ProviderSnapshot } from "../src/status.js";
import { overallStatus, weatherLabel, buildOverallReading } from "../src/aggregate.js";

const snap = (id: string, status: ProviderSnapshot["status"]): ProviderSnapshot => ({
  id,
  displayName: id.toUpperCase(),
  status,
  activeIncidents: [],
  checkedAt: "2026-06-25T00:00:00.000Z",
  sourceUrl: `https://${id}`,
});

describe("overallStatus (worst-case aggregate, SPEC §4)", () => {
  it("ignores maintenance/unknown when something is operational", () => {
    expect(overallStatus(["operational", "maintenance", "unknown"])).toBe("operational");
  });

  it("returns the worst down status present", () => {
    expect(overallStatus(["operational", "degraded"])).toBe("degraded");
    expect(overallStatus(["degraded", "partial_outage"])).toBe("partial_outage");
    expect(overallStatus(["partial_outage", "major_outage"])).toBe("major_outage");
  });

  it("is unknown only when every provider is excluded", () => {
    expect(overallStatus(["maintenance", "unknown"])).toBe("unknown");
    expect(overallStatus([])).toBe("unknown");
  });
});

describe("weatherLabel (SPEC §9)", () => {
  it("maps each status to a barometer label", () => {
    expect(weatherLabel("operational")).toMatch(/Fair/);
    expect(weatherLabel("degraded")).toBe("Changeable");
    expect(weatherLabel("partial_outage")).toBe("Unsettled");
    expect(weatherLabel("major_outage")).toBe("Stormy");
    expect(weatherLabel("maintenance")).toMatch(/maintenance/i);
    expect(weatherLabel("unknown")).toMatch(/unavailable/i);
  });
});

describe("buildOverallReading", () => {
  it("composes status, label, and operational counts", () => {
    const r = buildOverallReading(
      [snap("a", "operational"), snap("b", "degraded"), snap("c", "maintenance")],
      "2026-06-25T00:00:00.000Z",
    );
    expect(r.status).toBe("degraded");
    expect(r.label).toBe(weatherLabel("degraded"));
    expect(r.providersOperational).toBe(1);
    expect(r.providersTotal).toBe(3);
    expect(r.generatedAt).toBe("2026-06-25T00:00:00.000Z");
  });
});
