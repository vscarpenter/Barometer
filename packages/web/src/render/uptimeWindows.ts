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

/** The 24h/7d/30d/90d uptime <dl>. One definition, used by card + dialog. */
export function renderUptimeWindows(uptime: UptimeWindows, extraClass?: string): HTMLElement {
  const dl = el("dl", extraClass ? `card__uptime ${extraClass}` : "card__uptime");
  for (const window of WINDOWS) {
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
