import { describe, it, expect } from "vitest";
import type { SummaryProvider } from "@barometer/types";
import { severityRank, sortProvidersBySeverity, offenders } from "../src/render/order.js";

const p = (displayName: string, status: SummaryProvider["status"]) =>
  ({ displayName, status }) as Pick<SummaryProvider, "displayName" | "status">;

describe("severityRank", () => {
  it("ranks down states worst, operational last, holds in between", () => {
    expect(severityRank("major_outage")).toBeLessThan(severityRank("degraded"));
    expect(severityRank("degraded")).toBeLessThan(severityRank("maintenance"));
    expect(severityRank("unknown")).toBeLessThan(severityRank("operational"));
  });
});

describe("sortProvidersBySeverity", () => {
  it("floats problems to the top, sinks operational, ties alphabetical", () => {
    const out = sortProvidersBySeverity([
      p("Zeta", "operational"),
      p("Alpha", "operational"),
      p("GitHub", "degraded"),
      p("AWS", "major_outage"),
    ]);
    expect(out.map((x) => x.displayName)).toEqual(["AWS", "GitHub", "Alpha", "Zeta"]);
  });

  it("does not mutate the input", () => {
    const input = [p("B", "operational"), p("A", "major_outage")];
    const copy = [...input];
    sortProvidersBySeverity(input);
    expect(input).toEqual(copy);
  });
});

describe("offenders", () => {
  it("returns only the down providers, worst-first", () => {
    const out = offenders([
      p("OK", "operational"),
      p("Maint", "maintenance"),
      p("Unk", "unknown"),
      p("Deg", "degraded"),
      p("Down", "major_outage"),
    ]);
    expect(out.map((x) => x.displayName)).toEqual(["Down", "Deg"]);
  });
});
