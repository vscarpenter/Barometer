import { describe, it, expect } from "vitest";
import type { OverallReading, SummaryProvider } from "@barometer/types";
import { renderHeadline } from "../src/render/headline.js";
import { renderCard } from "../src/render/card.js";
import { renderSparkline } from "../src/render/sparkline.js";
import { renderStaleBanner, createBannerRegion, updateBannerRegion } from "../src/render/banner.js";

const overall: OverallReading = {
  status: "partial_outage",
  label: "Unsettled",
  providersOperational: 7,
  providersTotal: 9,
  generatedAt: "2026-06-25T12:00:00.000Z",
};

const provider: SummaryProvider = {
  id: "cloudflare",
  displayName: "Cloudflare",
  status: "major_outage",
  activeIncidents: [
    { id: "i1", title: "Edge errors in EU", impact: "major", status: "investigating", startedAt: "t", url: "https://x/i1" },
  ],
  checkedAt: "2026-06-25T12:00:00.000Z",
  sourceUrl: "https://www.cloudflarestatus.com",
  uptime: { "24h": 98.5, "7d": 99.1, "30d": null, "90d": 99.92 },
};

describe("renderHeadline", () => {
  const el = renderHeadline(overall);
  it("shows the weather label and the raw status as a data attribute", () => {
    expect(el.textContent).toContain("Unsettled");
    expect(el.getAttribute("data-status")).toBe("partial_outage");
  });
  it("shows the operational count", () => {
    expect(el.textContent).toContain("7");
    expect(el.textContent).toContain("9");
  });
  it("renders the pressure scale with the marker at the reading position", () => {
    expect(el.querySelector(".reading__scale-track")).not.toBeNull();
    const marker = el.querySelector<HTMLElement>(".reading__marker");
    expect(marker).not.toBeNull();
    expect(marker!.style.left).toBe("34%"); // partial_outage sits at 34% on Stormy→Fair
  });
});

describe("renderCard", () => {
  const card = renderCard(provider, ["operational", "operational", "major_outage"]);
  it("shows the provider name", () => {
    expect(card.textContent).toContain("Cloudflare");
  });
  it("pairs status color with a text label (never color alone)", () => {
    expect(card.textContent?.toLowerCase()).toContain("major outage");
  });
  it("links the active incident", () => {
    const link = card.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://x/i1");
    expect(card.textContent).toContain("Edge errors in EU");
  });
  it("never makes a javascript: incident URL clickable, but still shows the title", () => {
    const hostile: SummaryProvider = {
      ...provider,
      activeIncidents: [{ ...provider.activeIncidents[0]!, url: "javascript:alert(document.cookie)" }],
    };
    const hostileCard = renderCard(hostile, []);
    expect(hostileCard.querySelector("a")).toBeNull(); // no clickable link
    expect(hostileCard.textContent).toContain("Edge errors in EU"); // title still surfaced
  });
  it("includes a sparkline and the uptime windows (null -> dash)", () => {
    expect(card.querySelector("svg")).toBeTruthy();
    expect(card.textContent).toContain("98.5");
    expect(card.textContent).toContain("—"); // 30d is null
  });

  it("mutes and labels a non-US-only incident", () => {
    const p: SummaryProvider = {
      ...provider, status: "operational",
      activeIncidents: [{ id: "n1", title: "APAC latency", impact: "major", status: "monitoring", startedAt: "t", url: "https://x/n1", regions: ["asia-south2"] }],
    };
    const c = renderCard(p, []);
    expect(c.querySelector(".card__incident--muted")).not.toBeNull();
    expect(c.textContent?.toLowerCase()).toContain("not counted");
    expect(c.textContent).toContain("asia-south2");
  });

  it("tags a US/global incident without muting it", () => {
    const p: SummaryProvider = {
      ...provider, status: "partial_outage",
      activeIncidents: [{ id: "u1", title: "Edge errors", impact: "major", status: "monitoring", startedAt: "t", url: "https://x/u1", regions: ["us-east-1", "global"] }],
    };
    const c = renderCard(p, []);
    expect(c.querySelector(".card__incident--muted")).toBeNull();
    expect(c.textContent).toContain("us-east-1");
    expect(c.textContent).toContain("global");
  });

  it("shows the US incident when a non-US incident is listed first", () => {
    const p: SummaryProvider = {
      ...provider, status: "partial_outage",
      activeIncidents: [
        { id: "a1", title: "APAC", impact: "major", status: "investigating", startedAt: "t", url: "https://x/a1", regions: ["asia-south2"] },
        { id: "u1", title: "US edge", impact: "major", status: "investigating", startedAt: "t", url: "https://x/u1", regions: ["us-east-1"] },
      ],
    };
    const c = renderCard(p, []);
    expect(c.textContent).toContain("US edge");
    expect(c.querySelector(".card__incident--muted")).toBeNull();
    expect(c.textContent).toContain("us-east-1");
  });

  it("does not mute a region-less incident (fails open)", () => {
    expect(renderCard(provider, []).querySelector(".card__incident--muted")).toBeNull();
  });
});

describe("renderSparkline", () => {
  const spark = renderSparkline(["operational", "degraded", "major_outage"]);
  it("is an informative SVG (role=img with a title)", () => {
    expect(spark.tagName.toLowerCase()).toBe("svg");
    expect(spark.getAttribute("role")).toBe("img");
    expect(spark.querySelector("title")).toBeTruthy();
  });
  it("renders one bar per sample", () => {
    expect(spark.querySelectorAll("rect")).toHaveLength(3);
  });
  it("renders an empty-but-valid svg for no data", () => {
    expect(renderSparkline([]).querySelectorAll("rect")).toHaveLength(0);
  });
});

describe("renderStaleBanner", () => {
  it("warns about staleness with an icon and text", () => {
    const banner = renderStaleBanner("2026-06-25T11:00:00.000Z", Date.parse("2026-06-25T12:00:00.000Z"));
    expect(banner.textContent?.toLowerCase()).toContain("stale");
    expect(banner.querySelector("svg")).toBeTruthy();
  });
});

describe("banner live region", () => {
  const NOW = Date.parse("2026-06-25T12:00:00.000Z");

  it("is a persistent, empty, polite live region at creation", () => {
    const region = createBannerRegion();
    // The region must exist BEFORE it has content so a screen reader announces
    // the change; a region inserted already-populated announces unreliably.
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.childNodes.length).toBe(0);
  });

  it("populates in place when stale and clears in place when fresh", () => {
    const region = createBannerRegion();
    updateBannerRegion(region, "2026-06-25T11:00:00.000Z", NOW, true);
    expect(region.textContent?.toLowerCase()).toContain("stale");
    updateBannerRegion(region, "2026-06-25T11:59:00.000Z", NOW, false);
    expect(region.childNodes.length).toBe(0); // same node, emptied — not replaced
  });
});
