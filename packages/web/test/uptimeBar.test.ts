import { describe, it, expect } from "vitest";
import type { RollupsFile } from "@barometer/types";
import { renderUptimeBar } from "../src/render/uptimeBar.js";

const rollups: RollupsFile = {
  days: [
    { date: "2026-06-23", providers: { github: { up: 288, down: 0 } } }, // 100%
    { date: "2026-06-24", providers: { github: { up: 280, down: 8 } } }, // ~97.2% → degraded
    { date: "2026-06-25", providers: { github: { up: 200, down: 88 } } }, // ~69% → major
    { date: "2026-06-26", providers: {} }, // no data
  ],
};

describe("renderUptimeBar", () => {
  it("renders one cell per day with a status class and a tooltip", () => {
    const bar = renderUptimeBar(rollups, "github");
    const cells = bar.querySelectorAll<HTMLElement>(".uptimebar__cell");
    expect(cells).toHaveLength(4);
    expect(cells[0]!.dataset.status).toBe("operational");
    expect(cells[1]!.dataset.status).toBe("degraded");
    expect(cells[2]!.dataset.status).toBe("major_outage");
    expect(cells[3]!.dataset.status).toBe("nodata");
    expect(cells[0]!.title).toContain("2026-06-23");
    expect(cells[3]!.title.toLowerCase()).toContain("no data");
  });

  it("summarizes the window in an accessible label", () => {
    const bar = renderUptimeBar(rollups, "github");
    expect(bar.getAttribute("role")).toBe("img");
    expect(bar.getAttribute("aria-label")).toMatch(/uptime over the last 4 days/i);
  });

  it("limits to the most recent maxDays", () => {
    const bar = renderUptimeBar(rollups, "github", 2);
    const cells = bar.querySelectorAll(".uptimebar__cell");
    expect(cells).toHaveLength(2);
    expect(cells[0]!.getAttribute("title")).toContain("2026-06-25");
  });

  it("shows an empty state and no-history label when there are no days", () => {
    const bar = renderUptimeBar({ days: [] }, "github");
    expect(bar.querySelector(".uptimebar__empty")).not.toBeNull();
    expect(bar.getAttribute("aria-label")).toMatch(/no uptime history/i);
  });

  it("treats a provider with no buckets as no-data cells", () => {
    const bar = renderUptimeBar(rollups, "absent");
    const cells = bar.querySelectorAll<HTMLElement>(".uptimebar__cell");
    expect([...cells].every((c) => c.dataset.status === "nodata")).toBe(true);
  });

  it("weights the average by sample count, not a flat mean of daily percentages", () => {
    const r: RollupsFile = {
      days: [
        { date: "2026-06-24", providers: { github: { up: 50, down: 0 } } }, // 100%, only 50 samples
        { date: "2026-06-25", providers: { github: { up: 144, down: 144 } } }, // 50%, 288 samples
      ],
    };
    const label = renderUptimeBar(r, "github").getAttribute("aria-label") ?? "";
    expect(label).toContain("57.4"); // weighted: 194 up / 338 total ≈ 57.4%
    expect(label).not.toContain("75"); // NOT the flat mean (100+50)/2
  });

  it("never rounds a near-perfect day up to a false 100% in its tooltip", () => {
    const r: RollupsFile = {
      days: [{ date: "2026-06-25", providers: { github: { up: 99999, down: 1 } } }], // 99.999%
    };
    const cell = renderUptimeBar(r, "github").querySelector<HTMLElement>(".uptimebar__cell")!;
    expect(cell.title).toContain("99.99%");
    expect(cell.title).not.toContain("100%");
  });
});
