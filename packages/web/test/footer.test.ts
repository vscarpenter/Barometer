import { describe, it, expect } from "vitest";
import { buildFooter, formatBuildTime } from "../src/render/footer.js";

/**
 * The footer is shared chrome rendered on every page (dashboard + About), so its
 * contract is tested once here rather than per entry point. The smoke tests then
 * only assert each page actually mounts it.
 */
describe("buildFooter", () => {
  it("renders Home and About as footer navigation links", () => {
    const footer = buildFooter("home");
    const nav = footer.querySelector("nav.footer__nav");
    expect(nav?.getAttribute("aria-label")).toBe("Footer");

    const home = footer.querySelector<HTMLAnchorElement>('a[href="/"]');
    const about = footer.querySelector<HTMLAnchorElement>('a[href="/about.html"]');
    expect(home?.textContent).toBe("Home");
    expect(about?.textContent).toBe("About");
  });

  it("marks the current page with aria-current=page (home)", () => {
    const footer = buildFooter("home");
    expect(footer.querySelector('a[href="/"]')?.getAttribute("aria-current")).toBe("page");
    expect(footer.querySelector('a[href="/about.html"]')?.getAttribute("aria-current")).toBeNull();
  });

  it("marks the current page with aria-current=page (about)", () => {
    const footer = buildFooter("about");
    expect(footer.querySelector('a[href="/about.html"]')?.getAttribute("aria-current")).toBe("page");
    expect(footer.querySelector('a[href="/"]')?.getAttribute("aria-current")).toBeNull();
  });

  it("shows the version baked in at build time", () => {
    const version = buildFooter("home").querySelector(".footer__version");
    expect(version?.textContent).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("links to vinny.dev safely in a new tab", () => {
    const link = buildFooter("home").querySelector<HTMLAnchorElement>('a[href="https://vinny.dev/"]');
    expect(link).not.toBeNull();
    expect(link!.target).toBe("_blank");
    expect(link!.rel).toContain("noopener");
  });

  it("renders the build time in a <time> carrying the machine-readable ISO", () => {
    const time = buildFooter("home").querySelector<HTMLTimeElement>("time.footer__time");
    expect(time).not.toBeNull();
    expect(time!.getAttribute("datetime")).toBeTruthy();
    // Visible text is the human Central-time string; abbreviation is CST or CDT.
    expect(time!.textContent).toMatch(/Built .*(CST|CDT)/);
  });
});

describe("formatBuildTime (Central time)", () => {
  it("formats a winter build as CST (UTC-6)", () => {
    // 2026-01-15 20:15 UTC → 2:15 PM in Chicago, standard time.
    const out = formatBuildTime("2026-01-15T20:15:00Z");
    expect(out).toContain("CST");
    expect(out).toContain("Jan");
    expect(out).toContain("2:15");
  });

  it("formats a summer build as CDT (UTC-5)", () => {
    // 2026-06-26 20:15 UTC → 3:15 PM in Chicago, daylight time.
    const out = formatBuildTime("2026-06-26T20:15:00Z");
    expect(out).toContain("CDT");
    expect(out).toContain("3:15");
  });

  it("falls back to the raw string when the timestamp is unparseable", () => {
    expect(formatBuildTime("not-a-date")).toBe("not-a-date");
  });
});
