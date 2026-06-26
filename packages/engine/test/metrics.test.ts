import { describe, it, expect } from "vitest";
import type { SummaryFile } from "@barometer/types";
import { buildMetrics } from "../src/metrics.js";

const summary: SummaryFile = {
  overall: {
    status: "partial_outage",
    label: "Unsettled",
    providersOperational: 1,
    providersTotal: 2,
    generatedAt: "2026-06-25T12:00:00.000Z",
  },
  providers: [
    { id: "good", displayName: "Good", status: "operational", activeIncidents: [], checkedAt: "t", sourceUrl: "u", uptime: { "24h": 100, "7d": 100, "30d": 100, "90d": 100 } },
    { id: "bad", displayName: "Bad", status: "unknown", activeIncidents: [], checkedAt: "t", sourceUrl: "u", uptime: { "24h": null, "7d": null, "30d": null, "90d": null } },
  ],
  generatedAt: "2026-06-25T12:00:00.000Z",
};

describe("buildMetrics", () => {
  const metrics = buildMetrics(summary, 1234);
  const byName = (name: string) => metrics.filter((m) => m.MetricName === name);

  it("emits RunSuccess = 1", () => {
    expect(byName("RunSuccess")[0]?.Value).toBe(1);
  });

  it("emits run duration", () => {
    expect(byName("RunDurationMs")[0]?.Value).toBe(1234);
  });

  it("emits per-provider FetchSuccess (0 for unknown, 1 otherwise)", () => {
    const fetch = byName("FetchSuccess");
    expect(fetch).toHaveLength(2);
    expect(fetch.find((m) => m.Dimensions?.[0]?.Value === "good")?.Value).toBe(1);
    expect(fetch.find((m) => m.Dimensions?.[0]?.Value === "bad")?.Value).toBe(0);
  });

  it("counts providers in each status bucket", () => {
    expect(byName("ProvidersUnknown")[0]?.Value).toBe(1);
    expect(byName("ProvidersOperational")[0]?.Value).toBe(1);
  });
});

describe("buildMetrics per-status counts", () => {
  const mk = (id: string, status: SummaryFile["providers"][number]["status"]) => ({
    id,
    displayName: id,
    status,
    activeIncidents: [],
    checkedAt: "t",
    sourceUrl: "u",
    uptime: { "24h": null, "7d": null, "30d": null, "90d": null },
  });
  const summary: SummaryFile = {
    overall: { status: "major_outage", label: "Stormy", providersOperational: 1, providersTotal: 6, generatedAt: "t" },
    providers: [
      mk("a", "operational"),
      mk("b", "degraded"),
      mk("c", "partial_outage"),
      mk("d", "major_outage"),
      mk("e", "maintenance"),
      mk("f", "unknown"),
    ],
    generatedAt: "t",
  };
  const metrics = buildMetrics(summary, 1);
  const value = (name: string) => metrics.find((m) => m.MetricName === name)?.Value;

  it("emits a count metric for every status bucket, including zero", () => {
    expect(value("ProvidersOperational")).toBe(1);
    expect(value("ProvidersDegraded")).toBe(1);
    expect(value("ProvidersPartialOutage")).toBe(1);
    expect(value("ProvidersMajorOutage")).toBe(1);
    expect(value("ProvidersMaintenance")).toBe(1);
    expect(value("ProvidersUnknown")).toBe(1);
  });
});
