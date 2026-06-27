import { describe, it, expect } from "vitest";
import { renderAboutPage } from "../src/render/aboutPage.js";

describe("renderAboutPage", () => {
  const page = renderAboutPage();

  it("has a heading and a link back to the dashboard", () => {
    expect(page.querySelector("h1")?.textContent).toMatch(/about barometer/i);
    expect(page.querySelector('a[href="/"]')).not.toBeNull();
  });

  it("carries the description that moved out of the footer", () => {
    expect(page.textContent).toContain("weather labels are presentation only");
  });

  it("explains the availability rule and names the providers", () => {
    const t = page.textContent ?? "";
    expect(t.toLowerCase()).toContain("maintenance"); // excluded hold states
    expect(t.toLowerCase()).toContain("excluded");
    expect(t).toContain("Cloudflare");
    expect(t).toContain("DigitalOcean");
  });

  it("lists the live provider set and asserts no stale hardcoded count", () => {
    const items = page.querySelectorAll(".about__providers li");
    const t = page.textContent ?? "";
    expect(items.length).toBe(11); // the live set, including the DNS active probes
    expect(t).toContain("Cloudflare DNS"); // 1.1.1.1 probe
    expect(t).toContain("Google DNS"); // 8.8.8.8 probe
    // The prose is count-neutral so it can't drift from the dashboard (11) or the
    // diagram art (still drawn with 9). The enumerated list is the source of truth.
    expect(t).not.toMatch(/\bnine\b/i);
  });

  it("links to the GitHub repository (new tab, safe rel)", () => {
    const gh = page.querySelector<HTMLAnchorElement>('a[href*="github.com/vscarpenter/Barometer"]');
    expect(gh).not.toBeNull();
    expect(gh!.target).toBe("_blank");
    expect(gh!.rel).toContain("noopener");
  });

  it("shows the theme-aware architecture diagram (light + dark, both with alt text)", () => {
    expect(page.querySelector('img[src="/barometer-overview-almanac.svg"]')).not.toBeNull();
    expect(page.querySelector('img[src="/barometer-overview-almanac-dark.svg"]')).not.toBeNull();
    const diagrams = page.querySelectorAll<HTMLImageElement>("img.about__diagram");
    expect(diagrams).toHaveLength(2);
    expect([...diagrams].every((img) => img.alt.length > 0)).toBe(true);
  });

  it("preloads both diagram variants (not lazy) so the theme swap is instant", () => {
    // Both are tiny SVGs and sit near the fold; lazy-loading just leaves a blank
    // box on arrival and a flash on theme toggle while the other variant loads.
    const diagrams = page.querySelectorAll<HTMLImageElement>("img.about__diagram");
    expect([...diagrams].every((img) => img.loading !== "lazy")).toBe(true);
  });
});
