import { describe, it, expect } from "vitest";
import type { ProviderSnapshot, RecentFile, RollupsFile } from "@barometer/types";
import {
  appendRecent,
  updateRollups,
  uptimeFromRecent,
  uptimeFromRollups,
} from "../src/history.js";

const NOW_MS = Date.parse("2026-06-25T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW_MS - h * 3_600_000).toISOString();

const snap = (id: string, status: ProviderSnapshot["status"]): ProviderSnapshot => ({
  id,
  displayName: id,
  status,
  activeIncidents: [],
  checkedAt: hoursAgo(0),
  sourceUrl: `https://${id}`,
});

describe("appendRecent", () => {
  it("appends the new sample and trims entries older than the retention window", () => {
    const recent: RecentFile = {
      samples: [
        { t: hoursAgo(50), s: { a: "operational" } }, // older than 48h -> dropped
        { t: hoursAgo(2), s: { a: "operational" } }, // kept
      ],
    };
    const next = appendRecent(recent, { t: hoursAgo(0), s: { a: "degraded" } }, NOW_MS, 48);
    expect(next.samples).toHaveLength(2);
    expect(next.samples.map((x) => x.t)).toEqual([hoursAgo(2), hoursAgo(0)]);
  });

  it("does not mutate the input", () => {
    const recent: RecentFile = { samples: [] };
    appendRecent(recent, { t: hoursAgo(0), s: {} }, NOW_MS, 48);
    expect(recent.samples).toHaveLength(0);
  });
});

describe("updateRollups", () => {
  it("creates today's bucket and counts up/down, excluding maintenance/unknown", () => {
    const next = updateRollups(
      { days: [] },
      [snap("a", "operational"), snap("b", "major_outage"), snap("c", "maintenance"), snap("d", "unknown")],
      "2026-06-25",
      90,
    );
    expect(next.days).toHaveLength(1);
    const bucket = next.days[0]!;
    expect(bucket.date).toBe("2026-06-25");
    expect(bucket.providers["a"]).toEqual({ up: 1, down: 0 });
    expect(bucket.providers["b"]).toEqual({ up: 0, down: 1 });
    expect(bucket.providers["c"]).toBeUndefined(); // excluded -> no entry
    expect(bucket.providers["d"]).toBeUndefined();
  });

  it("accumulates into an existing same-day bucket", () => {
    const first = updateRollups({ days: [] }, [snap("a", "operational")], "2026-06-25", 90);
    const second = updateRollups(first, [snap("a", "major_outage")], "2026-06-25", 90);
    expect(second.days).toHaveLength(1);
    expect(second.days[0]!.providers["a"]).toEqual({ up: 1, down: 1 });
  });

  it("caps history to the retention window, keeping the most recent days", () => {
    let rollups: RollupsFile = { days: [] };
    for (let d = 1; d <= 95; d++) {
      const date = `2026-03-${String(d).padStart(2, "0")}`; // synthetic ascending dates
      rollups = updateRollups(rollups, [snap("a", "operational")], date, 90);
    }
    expect(rollups.days).toHaveLength(90);
    expect(rollups.days[0]!.date).toBe("2026-03-06"); // first 5 dropped
    expect(rollups.days.at(-1)!.date).toBe("2026-03-95");
  });
});

describe("uptimeFromRecent", () => {
  it("computes up / (up + down) as a percentage over the window", () => {
    const recent: RecentFile = {
      samples: [
        { t: hoursAgo(1), s: { a: "operational" } },
        { t: hoursAgo(1), s: { a: "operational" } },
        { t: hoursAgo(1), s: { a: "operational" } },
        { t: hoursAgo(1), s: { a: "major_outage" } },
        { t: hoursAgo(1), s: { a: "maintenance" } }, // excluded
      ],
    };
    expect(uptimeFromRecent(recent, "a", NOW_MS, 24)).toBe(75); // 3 up / 4 counted
  });

  it("ignores samples outside the window", () => {
    const recent: RecentFile = {
      samples: [
        { t: hoursAgo(30), s: { a: "major_outage" } }, // outside 24h
        { t: hoursAgo(1), s: { a: "operational" } },
      ],
    };
    expect(uptimeFromRecent(recent, "a", NOW_MS, 24)).toBe(100);
  });

  it("returns null when nothing counts toward the denominator", () => {
    const recent: RecentFile = { samples: [{ t: hoursAgo(1), s: { a: "maintenance" } }] };
    expect(uptimeFromRecent(recent, "a", NOW_MS, 24)).toBeNull();
    expect(uptimeFromRecent({ samples: [] }, "a", NOW_MS, 24)).toBeNull();
  });
});

describe("uptimeFromRollups", () => {
  const rollups: RollupsFile = {
    days: [
      { date: "2026-06-20", providers: { a: { up: 280, down: 8 } } },
      { date: "2026-06-21", providers: { a: { up: 288, down: 0 } } },
      { date: "2026-06-22", providers: { a: { up: 200, down: 88 } } },
    ],
  };

  it("sums up/down across the last N day buckets as a percentage", () => {
    // last 2 days: up 488, down 88 -> 488/576
    expect(uptimeFromRollups(rollups, "a", 2)).toBeCloseTo((488 / 576) * 100, 5);
  });

  it("returns null when there is no data for the provider in the window", () => {
    expect(uptimeFromRollups(rollups, "z", 3)).toBeNull();
    expect(uptimeFromRollups({ days: [] }, "a", 7)).toBeNull();
  });

  it("returns null until the window is fully backed by enough days (real-span honesty)", () => {
    // Only 3 days of history exist: a 7d/30d/90d figure would over-claim its span.
    expect(uptimeFromRollups(rollups, "a", 7)).toBeNull();
    expect(uptimeFromRollups(rollups, "a", 30)).toBeNull();
    expect(uptimeFromRollups(rollups, "a", 90)).toBeNull();
    // A window the history can actually back returns a real percentage.
    expect(uptimeFromRollups(rollups, "a", 3)).toBeCloseTo((768 / 864) * 100, 5);
  });
});
