import { describe, it, expect, beforeEach } from "vitest";
import { currentTheme, applyTheme, buildThemeToggle } from "../src/render/theme.js";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("currentTheme / applyTheme", () => {
  it("defaults to light and reflects the data-theme attribute", () => {
    expect(currentTheme()).toBe("light");
    document.documentElement.setAttribute("data-theme", "dark");
    expect(currentTheme()).toBe("dark");
  });
  it("applyTheme sets the attribute and persists the choice", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("barometer-theme")).toBe("dark");
  });
});

describe("buildThemeToggle", () => {
  it("flips and persists the theme on click and updates its label", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const btn = buildThemeToggle();
    expect(btn.getAttribute("aria-label")).toMatch(/dark/i); // offers a switch to dark
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("barometer-theme")).toBe("dark");
    expect(btn.textContent).toContain("Dark");
  });
});
