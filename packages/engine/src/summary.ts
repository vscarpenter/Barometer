import {
  buildOverallReading,
  type ProviderSnapshot,
  type RecentFile,
  type RollupsFile,
  type SummaryFile,
} from "@barometer/types";
import { uptimeFromRecent, uptimeFromRollups } from "./history.js";

/**
 * Build summary.json (SPEC §6-7): each provider's current snapshot plus uptime
 * for 24h (from recent samples), 7/30/90d (from daily rollups), and the overall
 * reading. Assumes recent/rollups already include this run (run.ts updates them
 * first).
 */
export function buildSummary(
  snapshots: ProviderSnapshot[],
  recent: RecentFile,
  rollups: RollupsFile,
  nowMs: number,
  generatedAt: string,
): SummaryFile {
  return {
    overall: buildOverallReading(snapshots, generatedAt),
    providers: snapshots.map((snap) => ({
      ...snap,
      uptime: {
        "24h": uptimeFromRecent(recent, snap.id, nowMs, 24),
        "7d": uptimeFromRollups(rollups, snap.id, 7),
        "30d": uptimeFromRollups(rollups, snap.id, 30),
        "90d": uptimeFromRollups(rollups, snap.id, 90),
      },
    })),
    generatedAt,
  };
}
