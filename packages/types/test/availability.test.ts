import { describe, it, expect } from "vitest";
import { classify } from "../src/availability.js";

describe("availability classification (SPEC §4)", () => {
  it("counts operational as up", () => {
    expect(classify("operational")).toBe("up");
  });

  it("counts degraded/partial/major as down", () => {
    for (const d of ["degraded", "partial_outage", "major_outage"] as const) {
      expect(classify(d)).toBe("down");
    }
  });

  it("excludes maintenance and unknown from the denominator", () => {
    for (const e of ["maintenance", "unknown"] as const) {
      expect(classify(e)).toBe("excluded");
    }
  });
});
