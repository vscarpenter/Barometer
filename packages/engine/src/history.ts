import {
  classify,
  type ProviderSnapshot,
  type RecentFile,
  type RecentSample,
  type RollupsFile,
  type DayBucket,
} from "@barometer/types";

/**
 * Tiered history math (SPEC §7). All functions are pure and take time as input
 * (nowMs / date) so they are deterministic and testable. recent.json holds 48h
 * of 5-min samples (the 24h sparkline + window); rollups.json holds daily
 * up/down counts (the 7/30/90d windows). The availability rule (classify) is
 * the single source of up/down/excluded.
 */

const MS_PER_HOUR = 3_600_000;

/** Append a sample and drop entries older than retentionHours. Does not mutate input. */
export function appendRecent(
  recent: RecentFile,
  sample: RecentSample,
  nowMs: number,
  retentionHours: number,
): RecentFile {
  const cutoff = nowMs - retentionHours * MS_PER_HOUR;
  const kept = recent.samples.filter((s) => Date.parse(s.t) >= cutoff);
  return { samples: [...kept, sample] };
}

/** Fold this run's snapshots into today's bucket; cap to retentionDays. Does not mutate input. */
export function updateRollups(
  rollups: RollupsFile,
  snapshots: ProviderSnapshot[],
  date: string,
  retentionDays: number,
): RollupsFile {
  const days: DayBucket[] = rollups.days.map((d) => ({ date: d.date, providers: { ...d.providers } }));

  let index = days.findIndex((d) => d.date === date);
  if (index === -1) {
    days.push({ date, providers: {} });
    index = days.length - 1;
  }

  const providers = { ...days[index]!.providers };
  for (const snap of snapshots) {
    const cls = classify(snap.status);
    if (cls === "excluded") continue; // maintenance/unknown never enter the denominator
    const prev = providers[snap.id] ?? { up: 0, down: 0 };
    providers[snap.id] =
      cls === "up" ? { up: prev.up + 1, down: prev.down } : { up: prev.up, down: prev.down + 1 };
  }
  days[index] = { date, providers };

  return { days: days.slice(-retentionDays) };
}

/** Uptime % for a provider over the last windowHours of recent samples; null if no data. */
export function uptimeFromRecent(
  recent: RecentFile,
  providerId: string,
  nowMs: number,
  windowHours: number,
): number | null {
  const cutoff = nowMs - windowHours * MS_PER_HOUR;
  let up = 0;
  let down = 0;
  for (const sample of recent.samples) {
    if (Date.parse(sample.t) < cutoff) continue;
    const status = sample.s[providerId];
    if (!status) continue;
    const cls = classify(status);
    if (cls === "up") up++;
    else if (cls === "down") down++;
  }
  return uptimePercent(up, down);
}

/**
 * Uptime % for a provider over the last windowDays daily buckets.
 *
 * Returns null when the history can't yet back the labeled span — i.e. fewer
 * than windowDays daily buckets exist. A "90d" figure computed from one day of
 * data would read as "down for 90 days" during an early outage (the honest-
 * instrument rule: never claim a span you haven't measured). Windows fill in as
 * history accumulates. Also null when the provider has no counted samples.
 */
export function uptimeFromRollups(
  rollups: RollupsFile,
  providerId: string,
  windowDays: number,
): number | null {
  if (rollups.days.length < windowDays) return null;
  let up = 0;
  let down = 0;
  for (const day of rollups.days.slice(-windowDays)) {
    const counts = day.providers[providerId];
    if (counts) {
      up += counts.up;
      down += counts.down;
    }
  }
  return uptimePercent(up, down);
}

function uptimePercent(up: number, down: number): number | null {
  const total = up + down;
  return total === 0 ? null : (up / total) * 100;
}
