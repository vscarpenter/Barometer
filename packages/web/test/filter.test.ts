import { describe, it, expect, vi } from "vitest";
import { createProblemsFilter } from "../src/render/filter.js";

describe("createProblemsFilter", () => {
  it("stays hidden until there are problems to filter", () => {
    const f = createProblemsFilter(() => {});
    expect(f.element.hidden).toBe(true); // nothing to filter before data arrives
    f.update(0, false);
    expect(f.element.hidden).toBe(true); // all clear → no control
    f.update(2, false);
    expect(f.element.hidden).toBe(false);
  });

  it("shows the problem count", () => {
    const f = createProblemsFilter(() => {});
    f.update(3, false);
    expect(f.element.querySelector(".filter-toggle__count")?.textContent).toBe("3");
  });

  it("reflects the active state via aria-pressed and a class", () => {
    const f = createProblemsFilter(() => {});
    const btn = f.element.querySelector<HTMLButtonElement>(".filter-toggle")!;
    f.update(2, false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.classList.contains("is-active")).toBe(false);
    f.update(2, true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.classList.contains("is-active")).toBe(true);
  });

  it("gives a stable, count-bearing accessible name (state lives in aria-pressed)", () => {
    const f = createProblemsFilter(() => {});
    const btn = f.element.querySelector<HTMLButtonElement>(".filter-toggle")!;
    f.update(2, false);
    const labelOff = btn.getAttribute("aria-label");
    f.update(2, true);
    // The toggle's name describes what it does and never flips with state; the
    // on/off state is conveyed by aria-pressed, per ARIA toggle-button practice.
    expect(btn.getAttribute("aria-label")).toBe(labelOff);
    expect(labelOff).toContain("2");
  });

  it("calls onToggle when the button is clicked", () => {
    const onToggle = vi.fn();
    const f = createProblemsFilter(onToggle);
    f.update(2, false);
    f.element.querySelector<HTMLButtonElement>(".filter-toggle")!.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
