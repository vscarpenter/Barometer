import { describe, it, expect, vi } from "vitest";
import {
  CurrentFileSchema,
  SummaryFileSchema,
  StateFileSchema,
  RecentFileSchema,
  RollupsFileSchema,
  type ProviderSnapshot,
} from "@barometer/types";
import { runOnce, type RunDeps } from "../src/run.js";
import { MemoryStore } from "../src/store/memory.js";
import { ConsoleNotifier } from "../src/alerting/notifier.js";
import type { ProviderAdapter } from "../src/adapters/types.js";

const NOW = new Date("2026-06-25T12:00:00.000Z");

const okAdapter = (id: string, status: ProviderSnapshot["status"]): ProviderAdapter => ({
  id,
  fetchSnapshot: async () => ({
    id,
    displayName: id.toUpperCase(),
    status,
    activeIncidents:
      status === "operational"
        ? []
        : [{ id: "i", title: "down", impact: "major", status: "investigating", startedAt: NOW.toISOString(), url: "https://x" }],
    checkedAt: NOW.toISOString(),
    sourceUrl: `https://${id}`,
  }),
});

const throwingAdapter = (id: string): ProviderAdapter => ({
  id,
  fetchSnapshot: async () => {
    throw new Error("adapter contract violated");
  },
});

function baseDeps(adapters: ProviderAdapter[], store = new MemoryStore()): RunDeps {
  return { adapters, store, notifier: new ConsoleNotifier(), now: () => NOW };
}

describe("runOnce", () => {
  it("writes all five data files and survives a throwing adapter", async () => {
    const store = new MemoryStore();
    const summary = await runOnce(baseDeps([okAdapter("good", "operational"), throwingAdapter("bad")], store));

    expect(summary.overall.providersTotal).toBe(2);
    expect(summary.providers.find((p) => p.id === "bad")!.status).toBe("unknown");

    // every data file persisted and is schema-valid
    expect((await store.readJson("status/current.json", CurrentFileSchema, null as never)).providers).toHaveLength(2);
    expect(await store.readJson("status/summary.json", SummaryFileSchema, null as never)).toBeTruthy();
    expect((await store.readJson("history/recent.json", RecentFileSchema, null as never)).samples).toHaveLength(1);
    expect((await store.readJson("history/rollups.json", RollupsFileSchema, null as never)).days).toHaveLength(1);
    expect(await store.readJson("status/state.json", StateFileSchema, null as never)).toBeTruthy();
  });

  it("fetches every adapter even when there are more adapters than the concurrency cap", async () => {
    // Guards the work-stealing drain: with a low cap the queue must spill into
    // later waves, never dropping an adapter. This is what lets the cap be a
    // pure latency knob (default fetches the 9 providers in one wave).
    const adapters = Array.from({ length: 7 }, (_, i) => okAdapter(`p${i}`, "operational"));
    const store = new MemoryStore();
    const summary = await runOnce({ ...baseDeps(adapters, store), concurrency: 3 });

    expect(summary.overall.providersTotal).toBe(7);
    expect(new Set(summary.providers.map((p) => p.id)).size).toBe(7);
    expect(summary.providers.every((p) => p.status === "operational")).toBe(true);
  });

  it("fires an alert through the notifier on a sustained outage (debounced)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const store = new MemoryStore();
    const notifier = new ConsoleNotifier();
    const deps: RunDeps = { adapters: [okAdapter("a", "major_outage")], store, notifier, now: () => NOW };

    await runOnce(deps); // run 1: down count = 1, no alert
    expect(notifier.sent).toHaveLength(0);

    await runOnce(deps); // run 2: down count = 2, outage fires
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]!.kind).toBe("outage");
    expect(notifier.sent[0]!.incidentTitle).toBe("down");
    spy.mockRestore();
  });
});
