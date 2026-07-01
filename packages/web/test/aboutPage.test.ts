import { describe, it, expect, vi } from "vitest";
import type { ProviderStatus, SummaryFile, SummaryProvider } from "@barometer/types";
import { createAboutPage } from "../src/render/aboutPage.js";

const ISO = "2026-06-26T03:37:11.872Z";

function provider(displayName: string, status: ProviderStatus): SummaryProvider {
  return {
    id: displayName.toLowerCase().replace(/\s+/g, "-"),
    displayName,
    status,
    activeIncidents: [],
    checkedAt: ISO,
    sourceUrl: "https://example.com",
    uptime: { "24h": 100, "7d": 100, "30d": 100, "90d": 99 },
  };
}

function summary(status: ProviderStatus, providers: SummaryProvider[]): SummaryFile {
  const operational = providers.filter((p) => p.status === "operational").length;
  return {
    overall: {
      status,
      label: status === "operational" ? "Fair — all clear (high pressure)" : "Unsettled",
      providersOperational: operational,
      providersTotal: providers.length,
      generatedAt: ISO,
    },
    providers,
    generatedAt: ISO,
  };
}

describe("createAboutPage — static structure", () => {
  const page = createAboutPage().element;

  it("has one h1 carrying the question and the signature key word, plus a back link", () => {
    expect(page.querySelectorAll("h1")).toHaveLength(1);
    expect(page.querySelector("h1")?.textContent).toMatch(/is the internet healthy right now\?/i);
    expect(page.querySelector(".lp-mark")?.textContent).toBe("healthy");
    expect(page.querySelector('a.about__back[href="/"]')).not.toBeNull();
  });

  it("carries the pipeline description that moved out of the footer", () => {
    expect(page.textContent).toContain("weather labels are presentation only");
  });

  it("explains the availability rule with the real status chips (all six statuses)", () => {
    const t = (page.textContent ?? "").toLowerCase();
    expect(t).toContain("excluded");
    expect(t).toContain("maintenance");
    const labels = [...page.querySelectorAll(".lp-chip__label")].map((n) => n.textContent);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Operational",
        "Degraded",
        "Partial outage",
        "Major outage",
        "Maintenance",
        "Unknown",
      ]),
    );
    const chips = page.querySelectorAll(".lp-chip");
    expect([...chips].every((c) => c.querySelector("svg") !== null)).toBe(true);
  });

  it("states the overall reading is US-scoped without claiming US-only providers", () => {
    const t = (page.textContent ?? "").toLowerCase();
    expect(t).toContain("us-scoped");
    expect(t).toContain("global");
    expect(t).toContain("united states");
  });

  it("lists the live provider set (incl. DNS probes) with no stale hardcoded count", () => {
    const items = page.querySelectorAll(".about__providers li");
    const t = page.textContent ?? "";
    expect(items).toHaveLength(11);
    expect(t).toContain("Cloudflare DNS");
    expect(t).toContain("Google DNS");
    expect(t).not.toMatch(/\bnine\b/i);
  });

  it("links to the GitHub repository (new tab, safe rel)", () => {
    const gh = page.querySelector<HTMLAnchorElement>('a[href*="github.com/vscarpenter/Barometer"]');
    expect(gh).not.toBeNull();
    expect(gh!.target).toBe("_blank");
    expect(gh!.rel).toContain("noopener");
  });

  it("shows the theme-aware architecture diagrams (overview + engine, light + dark, alt text, not lazy)", () => {
    expect(page.querySelector('img[src="/barometer-overview-almanac.svg"]')).not.toBeNull();
    expect(page.querySelector('img[src="/barometer-overview-almanac-dark.svg"]')).not.toBeNull();
    expect(page.querySelector('img[src="/barometer-engine-almanac.svg"]')).not.toBeNull();
    expect(page.querySelector('img[src="/barometer-engine-almanac-dark.svg"]')).not.toBeNull();
    const diagrams = page.querySelectorAll<HTMLImageElement>("img.about__diagram");
    expect(diagrams).toHaveLength(4);
    expect([...diagrams].every((img) => img.alt.length > 0)).toBe(true);
    expect([...diagrams].every((img) => img.loading !== "lazy")).toBe(true);
    // The two diagrams carry distinct descriptions — not a copy-pasted alt text.
    expect(diagrams[0]!.alt).not.toBe(diagrams[2]!.alt);
  });

  it("has exactly one quiet CTA that opens the dashboard", () => {
    const ctas = page.querySelectorAll<HTMLAnchorElement>("a.lp-cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0]!.getAttribute("href")).toBe("/");
    expect(ctas[0]!.classList.contains("lp-cta--ghost")).toBe(true);
  });
});

describe("createAboutPage — live reading band", () => {
  it("shows a loading state before any data and no reading band yet", () => {
    const page = createAboutPage();
    page.update(null, false);
    expect(page.element.querySelector(".lp-panel__state")?.textContent).toMatch(/reading the barometer/i);
    expect(page.element.querySelector(".reading")).toBeNull();
  });

  it("mounts the live reading band and names offenders when something is down", () => {
    const page = createAboutPage();
    page.update(
      summary("partial_outage", [provider("AWS", "operational"), provider("GitHub", "partial_outage")]),
      false,
    );
    const band = page.element.querySelector(".reading");
    expect(band).not.toBeNull();
    expect(band?.getAttribute("data-status")).toBe("partial_outage");
    expect(page.element.querySelector(".reading__count")?.textContent).toBe("1 of 2");
    expect(page.element.querySelector(".reading__offenders")?.textContent).toMatch(/github/i);
  });

  it("keeps the last good reading on a transient error (failed flag, summary present)", () => {
    const page = createAboutPage();
    page.update(summary("operational", [provider("AWS", "operational")]), false);
    page.update(summary("operational", [provider("AWS", "operational")]), true);
    expect(page.element.querySelector(".reading")).not.toBeNull();
    expect(page.element.querySelector(".lp-panel__state")).toBeNull();
  });

  it("shows the error state only when no data has ever arrived", () => {
    const page = createAboutPage();
    page.update(null, true);
    expect(page.element.querySelector(".lp-panel__state")?.textContent).toMatch(/couldn't reach/i);
  });

  it("ages the freshness label from the data's generatedAt, ticking in place", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-26T03:37:21.872Z")); // +10s
      const page = createAboutPage();
      page.update(summary("operational", [provider("AWS", "operational")]), false);
      expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Updated 10s ago");
      vi.setSystemTime(new Date("2026-06-26T03:38:11.872Z")); // +60s
      page.tick();
      expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Updated 1m ago");
    } finally {
      vi.useRealTimers();
    }
  });
});
