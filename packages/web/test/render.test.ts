import { describe, it, expect } from "vitest";
import type { OverallReading, SummaryProvider } from "@barometer/types";
import { renderHeadline } from "../src/render/headline.js";
import { renderCard } from "../src/render/card.js";
import { renderSparkline } from "../src/render/sparkline.js";
import { renderStaleBanner } from "../src/render/banner.js";

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
  it("includes a sparkline and the uptime windows (null -> dash)", () => {
    expect(card.querySelector("svg")).toBeTruthy();
    expect(card.textContent).toContain("98.5");
    expect(card.textContent).toContain("—"); // 30d is null
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
  it("is a polite live region warning about staleness", () => {
    const banner = renderStaleBanner("2026-06-25T11:00:00.000Z", Date.parse("2026-06-25T12:00:00.000Z"));
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.textContent?.toLowerCase()).toContain("stale");
  });
});
