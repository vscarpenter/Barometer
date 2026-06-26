import { describe, it, expect } from "vitest";
import {
  CurrentFileSchema,
  SummaryFileSchema,
  StateFileSchema,
  RecentFileSchema,
  RollupsFileSchema,
} from "../src/files.js";

const overall = {
  status: "operational",
  label: "Fair — all clear (high pressure)",
  providersOperational: 1,
  providersTotal: 1,
  generatedAt: "2026-06-25T00:00:00.000Z",
};
const provider = {
  id: "cloudflare",
  displayName: "Cloudflare",
  status: "operational",
  activeIncidents: [],
  checkedAt: "2026-06-25T00:00:00.000Z",
  sourceUrl: "https://www.cloudflarestatus.com",
};

describe("file schemas (SPEC §6)", () => {
  it("accepts a valid current.json", () => {
    expect(
      CurrentFileSchema.safeParse({
        generatedAt: "2026-06-25T00:00:00.000Z",
        overall,
        providers: [provider],
      }).success,
    ).toBe(true);
  });

  it("accepts a valid summary.json with uptime windows", () => {
    expect(
      SummaryFileSchema.safeParse({
        overall,
        generatedAt: "2026-06-25T00:00:00.000Z",
        providers: [{ ...provider, uptime: { "24h": 99.9, "7d": null, "30d": 100, "90d": 99.5 } }],
      }).success,
    ).toBe(true);
  });

  it("rejects a summary provider missing uptime", () => {
    expect(
      SummaryFileSchema.safeParse({
        overall,
        generatedAt: "2026-06-25T00:00:00.000Z",
        providers: [provider],
      }).success,
    ).toBe(false);
  });

  it("accepts a valid state.json", () => {
    expect(
      StateFileSchema.safeParse({
        updatedAt: "2026-06-25T00:00:00.000Z",
        providers: {
          cloudflare: {
            alertState: "operational",
            triggeringStatus: null,
            pendingStatus: null,
            consecutiveCount: 0,
            lastTransitionAt: "2026-06-25T00:00:00.000Z",
            etag: null,
          },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts recent + rollups files", () => {
    expect(
      RecentFileSchema.safeParse({
        samples: [{ t: "2026-06-25T00:00:00.000Z", s: { cloudflare: "operational" } }],
      }).success,
    ).toBe(true);
    expect(
      RollupsFileSchema.safeParse({
        days: [{ date: "2026-06-25", providers: { cloudflare: { up: 288, down: 0 } } }],
      }).success,
    ).toBe(true);
  });
});
