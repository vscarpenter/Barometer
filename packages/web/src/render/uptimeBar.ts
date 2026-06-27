import type { RollupsFile } from "@barometer/types";
import { el } from "./dom.js";
import { safePct } from "./uptimeWindows.js";

/**
 * The classic status-page 90-day uptime bar — one cell per day, colored by that
 * day's uptime. v1 computed rollups.json every run but the frontend never
 * fetched it; this finally renders it (in the provider drill-down). Honest about
 * gaps: a day with no counted samples is a distinct "no data" cell, not green.
 */

interface DayCell {
  date: string;
  uptime: number | null; // % or null when the denominator is 0
  up: number;
  total: number; // counted samples (up + down) that day
}

function cellsFor(rollups: RollupsFile, providerId: string, maxDays: number): DayCell[] {
  return rollups.days.slice(-maxDays).map((day) => {
    const counts = day.providers[providerId];
    const up = counts ? counts.up : 0;
    const total = counts ? counts.up + counts.down : 0;
    return { date: day.date, uptime: total === 0 ? null : (up / total) * 100, up, total };
  });
}

/** Status color for a day's uptime (matches the availability palette). */
function cellStatus(uptime: number | null): "nodata" | "operational" | "degraded" | "major_outage" {
  if (uptime === null) return "nodata";
  if (uptime >= 99.5) return "operational";
  if (uptime >= 95) return "degraded";
  return "major_outage";
}

/**
 * Sample-weighted average — sum(up) / sum(up+down), matching the engine's own
 * uptime math. A flat mean of daily percentages would let a sparse 100% day
 * outweigh a busy outage day; weighting keeps the bar's summary consistent with
 * the uptime windows shown right beside it.
 */
function weightedAverage(cells: DayCell[]): number | null {
  const total = cells.reduce((sum, c) => sum + c.total, 0);
  if (total === 0) return null;
  const up = cells.reduce((sum, c) => sum + c.up, 0);
  return (up / total) * 100;
}

export function renderUptimeBar(
  rollups: RollupsFile,
  providerId: string,
  maxDays = 90,
): HTMLElement {
  const measured = cellsFor(rollups, providerId, maxDays);
  const wrap = el("div", "uptimebar");
  wrap.setAttribute("role", "img");

  // The aria-label and average describe the *measured* span, never the padded
  // frame, so the bar can't claim more history than it has.
  const avg = weightedAverage(measured);
  const span = measured.length;
  wrap.setAttribute(
    "aria-label",
    avg === null
      ? "No uptime history yet"
      : `Uptime over the last ${span} day${span === 1 ? "" : "s"}: ${safePct(avg)}% average`,
  );

  const track = el("div", "uptimebar__track");
  if (measured.length === 0) {
    const empty = el("span", "uptimebar__empty");
    empty.textContent = "No history yet";
    wrap.append(track, empty);
    return wrap;
  }

  // Pad to the full maxDays frame with leading "no data" cells. Otherwise a
  // single day of history stretches (flex) to fill the whole bar — one degraded
  // day reads as a solid-red 90-day outage. The padding shows the true frame:
  // mostly unmeasured, with the measured days at the end.
  const padding: DayCell[] = Array.from({ length: Math.max(0, maxDays - measured.length) }, () => ({
    date: "",
    uptime: null,
    up: 0,
    total: 0,
  }));

  for (const cell of [...padding, ...measured]) {
    const node = el("span", "uptimebar__cell");
    const status = cellStatus(cell.uptime);
    node.dataset.status = status;
    node.style.background = status === "nodata" ? "var(--border)" : `var(--status-${status})`;
    node.title =
      cell.uptime === null
        ? cell.date
          ? `${cell.date} — no data`
          : "no data"
        : `${cell.date} — ${safePct(cell.uptime)}% uptime`;
    track.appendChild(node);
  }
  wrap.appendChild(track);
  return wrap;
}
