import { describe, it, expect, vi } from "vitest";
import type { SummaryProvider, RollupsFile, IncidentsFile } from "@barometer/types";
import { renderProviderDialog, openProviderDialog, resolvedFor } from "../src/render/dialog.js";

const NOW = Date.parse("2026-06-25T12:00:00.000Z");

const provider: SummaryProvider = {
  id: "github",
  displayName: "GitHub",
  status: "partial_outage",
  activeIncidents: [
    { id: "i1", title: "Elevated 5xx", impact: "major", status: "investigating", startedAt: "2026-06-25T10:30:00.000Z", url: "https://x/i1" },
    { id: "i2", title: "APAC latency", impact: "minor", status: "monitoring", startedAt: "2026-06-25T11:00:00.000Z", url: "https://x/i2", regions: ["asia-south2"] },
  ],
  checkedAt: "2026-06-25T12:00:00.000Z",
  sourceUrl: "https://www.githubstatus.com",
  uptime: { "24h": 98.5, "7d": 99.1, "30d": null, "90d": 99.92 },
};

const rollups: RollupsFile = {
  days: [
    { date: "2026-06-24", providers: { github: { up: 288, down: 0 } } },
    { date: "2026-06-25", providers: { github: { up: 200, down: 88 } } },
  ],
};

describe("renderProviderDialog", () => {
  it("shows the provider name, all active incidents, and incident age", () => {
    const d = renderProviderDialog({ provider, rollups, resolvedIncidents: [], now: NOW });
    expect(d.querySelector(".dlg__title")?.textContent).toBe("GitHub");
    expect(d.querySelectorAll(".dlg-incident")).toHaveLength(2); // not collapsed to one
    expect(d.textContent).toContain("Elevated 5xx");
    expect(d.textContent).toContain("APAC latency");
    expect(d.textContent?.toLowerCase()).toContain("ago"); // "started 1h 30m ago"
  });

  it("mutes a non-US-only incident and tags its regions", () => {
    const d = renderProviderDialog({ provider, rollups, resolvedIncidents: [], now: NOW });
    expect(d.querySelector(".dlg-incident--muted")).not.toBeNull();
    expect(d.textContent?.toLowerCase()).toContain("not counted");
  });

  it("renders the 90-day uptime bar as a full frame when rollups are present", () => {
    const d = renderProviderDialog({ provider, rollups, resolvedIncidents: [], now: NOW });
    expect(d.querySelector(".uptimebar")).not.toBeNull();
    const cells = d.querySelectorAll<HTMLElement>(".uptimebar__cell");
    expect(cells).toHaveLength(90); // 2 measured days padded into the 90-day frame
    expect(cells[cells.length - 1]!.title).toContain("2026-06-25"); // newest measured day at the end
  });

  it("never makes a javascript: URL clickable but still shows the title", () => {
    const hostile: SummaryProvider = {
      ...provider,
      activeIncidents: [{ ...provider.activeIncidents[0]!, url: "javascript:alert(1)" }],
    };
    const d = renderProviderDialog({ provider: hostile, rollups: null, resolvedIncidents: [], now: NOW });
    expect(d.querySelector("a")).toBeNull();
    expect(d.textContent).toContain("Elevated 5xx");
  });

  it("lists resolved incidents from the archive", () => {
    const d = renderProviderDialog({
      provider,
      rollups: null,
      resolvedIncidents: [
        { key: "github:old", providerId: "github", providerName: "GitHub", title: "Past outage", impact: "critical", url: "https://x/old", firstSeen: "t", lastSeen: "t", resolvedAt: "2026-06-20T00:00:00.000Z" },
      ],
      now: NOW,
    });
    expect(d.textContent).toContain("Past outage");
    expect(d.textContent).toContain("resolved 2026-06-20");
  });

  it("has an accessible label and a working close button", () => {
    const d = renderProviderDialog({ provider, rollups: null, resolvedIncidents: [], now: NOW });
    expect(d.getAttribute("aria-label")).toMatch(/github/i);
    expect(d.querySelector(".dlg__close")).not.toBeNull();
  });

  it("wraps all content in one padded body so backdrop-padding clicks don't dismiss it", () => {
    const d = renderProviderDialog({ provider, rollups, resolvedIncidents: [], now: NOW });
    // The <dialog> itself carries no clickable padding; everything lives in the
    // inner body, so a click only reaches the dialog from the true backdrop.
    expect(d.children).toHaveLength(1);
    const body = d.firstElementChild!;
    expect(body.classList.contains("dlg__body")).toBe(true);
    expect(body.querySelector(".dlg__title")).not.toBeNull();
  });

  it("closes on a backdrop click but not on a click inside the body", () => {
    const d = renderProviderDialog({ provider, rollups: null, resolvedIncidents: [], now: NOW });
    const closeSpy = vi.spyOn(d, "close");
    d.firstElementChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(closeSpy).not.toHaveBeenCalled(); // target is the body, not the backdrop
    d.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(closeSpy).toHaveBeenCalled(); // target === dialog → backdrop
  });

  it("reuses the shared uptime windows (no inline copy)", () => {
    const d = renderProviderDialog({ provider, rollups: null, resolvedIncidents: [], now: NOW });
    const dl = d.querySelector(".card__uptime.dlg__uptime");
    expect(dl).not.toBeNull();
    expect(dl!.textContent).toContain("98.5%");
  });
});

describe("openProviderDialog lifecycle", () => {
  it("attaches the dialog to the body and removes it on close", () => {
    const d = openProviderDialog({ provider, rollups: null, resolvedIncidents: [], now: NOW });
    expect(document.body.contains(d)).toBe(true);
    d.close();
    expect(document.body.contains(d)).toBe(false);
  });
});

describe("resolvedFor", () => {
  const incidents: IncidentsFile = {
    incidents: [
      { key: "github:a", providerId: "github", providerName: "GitHub", title: "a", impact: "minor", url: "u", firstSeen: "t", lastSeen: "t", resolvedAt: "2026-06-20T00:00:00.000Z" },
      { key: "github:b", providerId: "github", providerName: "GitHub", title: "b", impact: "minor", url: "u", firstSeen: "t", lastSeen: "t", resolvedAt: "2026-06-22T00:00:00.000Z" },
      { key: "github:c", providerId: "github", providerName: "GitHub", title: "c", impact: "minor", url: "u", firstSeen: "t", lastSeen: "t", resolvedAt: null },
      { key: "aws:x", providerId: "aws", providerName: "AWS", title: "x", impact: "minor", url: "u", firstSeen: "t", lastSeen: "t", resolvedAt: "2026-06-21T00:00:00.000Z" },
    ],
  };
  it("returns only resolved incidents for the provider, newest-first", () => {
    const out = resolvedFor(incidents, "github");
    expect(out.map((r) => r.key)).toEqual(["github:b", "github:a"]);
  });
  it("returns [] for null archive", () => {
    expect(resolvedFor(null, "github")).toEqual([]);
  });
});
