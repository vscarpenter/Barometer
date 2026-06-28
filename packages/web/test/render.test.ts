import { describe, it, expect } from "vitest";
import type { OverallReading, SummaryProvider } from "@barometer/types";
import { renderHeadline, createHeadline } from "../src/render/headline.js";
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
  it("renders the live dial with the needle swung to the reading angle", () => {
    const dial = el.querySelector<SVGElement>(".reading__dial");
    expect(dial).not.toBeNull();
    const needle = dial!.querySelector<SVGElement>(".dial__needle");
    expect(needle).not.toBeNull();
    // partial_outage → -29deg (see dial.ts NEEDLE_ANGLE)
    expect(needle!.style.transform).toContain("rotate(-29deg)");
  });
  it("names the offenders when provided, clamped to 3 + more", () => {
    const withOffenders = renderHeadline(overall, [
      { displayName: "GitHub", status: "major_outage" },
      { displayName: "GCP", status: "degraded" },
      { displayName: "Vercel", status: "partial_outage" },
      { displayName: "AWS", status: "degraded" },
    ]);
    const text = withOffenders.querySelector(".reading__offenders")?.textContent ?? "";
    expect(text).toContain("GitHub major outage");
    expect(text).toContain("GCP degraded");
    expect(text).toContain("+1 more");
  });
  it("omits the offenders line when there are none", () => {
    expect(renderHeadline(overall).querySelector(".reading__offenders")).toBeNull();
  });
  it("groups text and gauge so the band can lay out horizontally", () => {
    const text = el.querySelector(".reading__text");
    const gauge = el.querySelector(".reading__gauge");
    expect(text).not.toBeNull();
    expect(gauge).not.toBeNull();
    // Weather word + count line live in the text group; dial + scale in the gauge group.
    expect(text!.querySelector(".reading__weather")).not.toBeNull();
    expect(text!.querySelector(".reading__sub")).not.toBeNull();
    expect(gauge!.querySelector(".reading__dial")).not.toBeNull();
    expect(gauge!.querySelector(".reading__scale-labels")).not.toBeNull();
  });
  it("keeps the offenders line inside the text group", () => {
    const withOffenders = renderHeadline(overall, [{ displayName: "GitHub", status: "major_outage" }]);
    const text = withOffenders.querySelector(".reading__text");
    expect(text!.querySelector(".reading__offenders")).not.toBeNull();
  });
  it("gives first-timers inline hints on the weather word and the dial", () => {
    expect((el.querySelector<HTMLElement>(".reading__weather")?.title.length ?? 0)).toBeGreaterThan(0);
    expect((el.querySelector<HTMLElement>(".reading__gauge")?.title.length ?? 0)).toBeGreaterThan(0);
  });
});

describe("createHeadline", () => {
  it("reuses the SAME dial needle across updates so the sweep can animate", () => {
    const h = createHeadline();
    h.update(overall); // partial_outage → -29deg
    const needle = h.element.querySelector<SVGElement>(".dial__needle")!;
    expect(needle.style.transform).toContain("rotate(-29deg)");
    h.update({ ...overall, status: "operational", label: "Fair" });
    // same node, only its transform changed — that's what lets CSS animate it
    expect(h.element.querySelector(".dial__needle")).toBe(needle);
    expect(needle.style.transform).toContain("rotate(72deg)");
  });

  it("adds and removes the offenders line in place as offenders come and go", () => {
    const h = createHeadline();
    h.update(overall, [{ displayName: "GitHub", status: "major_outage" }]);
    expect(h.element.querySelector(".reading__offenders")?.textContent).toContain("GitHub major outage");
    h.update(overall, []);
    expect(h.element.querySelector(".reading__offenders")).toBeNull();
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
  it("includes a sparkline and only the uptime windows the history backs", () => {
    expect(card.querySelector("svg")).toBeTruthy();
    expect(card.textContent).toContain("98.5");
    expect(card.textContent).not.toContain("—"); // 30d is null -> hidden, not dashed
    expect(card.textContent).not.toContain("30d");
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

  it("becomes a keyboard-operable button that opens the drill-down when given a handler", () => {
    let opened: string | null = null;
    const c = renderCard(provider, [], (p) => {
      opened = p.id;
    });
    expect(c.getAttribute("role")).toBe("button");
    expect(c.getAttribute("tabindex")).toBe("0");
    expect(c.getAttribute("aria-haspopup")).toBe("dialog");
    c.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(opened).toBe("cloudflare");
    opened = null;
    c.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(opened).toBe("cloudflare");
  });

  it("stays inert (no button role) when no handler is given", () => {
    expect(renderCard(provider, []).getAttribute("role")).toBeNull();
  });

  it("renders the incident as plain text (no nested link) when it is an interactive button", () => {
    // A link inside a role=button is invalid ARIA, and the card's Enter/Space
    // handler would hijack the link. The drill-down dialog provides the link.
    const c = renderCard(provider, [], () => {});
    expect(c.querySelector("a")).toBeNull();
    expect(c.textContent).toContain("Edge errors in EU");
  });

  it("tags the card with its provider id so focus can return to it after the dialog closes", () => {
    expect(renderCard(provider, [], () => {}).dataset.provider).toBe("cloudflare");
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
