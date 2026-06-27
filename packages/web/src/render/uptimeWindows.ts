import type { UptimeWindows } from "@barometer/types";
import { el } from "./dom.js";

/**
 * Round to 2 decimals, but never let a sub-100 score round UP to a misleading
 * 100% — a provider that had any downtime must not read as a perfect 100. SPEC
 * honesty rule (no false 100). A genuine 100 (no down samples) stays 100.
 */
export function safePct(value: number): number {
  const rounded = +value.toFixed(2);
  return value < 100 && rounded >= 100 ? 99.99 : rounded;
}

/** "98.5%" / "—" — shared by the card tiles and the drill-down dialog. */
export function formatUptime(value: number | null): string {
  return value === null ? "—" : `${safePct(value)}%`;
}

const WINDOWS = ["24h", "7d", "30d", "90d"] as const;

/**
 * The uptime <dl>, used by card + dialog. Only windows the history can back are
 * shown — a null window (insufficient history for its span) is hidden, not
 * dashed, so a one-day-old deployment never asserts a "90d" figure it hasn't
 * measured. Windows fill in left-to-right as history accumulates.
 */
export function renderUptimeWindows(uptime: UptimeWindows, extraClass?: string): HTMLElement {
  const dl = el("dl", extraClass ? `card__uptime ${extraClass}` : "card__uptime");
  const backed = WINDOWS.filter((window) => uptime[window] !== null);

  if (backed.length === 0) {
    const note = el("span", "card__uptime-empty");
    note.textContent = "No uptime data yet";
    dl.appendChild(note);
    return dl;
  }

  dl.style.gridTemplateColumns = `repeat(${backed.length}, 1fr)`;
  for (const window of backed) {
    const cell = el("div");
    const dt = el("dt");
    dt.textContent = window;
    const dd = el("dd");
    dd.textContent = formatUptime(uptime[window]);
    cell.append(dt, dd);
    dl.appendChild(cell);
  }
  return dl;
}
