import { describe, it, expect } from "vitest";
import type { ProviderSnapshot, IncidentsFile } from "@barometer/types";
import { updateIncidents } from "../src/incidents.js";

const T1 = "2026-06-25T00:00:00.000Z";
const T2 = "2026-06-25T00:05:00.000Z";
const T3 = "2026-06-25T00:10:00.000Z";

function snap(id: string, incidents: ProviderSnapshot["activeIncidents"]): ProviderSnapshot {
  return {
    id,
    displayName: id.toUpperCase(),
    status: incidents.length ? "partial_outage" : "operational",
    activeIncidents: incidents,
    checkedAt: T1,
    sourceUrl: "https://x",
  };
}

const inc = (id: string, over: Partial<ProviderSnapshot["activeIncidents"][number]> = {}) => ({
  id,
  title: "Errors",
  impact: "minor" as const,
  status: "investigating",
  startedAt: T1,
  url: `https://x/${id}`,
  ...over,
});

const empty: IncidentsFile = { incidents: [] };

describe("updateIncidents", () => {
  it("opens a new record for a newly-active incident", () => {
    const out = updateIncidents(empty, [snap("github", [inc("a")])], T1);
    expect(out.incidents).toHaveLength(1);
    expect(out.incidents[0]).toMatchObject({
      key: "github:a",
      providerId: "github",
      firstSeen: T1,
      lastSeen: T1,
      resolvedAt: null,
    });
  });

  it("updates lastSeen and raises peak impact while still active", () => {
    const r1 = updateIncidents(empty, [snap("github", [inc("a", { impact: "minor" })])], T1);
    const r2 = updateIncidents(r1, [snap("github", [inc("a", { impact: "critical", title: "Worse" })])], T2);
    expect(r2.incidents).toHaveLength(1);
    expect(r2.incidents[0]).toMatchObject({
      firstSeen: T1,
      lastSeen: T2,
      impact: "critical",
      title: "Worse",
      resolvedAt: null,
    });
  });

  it("marks a record resolved when it leaves the active set, then keeps it", () => {
    const r1 = updateIncidents(empty, [snap("github", [inc("a")])], T1);
    const r2 = updateIncidents(r1, [snap("github", [])], T2);
    expect(r2.incidents[0]!.resolvedAt).toBe(T2);
    const r3 = updateIncidents(r2, [snap("github", [])], T3);
    expect(r3.incidents[0]!.resolvedAt).toBe(T2); // unchanged
  });

  it("carries region info from the incident onto the record", () => {
    const out = updateIncidents(empty, [snap("gcp", [inc("a", { regions: ["us-east1"] })])], T1);
    expect(out.incidents[0]!.regions).toEqual(["us-east1"]);
  });

  it("reopens a resolved incident if its id flaps back to active", () => {
    const r1 = updateIncidents(empty, [snap("github", [inc("a")])], T1);
    const r2 = updateIncidents(r1, [snap("github", [])], T2); // resolved
    const r3 = updateIncidents(r2, [snap("github", [inc("a")])], T3); // active again
    expect(r3.incidents).toHaveLength(1);
    expect(r3.incidents[0]).toMatchObject({ firstSeen: T1, lastSeen: T3, resolvedAt: null });
  });

  it("bounds the archive to ongoing + the most recent `cap` resolved", () => {
    // Open + resolve three incidents at distinct times, cap = 2 resolved.
    let acc: IncidentsFile = empty;
    acc = updateIncidents(acc, [snap("p", [inc("a"), inc("b"), inc("c"), inc("ongoing")])], T1);
    acc = updateIncidents(acc, [snap("p", [inc("ongoing")])], T1); // a,b,c resolved at T1
    // Resolve at different timestamps by resolving one per step.
    let step = updateIncidents(
      { incidents: [
        { key: "p:a", providerId: "p", providerName: "P", title: "t", impact: "minor", url: "u", firstSeen: T1, lastSeen: T1, resolvedAt: "2026-06-25T01:00:00.000Z" },
        { key: "p:b", providerId: "p", providerName: "P", title: "t", impact: "minor", url: "u", firstSeen: T1, lastSeen: T1, resolvedAt: "2026-06-25T02:00:00.000Z" },
        { key: "p:c", providerId: "p", providerName: "P", title: "t", impact: "minor", url: "u", firstSeen: T1, lastSeen: T1, resolvedAt: "2026-06-25T03:00:00.000Z" },
        { key: "p:ongoing", providerId: "p", providerName: "P", title: "t", impact: "minor", url: "u", firstSeen: T1, lastSeen: T1, resolvedAt: null },
      ] },
      [snap("p", [inc("ongoing")])],
      T3,
      2,
    );
    const keys = step.incidents.map((r) => r.key);
    expect(keys).toContain("p:ongoing"); // ongoing always kept
    expect(keys).toContain("p:c"); // newest resolved
    expect(keys).toContain("p:b");
    expect(keys).not.toContain("p:a"); // oldest resolved dropped by the cap
  });
});
