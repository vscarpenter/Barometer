import { describe, it, expect } from "vitest";
import {
  buildOverallReading,
  SummaryFileSchema,
  type ProviderSnapshot,
  type RecentFile,
  type RollupsFile,
} from "@barometer/types";
import { buildSummary } from "../src/summary.js";

const NOW_MS = Date.parse("2026-06-25T12:00:00.000Z");
const GENERATED = "2026-06-25T12:00:00.000Z";
const hoursAgo = (h: number) => new Date(NOW_MS - h * 3_600_000).toISOString();

const snap = (id: string, status: ProviderSnapshot["status"]): ProviderSnapshot => ({
  id,
  displayName: id.toUpperCase(),
  status,
  activeIncidents: [],
  checkedAt: GENERATED,
  sourceUrl: `https://${id}`,
});

describe("buildSummary", () => {
  const snapshots = [snap("a", "operational"), snap("b", "degraded")];
  const recent: RecentFile = {
    samples: [
      { t: hoursAgo(1), s: { a: "operational", b: "operational" } },
      { t: hoursAgo(2), s: { a: "operational", b: "degraded" } },
      { t: hoursAgo(3), s: { a: "operational", b: "degraded" } },
    ],
  };
  const rollups: RollupsFile = {
    days: [{ date: "2026-06-24", providers: { a: { up: 288, down: 0 }, b: { up: 144, down: 144 } } }],
  };

  it("attaches the four uptime windows per provider", () => {
    const summary = buildSummary(snapshots, recent, rollups, NOW_MS, GENERATED);
    const a = summary.providers.find((p) => p.id === "a")!;
    const b = summary.providers.find((p) => p.id === "b")!;

    expect(a.uptime["24h"]).toBe(100); // 3/3 operational in the last 24h
    expect(b.uptime["24h"]).toBeCloseTo((1 / 3) * 100, 5); // 1 up of 3 counted
    expect(a.uptime["7d"]).toBe(100); // 288/288
    expect(b.uptime["7d"]).toBe(50); // 144/288
    expect(a.uptime["30d"]).toBe(100);
  });

  it("carries the overall reading and validates against the schema", () => {
    const summary = buildSummary(snapshots, recent, rollups, NOW_MS, GENERATED);
    expect(summary.overall).toEqual(buildOverallReading(snapshots, GENERATED));
    expect(summary.generatedAt).toBe(GENERATED);
    expect(SummaryFileSchema.safeParse(summary).success).toBe(true);
  });

  it("reports null uptime for a provider with no samples", () => {
    const summary = buildSummary([snap("z", "unknown")], { samples: [] }, { days: [] }, NOW_MS, GENERATED);
    expect(summary.providers[0]!.uptime).toEqual({ "24h": null, "7d": null, "30d": null, "90d": null });
  });
});
