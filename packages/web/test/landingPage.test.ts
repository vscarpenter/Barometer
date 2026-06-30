import { describe, it, expect, vi } from "vitest";
import type { ProviderStatus, SummaryFile, SummaryProvider } from "@barometer/types";
import { createLandingPage } from "../src/render/landingPage.js";

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

describe("createLandingPage", () => {
  it("has one h1 carrying the question and the signature key word", () => {
    const page = createLandingPage();
    const h1s = page.element.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(page.element.querySelector("h1")?.textContent).toMatch(/is the internet healthy right now\?/i);
    // The signature underline lands on the single marked word.
    expect(page.element.querySelector(".lp-mark")?.textContent).toBe("healthy");
  });

  it("has exactly one conversion action: every CTA opens the dashboard", () => {
    const page = createLandingPage();
    const ctas = page.element.querySelectorAll<HTMLAnchorElement>("a.lp-cta");
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    expect([...ctas].every((a) => a.getAttribute("href") === "/")).toBe(true);
  });

  it("uses three distinct CTA levels (no ties): primary, secondary, ghost", () => {
    const page = createLandingPage();
    expect(page.element.querySelector(".lp-cta--primary")).not.toBeNull(); // hero
    expect(page.element.querySelector(".lp-cta--secondary")).not.toBeNull(); // final
    expect(page.element.querySelector(".lp-cta--ghost")).not.toBeNull(); // nav
  });

  it("lists the live provider set from one source (incl. DNS probes), count-neutral", () => {
    const page = createLandingPage();
    const items = page.element.querySelectorAll(".lp-providers li");
    expect(items).toHaveLength(11); // shares aboutPage's PROVIDERS — single source of truth
    const t = page.element.textContent ?? "";
    expect(t).toContain("Cloudflare DNS");
    expect(t).toContain("Google DNS");
    // Prose must not hardcode a count that can drift from the list / dashboard.
    expect(t).not.toMatch(/\bnine\b/i);
  });

  it("explains the availability rule with the real status chips (color + label + icon)", () => {
    const page = createLandingPage();
    const t = (page.element.textContent ?? "").toLowerCase();
    expect(t).toContain("us-scoped");
    expect(t).toContain("excluded");
    // All six normalized statuses appear as labelled chips, each with an icon.
    const labels = [...page.element.querySelectorAll(".lp-chip__label")].map((n) => n.textContent);
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
    const chips = page.element.querySelectorAll(".lp-chip");
    expect([...chips].every((c) => c.querySelector("svg") !== null)).toBe(true);
  });

  it("shows a loading state before any data and no reading band yet", () => {
    const page = createLandingPage();
    page.update(null, false);
    expect(page.element.querySelector(".lp-panel__state")?.textContent).toMatch(/reading the barometer/i);
    expect(page.element.querySelector(".reading")).toBeNull();
  });

  it("mounts the live reading band and names offenders when something is down", () => {
    const page = createLandingPage();
    page.update(
      summary("partial_outage", [
        provider("AWS", "operational"),
        provider("GitHub", "partial_outage"),
      ]),
      false,
    );
    const band = page.element.querySelector(".reading");
    expect(band).not.toBeNull();
    expect(band?.getAttribute("data-status")).toBe("partial_outage");
    expect(page.element.querySelector(".reading__count")?.textContent).toBe("1 of 2");
    expect(page.element.querySelector(".reading__offenders")?.textContent).toMatch(/github/i);
  });

  it("keeps the last good reading on a transient error (failed flag, summary present)", () => {
    const page = createLandingPage();
    page.update(summary("operational", [provider("AWS", "operational")]), false);
    page.update(summary("operational", [provider("AWS", "operational")]), true);
    expect(page.element.querySelector(".reading")).not.toBeNull();
    expect(page.element.querySelector(".lp-panel__state")).toBeNull();
  });

  it("shows the error state only when no data has ever arrived", () => {
    const page = createLandingPage();
    page.update(null, true);
    expect(page.element.querySelector(".lp-panel__state")?.textContent).toMatch(/couldn't reach/i);
  });

  it("reads 'Live' before any reading arrives", () => {
    const page = createLandingPage();
    expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Live");
    page.update(null, false);
    expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Live");
  });

  it("ages the freshness label from the data's generatedAt, ticking in place", () => {
    vi.useFakeTimers();
    try {
      // 10s after the fixture's generatedAt (ISO).
      vi.setSystemTime(new Date("2026-06-26T03:37:21.872Z"));
      const page = createLandingPage();
      page.update(summary("operational", [provider("AWS", "operational")]), false);
      expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Updated 10s ago");
      // tick() re-ages from the same reading (no re-poll) as wall-clock advances.
      vi.setSystemTime(new Date("2026-06-26T03:38:11.872Z")); // 60s after
      page.tick();
      expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Updated 1m ago");
    } finally {
      vi.useRealTimers();
    }
  });
});
