import {
  maxImpact,
  type ProviderSnapshot,
  type IncidentsFile,
  type IncidentRecord,
} from "@barometer/types";

/**
 * Incident archive lifecycle (v2). Pure + deterministic (time passed in), like
 * history.ts. Folds this run's active incidents against the persisted archive:
 * open new ones, refresh ongoing ones (peak impact, latest title/url/regions),
 * resolve ones that left the active set, and keep already-resolved ones until
 * they age past the bound. The file is served to the browser, so it's capped:
 * all ongoing incidents + the most recent `cap` resolved.
 */

const DEFAULT_CAP = 200;

interface ActiveEntry {
  providerId: string;
  providerName: string;
  title: string;
  impact: IncidentRecord["impact"];
  url: string;
  regions?: string[];
}

export function updateIncidents(
  prev: IncidentsFile,
  snapshots: ProviderSnapshot[],
  nowIso: string,
  cap: number = DEFAULT_CAP,
): IncidentsFile {
  const active = new Map<string, ActiveEntry>();
  for (const snap of snapshots) {
    for (const inc of snap.activeIncidents) {
      active.set(`${snap.id}:${inc.id}`, {
        providerId: snap.id,
        providerName: snap.displayName,
        title: inc.title,
        impact: inc.impact,
        url: inc.url,
        ...(inc.regions ? { regions: inc.regions } : {}),
      });
    }
  }

  const prevKeys = new Set(prev.incidents.map((r) => r.key));
  const updated: IncidentRecord[] = [];

  for (const rec of prev.incidents) {
    const cur = active.get(rec.key);
    if (cur) {
      // Still active (or a resolved record's id flapped back) — refresh + reopen.
      updated.push({
        ...rec,
        title: cur.title,
        url: cur.url,
        impact: maxImpact(rec.impact, cur.impact),
        ...(cur.regions ? { regions: cur.regions } : rec.regions ? { regions: rec.regions } : {}),
        lastSeen: nowIso,
        resolvedAt: null,
      });
    } else if (rec.resolvedAt === null) {
      updated.push({ ...rec, resolvedAt: nowIso }); // just resolved this run
    } else {
      updated.push(rec); // already resolved
    }
  }

  for (const [key, cur] of active) {
    if (prevKeys.has(key)) continue; // handled in the loop above
    updated.push({
      key,
      providerId: cur.providerId,
      providerName: cur.providerName,
      title: cur.title,
      impact: cur.impact,
      url: cur.url,
      ...(cur.regions ? { regions: cur.regions } : {}),
      firstSeen: nowIso,
      lastSeen: nowIso,
      resolvedAt: null,
    });
  }

  const ongoing = updated.filter((r) => r.resolvedAt === null);
  const resolved = updated
    .filter((r) => r.resolvedAt !== null)
    .sort((a, b) => (a.resolvedAt! < b.resolvedAt! ? 1 : -1)) // newest resolved first
    .slice(0, cap);

  return { incidents: [...ongoing, ...resolved] };
}
