import type { OverallReading, SummaryProvider } from "@barometer/types";
import { el } from "./dom.js";
import { statusLabel, makeStatusIcon } from "./status.js";
import { renderDial, updateDial } from "./dial.js";

const MAX_OFFENDERS = 3;

type Offender = Pick<SummaryProvider, "displayName" | "status">;

/** "GitHub major outage, GCP degraded" (+N more) — names what's wrong, clamped. */
function offendersText(offenders: Offender[]): string | null {
  if (offenders.length === 0) return null;
  const shown = offenders
    .slice(0, MAX_OFFENDERS)
    .map((p) => `${p.displayName} ${statusLabel(p.status).toLowerCase()}`);
  const extra = offenders.length - shown.length;
  return shown.join(", ") + (extra > 0 ? `, +${extra} more` : "");
}

const SCALE_LABELS = ["Stormy", "Unsettled", "Changeable", "Fair"] as const;

export interface HeadlineComponent {
  element: HTMLElement;
  update(overall: OverallReading, offenders?: Offender[]): void;
}

/**
 * The Almanac reading band: weather word + live barometer dial (SPEC §8/§9).
 * Built once; update() refreshes it IN PLACE — the dial nodes persist so the
 * needle's CSS transition animates the sweep instead of snapping a rebuilt
 * needle into position each poll.
 */
export function createHeadline(): HeadlineComponent {
  const section = el("section", "reading");

  const inner = el("div", "reading__inner");

  // Text group (left on wide screens, top when stacked): weather word, count,
  // and the offenders line that toggles in after the sub.
  const text = el("div", "reading__text");
  const top = el("div", "reading__top");
  const icon = el("span", "reading__icon");
  icon.setAttribute("aria-hidden", "true");
  const weather = el("h2", "reading__weather");
  top.append(icon, weather);
  const sub = el("p", "reading__sub");
  text.append(top, sub);

  // Gauge group (right on wide screens, below when stacked): the live dial and
  // its Stormy→Fair scale, sized together so they stay aligned.
  const gauge = el("div", "reading__gauge");
  const dial = renderDial("unknown"); // persistent; update() swings the needle
  const labels = el("div", "reading__scale-labels");
  for (const t of SCALE_LABELS) {
    const span = el("span");
    span.textContent = t;
    labels.appendChild(span);
  }
  gauge.append(dial, labels);

  inner.append(text, gauge);
  section.appendChild(inner);

  // Toggled in/out between sub and dial as offenders come and go.
  let offendersEl: HTMLElement | null = null;

  function update(overall: OverallReading, offenders: Offender[] = []): void {
    section.setAttribute("data-status", overall.status);
    section.setAttribute("aria-label", `Overall internet health: ${statusLabel(overall.status)}`);
    section.style.setProperty("--c", `var(--status-${overall.status})`);

    icon.replaceChildren(makeStatusIcon(overall.status, 26));
    weather.textContent = overall.label;

    const count = el("span", "reading__count");
    count.textContent = `${overall.providersOperational} of ${overall.providersTotal}`;
    sub.replaceChildren(
      count,
      document.createTextNode(` providers operational · ${statusLabel(overall.status)}`),
    );

    const names = offendersText(offenders);
    if (names) {
      if (!offendersEl) {
        offendersEl = el("p", "reading__offenders");
        sub.after(offendersEl);
      }
      offendersEl.textContent = names;
    } else if (offendersEl) {
      offendersEl.remove();
      offendersEl = null;
    }

    updateDial(dial, overall.status);
  }

  return { element: section, update };
}

/** One-shot reading band — convenience for tests and any non-persistent caller. */
export function renderHeadline(overall: OverallReading, offenders: Offender[] = []): HTMLElement {
  const headline = createHeadline();
  headline.update(overall, offenders);
  return headline.element;
}
