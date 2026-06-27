import { describe, it, expect } from "vitest";
import type { UptimeWindows } from "@barometer/types";
import { safePct, formatUptime, renderUptimeWindows } from "../src/render/uptimeWindows.js";

describe("safePct", () => {
  it("never rounds a sub-100 score up to a false 100%", () => {
    expect(safePct(99.996)).toBe(99.99);
    expect(safePct(99.999999)).toBe(99.99);
  });
  it("keeps a genuine 100 at 100 and rounds normal values to 2 decimals", () => {
    expect(safePct(100)).toBe(100);
    expect(safePct(98.5)).toBe(98.5);
    expect(safePct(99.92)).toBe(99.92);
  });
});

describe("formatUptime", () => {
  it("renders an em dash for no data", () => {
    expect(formatUptime(null)).toBe("—");
  });
  it("never rounds up to a false 100%", () => {
    expect(formatUptime(99.996)).toBe("99.99%");
  });
  it("shows a real 100% and trims trailing zeros", () => {
    expect(formatUptime(100)).toBe("100%");
    expect(formatUptime(99.9)).toBe("99.9%");
  });
});

describe("renderUptimeWindows", () => {
  const uptime: UptimeWindows = { "24h": 98.5, "7d": 99.1, "30d": null, "90d": 99.92 };
  it("renders only the windows the history backs (null windows are hidden)", () => {
    const dl = renderUptimeWindows(uptime);
    expect(dl.tagName.toLowerCase()).toBe("dl");
    expect(dl.classList.contains("card__uptime")).toBe(true);
    expect(dl.querySelectorAll("div")).toHaveLength(3); // 30d is null -> hidden
    expect(dl.textContent).toContain("24h");
    expect(dl.textContent).toContain("98.5%");
    expect(dl.textContent).not.toContain("30d"); // hidden until backed
    expect(dl.textContent).not.toContain("—"); // unbacked windows are hidden, not dashed
  });
  it("sizes the grid to the number of shown windows", () => {
    expect(renderUptimeWindows(uptime).style.gridTemplateColumns).toBe("repeat(3, 1fr)");
    const full = renderUptimeWindows({ "24h": 100, "7d": 100, "30d": 100, "90d": 100 });
    expect(full.querySelectorAll("div")).toHaveLength(4);
    expect(full.style.gridTemplateColumns).toBe("repeat(4, 1fr)");
  });
  it("shows a placeholder when no window is backed yet", () => {
    const dl = renderUptimeWindows({ "24h": null, "7d": null, "30d": null, "90d": null });
    expect(dl.querySelectorAll("div")).toHaveLength(0);
    expect(dl.textContent?.toLowerCase()).toContain("no uptime data yet");
  });
  it("applies an extra class for the dialog variant", () => {
    expect(renderUptimeWindows(uptime, "dlg__uptime").classList.contains("dlg__uptime")).toBe(true);
  });
});
