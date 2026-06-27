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
});
