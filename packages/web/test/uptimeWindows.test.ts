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
  it("builds the four-window dl with null shown as a dash", () => {
    const dl = renderUptimeWindows(uptime);
    expect(dl.tagName.toLowerCase()).toBe("dl");
    expect(dl.classList.contains("card__uptime")).toBe(true);
    expect(dl.querySelectorAll("div")).toHaveLength(4);
    expect(dl.textContent).toContain("24h");
    expect(dl.textContent).toContain("98.5%");
    expect(dl.textContent).toContain("—"); // 30d is null
  });
  it("applies an extra class for the dialog variant", () => {
    expect(renderUptimeWindows(uptime, "dlg__uptime").classList.contains("dlg__uptime")).toBe(true);
  });
});
