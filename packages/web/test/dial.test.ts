import { describe, it, expect } from "vitest";
import type { ProviderStatus } from "@barometer/types";
import { needleAngleFor, renderDial, updateDial } from "../src/render/dial.js";

describe("needleAngleFor", () => {
  it("sweeps Stormy (left) → Fair (right) monotonically across the down states", () => {
    expect(needleAngleFor("major_outage")).toBeLessThan(needleAngleFor("partial_outage"));
    expect(needleAngleFor("partial_outage")).toBeLessThan(needleAngleFor("degraded"));
    expect(needleAngleFor("degraded")).toBeLessThan(needleAngleFor("operational"));
  });
  it("treats maintenance as fair and unknown as centered", () => {
    expect(needleAngleFor("maintenance")).toBe(needleAngleFor("operational"));
    expect(needleAngleFor("unknown")).toBe(0);
  });
  it("keeps the needle within the ±90° gauge", () => {
    for (const s of ["operational", "degraded", "partial_outage", "major_outage", "maintenance", "unknown"] as ProviderStatus[]) {
      expect(Math.abs(needleAngleFor(s))).toBeLessThanOrEqual(90);
    }
  });
});

describe("renderDial", () => {
  it("is an aria-hidden svg with four tinted zones, a needle and a hub", () => {
    const dial = renderDial("operational");
    expect(dial.tagName.toLowerCase()).toBe("svg");
    expect(dial.getAttribute("aria-hidden")).toBe("true");
    expect(dial.querySelector(".dial__needle")).not.toBeNull();
    expect(dial.querySelector("circle")).not.toBeNull();
    // backing arc + 4 zone arcs = 5 paths + 1 needle path
    expect(dial.querySelectorAll("path").length).toBeGreaterThanOrEqual(6);
  });
  it("rotates the needle to the status angle", () => {
    expect(renderDial("major_outage").querySelector<SVGElement>(".dial__needle")!.style.transform)
      .toContain("rotate(-75deg)");
  });
  it("lights all zones at a neutral level for an unknown reading (no single false glow)", () => {
    const zones = renderDial("unknown").querySelectorAll<SVGElement>("[data-zone]");
    expect(zones.length).toBe(4);
    expect([...zones].every((z) => z.getAttribute("opacity") === "0.5")).toBe(true);
  });
});

describe("updateDial", () => {
  it("swings the SAME needle node and lights the new zone in place (so CSS can animate)", () => {
    const dial = renderDial("operational");
    const needle = dial.querySelector<SVGElement>(".dial__needle")!;
    updateDial(dial, "major_outage");
    // same element instance — only its transform changed, which is what lets the
    // CSS transition fire instead of snapping a freshly-built needle into place.
    expect(dial.querySelector(".dial__needle")).toBe(needle);
    expect(needle.style.transform).toContain("rotate(-75deg)");
    expect(dial.querySelector('[data-zone="major_outage"]')!.getAttribute("opacity")).toBe("1");
    expect(dial.querySelector('[data-zone="operational"]')!.getAttribute("opacity")).toBe("0.32");
  });
});
