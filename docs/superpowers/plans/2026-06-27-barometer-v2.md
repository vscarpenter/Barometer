# Plan: Barometer v2 implementation

Spec: [`../specs/2026-06-27-barometer-v2-design.md`](../specs/2026-06-27-barometer-v2-design.md).
TDD throughout; commit after each numbered step. Order chosen so each step is independently
green (`bun run test && bun run typecheck`).

## Theme A — Signal honesty

1. **Region extraction** (`types`): `extractRegions(text)` + tests. Wire into
   `statuspage.ts` and `azure.ts` (attach `regions`, filter status by `regionsAreUsRelevant`,
   fail-open). Extend their tests. *Commit.*
2. **Probe adapter** (`engine`): config `type:"probe"` + `probe` object in
   `adapters/types.ts`; `adapters/probe.ts`; factory case; tests
   (reachable/slow/4xx/5xx/timeout). Add `cloudflare-dns` + `google-dns` to `PROVIDERS`. *Commit.*
3. **Probe fallback** (`engine`): config `healthProbe`; `adapters/probeFallback.ts`
   decorator; factory wraps configs with `healthProbe`; tests
   (unknown+down→major_outage, unknown+up→unknown, non-unknown→passthrough). Add
   `healthProbe` to a few status-page providers. *Commit.*

## Theme B — Incident archive

4. **Incident records** (`types`): `IncidentRecordSchema` + `IncidentsFileSchema` + exports
   + tests.
5. **Engine module** (`engine`): `incidents.ts` `updateIncidents` (open/update/resolve/bound,
   impact-max) + tests.
6. **Wire** (`engine`): `run.ts` loads/updates/writes `history/incidents.json` under
   `historyMode`; run test asserts the write. *Commit.*

## Theme C — Visuals

7. **Worst-first + offenders** (`web`): sort in `main.ts`; offenders in `headline.ts`;
   tests. *Commit.*
8. **Live dial** (`web`): `render/dial.ts` + `needleAngleFor` + tests; swap into
   `headline.ts`; CSS sweep + reduced-motion; masthead mark reuses the angle. *Commit.*
9. **90-day bars** (`web`): rollups poller in `main.ts`; `render/uptimeBar.ts` + tests. *Commit.*
10. **Drill-down dialog** (`web`): `render/dialog.ts`; cards open it; incidents poller;
    archive resolved incidents; uptime bar; a11y + URL allowlist; tests. *Commit.*

## Close-out

11. `bun run test && bun run typecheck && bun run dryrun`. Update `README.md` (providers,
    archive, dial) + `CLAUDE.md`/`AGENTS.md` (decisions, move future-work items). Final commit.
