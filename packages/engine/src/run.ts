import {
  buildOverallReading,
  StateFileSchema,
  RecentFileSchema,
  RollupsFileSchema,
  type ProviderSnapshot,
  type SummaryFile,
  type StateFile,
} from "@barometer/types";
import type { ProviderAdapter } from "./adapters/types.js";
import type { Store } from "./store/types.js";
import type { Notifier } from "./alerting/notifier.js";
import { appendRecent, updateRollups } from "./history.js";
import { buildSummary } from "./summary.js";
import { stepAlerts } from "./alerting/machine.js";

const KEYS = {
  current: "status/current.json",
  summary: "status/summary.json",
  state: "status/state.json",
  recent: "history/recent.json",
  rollups: "history/rollups.json",
} as const;

const SHORT_CACHE = "max-age=60";

export interface RunDeps {
  adapters: ProviderAdapter[];
  store: Store;
  notifier: Notifier;
  now: () => Date;
  concurrency?: number;
  retentionHours?: number;
  retentionDays?: number;
}

/**
 * One engine run (SPEC §7). The engine is stateless: it reads prior state and
 * history from the store, mutates them in memory, and writes them back. One
 * provider failing never fails the run — adapters degrade to "unknown" and a
 * contract-violating throw is caught here as a safety net.
 */
export async function runOnce(deps: RunDeps): Promise<SummaryFile> {
  const {
    store,
    notifier,
    // Default fetches the 9 providers in a single wave. They are independent
    // hosts with no shared rate limit, so capping lower only adds tail latency;
    // the cap exists to bound fan-out if the provider list ever grows large.
    adapters,
    concurrency = 10,
    retentionHours = 48,
    retentionDays = 90,
  } = deps;
  const now = deps.now();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const date = nowIso.slice(0, 10); // YYYY-MM-DD (UTC)

  // 1. Read prior state + history (fallbacks make the first run work).
  const [prevState, prevRecent, prevRollups] = await Promise.all([
    store.readJson(KEYS.state, StateFileSchema, { providers: {}, updatedAt: nowIso } as StateFile),
    store.readJson(KEYS.recent, RecentFileSchema, { samples: [] }),
    store.readJson(KEYS.rollups, RollupsFileSchema, { days: [] }),
  ]);

  // 2. Fetch all snapshots concurrently (capped).
  const snapshots = await fetchAllSnapshots(adapters, concurrency, nowIso);

  // 3. Current snapshot.
  const overall = buildOverallReading(snapshots, nowIso);
  await store.writeJson(KEYS.current, { generatedAt: nowIso, overall, providers: snapshots }, SHORT_CACHE);

  // 4. History tiers.
  const recent = appendRecent(
    prevRecent,
    { t: nowIso, s: Object.fromEntries(snapshots.map((s) => [s.id, s.status])) },
    nowMs,
    retentionHours,
  );
  const rollups = updateRollups(prevRollups, snapshots, date, retentionDays);
  await store.writeJson(KEYS.recent, recent, SHORT_CACHE);
  await store.writeJson(KEYS.rollups, rollups, SHORT_CACHE);

  // 5. Summary (uptime windows + overall).
  const summary = buildSummary(snapshots, recent, rollups, nowMs, nowIso);
  await store.writeJson(KEYS.summary, summary, SHORT_CACHE);

  // 6. Alerts (transitions only).
  const { state, notifications } = stepAlerts(prevState, snapshots, nowIso);
  for (const note of notifications) await notifier.send(note);
  await store.writeJson(KEYS.state, state, SHORT_CACHE);

  return summary;
}

/** Fetch every adapter with a concurrency cap; a thrown adapter degrades to "unknown". */
async function fetchAllSnapshots(
  adapters: ProviderAdapter[],
  cap: number,
  nowIso: string,
): Promise<ProviderSnapshot[]> {
  const results: ProviderSnapshot[] = new Array(adapters.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < adapters.length) {
      const index = next++;
      const adapter = adapters[index]!;
      try {
        results[index] = await adapter.fetchSnapshot();
      } catch {
        results[index] = {
          id: adapter.id,
          displayName: adapter.id,
          status: "unknown",
          activeIncidents: [],
          checkedAt: nowIso,
          sourceUrl: "",
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(cap, adapters.length) }, worker));
  return results;
}
