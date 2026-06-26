import { describe, it, expect } from "vitest";
import type { ProviderSnapshot, StateFile, Incident } from "@barometer/types";
import { stepAlerts, type Notification } from "../src/alerting/machine.js";

const NOW = "2026-06-25T12:00:00.000Z";

const incident: Incident = {
  id: "i1",
  title: "Elevated error rates",
  impact: "critical",
  status: "investigating",
  startedAt: NOW,
  url: "https://example.com/incidents/i1",
};

const snap = (
  status: ProviderSnapshot["status"],
  incidents: Incident[] = [],
): ProviderSnapshot => ({
  id: "a",
  displayName: "Provider A",
  status,
  activeIncidents: incidents,
  checkedAt: NOW,
  sourceUrl: "https://a",
});

const EMPTY: StateFile = { providers: {}, updatedAt: NOW };

/** Thread a sequence of single-provider runs through stepAlerts. */
function sequence(statuses: ProviderSnapshot["status"][]): {
  finalState: StateFile;
  notesPerStep: Notification[][];
} {
  let state = EMPTY;
  const notesPerStep: Notification[][] = [];
  for (const status of statuses) {
    const result = stepAlerts(state, [snap(status)], NOW);
    state = result.state;
    notesPerStep.push(result.notifications);
  }
  return { finalState: state, notesPerStep };
}

describe("stepAlerts debounce (SPEC §8)", () => {
  it("does not alert on a single down sample, then alerts on the second", () => {
    const { finalState, notesPerStep } = sequence(["major_outage", "major_outage"]);
    expect(notesPerStep[0]).toEqual([]);
    expect(notesPerStep[1]).toHaveLength(1);
    expect(notesPerStep[1]![0]!.kind).toBe("outage");
    expect(finalState.providers["a"]!.alertState).toBe("alerting");
  });

  it("does not re-alert while the provider stays down (no spam)", () => {
    const { notesPerStep } = sequence(["degraded", "degraded", "degraded", "degraded", "degraded"]);
    const outages = notesPerStep.flat().filter((n) => n.kind === "outage");
    expect(outages).toHaveLength(1);
  });

  it("alerts on a worsening streak and reports the latest down status", () => {
    const { notesPerStep } = sequence(["degraded", "major_outage"]);
    expect(notesPerStep[1]).toHaveLength(1);
    expect(notesPerStep[1]![0]!.status).toBe("major_outage");
  });
});

describe("stepAlerts recovery", () => {
  it("sends one recovery only after two consecutive operational samples", () => {
    const { finalState, notesPerStep } = sequence([
      "major_outage",
      "major_outage", // alerting
      "operational", // recovery debounce, not yet
      "operational", // recovery
    ]);
    expect(notesPerStep[2]).toEqual([]);
    expect(notesPerStep[3]).toHaveLength(1);
    expect(notesPerStep[3]![0]!.kind).toBe("recovery");
    expect(finalState.providers["a"]!.alertState).toBe("operational");
  });
});

describe("stepAlerts hold states (maintenance/unknown)", () => {
  it("never alerts while operational and resets the down streak", () => {
    // down, then unknown (resets), then two more downs are needed to fire
    const { notesPerStep } = sequence(["major_outage", "unknown", "major_outage", "major_outage"]);
    expect(notesPerStep[0]).toEqual([]);
    expect(notesPerStep[1]).toEqual([]);
    expect(notesPerStep[2]).toEqual([]); // streak restarted at 1
    expect(notesPerStep[3]).toHaveLength(1);
    expect(notesPerStep[3]![0]!.kind).toBe("outage");
  });

  it("holds the alert on unknown while alerting (no recovery, no re-alert)", () => {
    const { finalState, notesPerStep } = sequence([
      "major_outage",
      "major_outage", // alerting
      "unknown", // hold — no recovery, resets recovery streak
      "operational", // recovery debounce restarts
      "operational", // recovery
    ]);
    expect(notesPerStep[2]).toEqual([]);
    expect(notesPerStep[3]).toEqual([]);
    expect(notesPerStep[4]).toHaveLength(1);
    expect(notesPerStep[4]![0]!.kind).toBe("recovery");
    expect(finalState.providers["a"]!.alertState).toBe("operational");
  });
});

describe("stepAlerts notification payload", () => {
  it("carries provider name, status, and the active incident title + url", () => {
    let state = EMPTY;
    state = stepAlerts(state, [snap("major_outage", [incident])], NOW).state;
    const { notifications } = stepAlerts(state, [snap("major_outage", [incident])], NOW);
    const note = notifications[0]!;
    expect(note.displayName).toBe("Provider A");
    expect(note.status).toBe("major_outage");
    expect(note.incidentTitle).toBe("Elevated error rates");
    expect(note.incidentUrl).toBe("https://example.com/incidents/i1");
  });

  it("preserves a per-provider etag across steps and stamps updatedAt", () => {
    const seeded: StateFile = {
      providers: {
        a: {
          alertState: "operational",
          triggeringStatus: null,
          pendingStatus: null,
          consecutiveCount: 0,
          lastTransitionAt: NOW,
          etag: '"abc"',
        },
      },
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const { state } = stepAlerts(seeded, [snap("operational")], "2026-06-25T13:00:00.000Z");
    expect(state.providers["a"]!.etag).toBe('"abc"');
    expect(state.updatedAt).toBe("2026-06-25T13:00:00.000Z");
  });
});

describe("stepAlerts state hygiene", () => {
  it("prunes providers no longer present in the snapshots (config removal)", () => {
    // 'gone' was configured before and is mid-alert; 'a' is the only provider now.
    const seeded: StateFile = {
      providers: {
        a: defaultState(),
        gone: { ...defaultState(), alertState: "alerting", triggeringStatus: "major_outage" },
      },
      updatedAt: NOW,
    };
    const { state } = stepAlerts(seeded, [snap("operational")], NOW);
    expect(Object.keys(state.providers)).toEqual(["a"]);
    expect(state.providers["gone"]).toBeUndefined();
  });
});

function defaultState() {
  return {
    alertState: "operational" as const,
    triggeringStatus: null,
    pendingStatus: null,
    consecutiveCount: 0,
    lastTransitionAt: NOW,
    etag: null,
  };
}
