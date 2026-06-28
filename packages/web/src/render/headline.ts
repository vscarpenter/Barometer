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
  // Inline hints for first-timers (the About page has the full explanation).
  weather.title = "The overall reading on a barometer scale: Stormy, Unsettled, Changeable, Fair (worst to best).";
  // US-scope tag on the verdict: the reading only counts US-relevant incidents.
  // A neutral context chip — never tinted by --c — so it stays calm and never
  // competes with the live status color. Static (status-independent); the full
  // rule lives on the About page, surfaced here via the same title-hint convention.
  const scope = el("span", "reading__scope");
  scope.textContent = "US scope";
  scope.title =
    "This reading is scoped to the US: only incidents affecting the United States count toward it. " +
    "A provider's purely non-US incident stays visible on its tile but never moves the overall reading.";
  top.append(icon, weather, scope);
  const sub = el("p", "reading__sub");
  text.append(top, sub);

  // Gauge group (right on wide screens, below when stacked): the live dial and
  // its Stormy→Fair scale, sized together so they stay aligned.
  const gauge = el("div", "reading__gauge");
  gauge.title = "The needle swings from Stormy (a major outage) toward Fair (every provider operational).";
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
