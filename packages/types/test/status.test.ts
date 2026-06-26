import { describe, it, expect } from "vitest";
import { ProviderSnapshotSchema, PROVIDER_STATUSES } from "../src/status.js";

describe("status schema", () => {
  it("lists all six statuses in severity-friendly order", () => {
    expect(PROVIDER_STATUSES).toEqual([
      "operational",
      "degraded",
      "partial_outage",
      "major_outage",
      "maintenance",
      "unknown",
    ]);
  });

  it("validates a well-formed snapshot", () => {
    const ok = ProviderSnapshotSchema.safeParse({
      id: "cloudflare",
      displayName: "Cloudflare",
      status: "operational",
      activeIncidents: [],
      checkedAt: "2026-06-25T00:00:00.000Z",
      sourceUrl: "https://www.cloudflarestatus.com",
    });
    expect(ok.success).toBe(true);
  });

  it("validates a snapshot carrying an incident", () => {
    const ok = ProviderSnapshotSchema.safeParse({
      id: "github",
      displayName: "GitHub",
      status: "partial_outage",
      activeIncidents: [
        {
          id: "abc123",
          title: "Elevated errors on Actions",
          impact: "major",
          status: "investigating",
          startedAt: "2026-06-25T00:00:00.000Z",
          url: "https://www.githubstatus.com/incidents/abc123",
        },
      ],
      checkedAt: "2026-06-25T00:05:00.000Z",
      sourceUrl: "https://www.githubstatus.com",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an unknown status string", () => {
    const bad = ProviderSnapshotSchema.safeParse({
      id: "x",
      displayName: "X",
      status: "on_fire",
      activeIncidents: [],
      checkedAt: "2026-06-25T00:00:00.000Z",
      sourceUrl: "https://x",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an incident with an invalid impact", () => {
    const bad = ProviderSnapshotSchema.safeParse({
      id: "x",
      displayName: "X",
      status: "degraded",
      activeIncidents: [
        {
          id: "1",
          title: "t",
          impact: "catastrophic",
          status: "investigating",
          startedAt: "2026-06-25T00:00:00.000Z",
          url: "https://x",
        },
      ],
      checkedAt: "2026-06-25T00:00:00.000Z",
      sourceUrl: "https://x",
    });
    expect(bad.success).toBe(false);
  });
});
