import {
  buildOverallReading,
  CurrentFileSchema,
  StateFileSchema,
  RecentFileSchema,
  RollupsFileSchema,
  IncidentsFileSchema,
  type ProviderSnapshot,
  type RecentFile,
  type RollupsFile,
  type IncidentsFile,
  type SummaryFile,
  type StateFile,
} from "@barometer/types";
import type { ProviderAdapter } from "./adapters/types.js";
import type { Store } from "./store/types.js";
import type { Notifier } from "./alerting/notifier.js";
import { appendRecent, updateRollups } from "./history.js";
import { updateIncidents } from "./incidents.js";
import { buildSummary } from "./summary.js";
import { stepAlerts, type Notification } from "./alerting/machine.js";

const KEYS = {
  current: "status/current.json",
  summary: "status/summary.json",
  state: "status/state.json",
  recent: "history/recent.json",
  rollups: "history/rollups.json",
  incidents: "history/incidents.json",
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
  historyMode?: "persist" | "current-only";
}

/**
 * One engine run (SPEC §7). The engine is stateless: it reads prior state and
 * history from the store, mutates them in memory, and writes them back. One
 * provider failing never fails the run — adapters degrade to "unknown" and a
 * contract-violating throw is caught here as a safety net.
 */
export async function runOnce(deps: RunDeps): Promise<SummaryFile> {
  const context = buildRunContext(deps);
  const inputs = await loadRunInputs(context.store, context.nowIso);
  const { snapshots, etags } = await fetchAllSnapshots(
    context.adapters,
    context.concurrency,
    context.nowIso,
    inputs.prevState,
    inputs.previousSnapshots,
  );

  await writeCurrent(context.store, snapshots, context.nowIso);
  const history = updateHistoryForMode(inputs, snapshots, context);
  await writeHistory(context.store, history);

  const summary = buildSummary(snapshots, history.recent, history.rollups, context.nowMs, context.nowIso);
  await context.store.writeJson(KEYS.summary, summary, SHORT_CACHE);

  const { state, notifications } = stepAlerts(inputs.prevState, snapshots, context.nowIso);
  mergeEtagsIntoState(state, etags);
  await sendNotifications(context.notifier, notifications);
  await context.store.writeJson(KEYS.state, state, SHORT_CACHE);

  return summary;
}

interface RunContext {
  store: Store;
  notifier: Notifier;
  adapters: ProviderAdapter[];
  concurrency: number;
  retentionHours: number;
  retentionDays: number;
  historyMode: NonNullable<RunDeps["historyMode"]>;
  nowIso: string;
  nowMs: number;
  date: string;
}

function buildRunContext(deps: RunDeps): RunContext {
  const now = deps.now();
  const nowIso = now.toISOString();
  return {
    store: deps.store,
    notifier: deps.notifier,
    adapters: deps.adapters,
    concurrency: deps.concurrency ?? 10,
    retentionHours: deps.retentionHours ?? 48,
    retentionDays: deps.retentionDays ?? 90,
    historyMode: deps.historyMode ?? "persist",
    nowIso,
    nowMs: now.getTime(),
    date: nowIso.slice(0, 10),
  };
}

interface RunInputs {
  prevState: StateFile;
  prevRecent: RecentFile;
  prevRollups: RollupsFile;
  prevIncidents: IncidentsFile;
  previousSnapshots: Map<string, ProviderSnapshot>;
}

async function loadRunInputs(store: Store, nowIso: string): Promise<RunInputs> {
  const [prevState, prevRecent, prevRollups, prevIncidents, prevCurrent] = await Promise.all([
    store.readJson(KEYS.state, StateFileSchema, { providers: {}, updatedAt: nowIso } as StateFile),
    store.readJson(KEYS.recent, RecentFileSchema, { samples: [] }),
    store.readJson(KEYS.rollups, RollupsFileSchema, { days: [] }),
    store.readJson(KEYS.incidents, IncidentsFileSchema, { incidents: [] }),
    store.readJson(KEYS.current, CurrentFileSchema.nullable(), null),
  ]);
  return {
    prevState,
    prevRecent,
    prevRollups,
    prevIncidents,
    previousSnapshots: new Map((prevCurrent?.providers ?? []).map((snapshot) => [snapshot.id, snapshot])),
  };
}

interface HistoryUpdate {
  recent: RecentFile;
  rollups: RollupsFile;
  incidents: IncidentsFile;
  shouldWrite: boolean;
}

function updateHistoryForMode(
  inputs: RunInputs,
  snapshots: ProviderSnapshot[],
  context: RunContext,
): HistoryUpdate {
  if (context.historyMode === "current-only") {
    return {
      recent: inputs.prevRecent,
      rollups: inputs.prevRollups,
      incidents: inputs.prevIncidents,
      shouldWrite: false,
    };
  }

  return {
    recent: appendRecent(
      inputs.prevRecent,
      { t: context.nowIso, s: Object.fromEntries(snapshots.map((s) => [s.id, s.status])) },
      context.nowMs,
      context.retentionHours,
    ),
    rollups: updateRollups(inputs.prevRollups, snapshots, context.date, context.retentionDays),
    incidents: updateIncidents(inputs.prevIncidents, snapshots, context.nowIso),
    shouldWrite: true,
  };
}

async function writeCurrent(store: Store, snapshots: ProviderSnapshot[], nowIso: string): Promise<void> {
  const overall = buildOverallReading(snapshots, nowIso);
  await store.writeJson(KEYS.current, { generatedAt: nowIso, overall, providers: snapshots }, SHORT_CACHE);
}

async function writeHistory(store: Store, history: HistoryUpdate): Promise<void> {
  if (!history.shouldWrite) return;
  await store.writeJson(KEYS.recent, history.recent, SHORT_CACHE);
  await store.writeJson(KEYS.rollups, history.rollups, SHORT_CACHE);
  await store.writeJson(KEYS.incidents, history.incidents, SHORT_CACHE);
}

function mergeEtagsIntoState(state: StateFile, etags: Record<string, string | null>): void {
  for (const [providerId, etag] of Object.entries(etags)) {
    const provider = state.providers[providerId];
    if (provider) provider.etag = etag;
  }
}

async function sendNotifications(notifier: Notifier, notifications: Notification[]): Promise<void> {
  for (const note of notifications) await notifier.send(note);
}

/** Fetch every adapter with a concurrency cap; a thrown adapter degrades to "unknown". */
async function fetchAllSnapshots(
  adapters: ProviderAdapter[],
  cap: number,
  nowIso: string,
  prevState: StateFile,
  previousSnapshots: Map<string, ProviderSnapshot>,
): Promise<{ snapshots: ProviderSnapshot[]; etags: Record<string, string | null> }> {
  const results: ProviderSnapshot[] = new Array(adapters.length);
  const etags: Record<string, string | null> = {};
  let next = 0;

  async function worker(): Promise<void> {
    while (next < adapters.length) {
      const index = next++;
      const adapter = adapters[index]!;
      try {
        results[index] = await adapter.fetchSnapshot({
          etag: prevState.providers[adapter.id]?.etag ?? null,
          previousSnapshot: previousSnapshots.get(adapter.id) ?? null,
          recordEtag: (etag) => {
            etags[adapter.id] = etag;
          },
        });
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
  return { snapshots: results, etags };
}
