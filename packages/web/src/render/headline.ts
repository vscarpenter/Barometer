import type { OverallReading, ProviderStatus } from "@barometer/types";
import { el } from "./dom.js";
import { statusLabel, makeStatusIcon } from "./status.js";

// Marker position on the Stormy→Fair pressure scale, as % from the left.
// maintenance/unknown don't worsen the reading (SPEC §4), so they read "fair".
const SCALE_POS: Record<ProviderStatus, number> = {
  major_outage: 8,
  partial_outage: 34,
  degraded: 62,
  operational: 90,
  maintenance: 90,
  unknown: 50,
};

const SCALE_LABELS = ["Stormy", "Unsettled", "Changeable", "Fair"] as const;

/** The Almanac reading band: weather word + Stormy→Fair pressure scale (SPEC §8/§9). */
export function renderHeadline(overall: OverallReading): HTMLElement {
  const section = el("section", "reading");
  section.setAttribute("data-status", overall.status);
  section.setAttribute("aria-label", `Overall internet health: ${statusLabel(overall.status)}`);
  section.style.setProperty("--c", `var(--status-${overall.status})`);

  const inner = el("div", "reading__inner");

  const top = el("div", "reading__top");
  const icon = el("span", "reading__icon");
  icon.setAttribute("aria-hidden", "true");
  icon.appendChild(makeStatusIcon(overall.status, 26));
  const weather = el("h2", "reading__weather");
  weather.textContent = overall.label;
  top.append(icon, weather);

  const sub = el("p", "reading__sub");
  const count = el("span", "reading__count");
  count.textContent = `${overall.providersOperational} of ${overall.providersTotal}`;
  sub.append(count, document.createTextNode(` providers operational · ${statusLabel(overall.status)}`));

  const scale = el("div", "reading__scale");
  scale.appendChild(el("div", "reading__scale-track"));
  const marker = el("div", "reading__marker");
  marker.style.left = `${SCALE_POS[overall.status]}%`;
  scale.appendChild(marker);

  const labels = el("div", "reading__scale-labels");
  for (const t of SCALE_LABELS) {
    const span = el("span");
    span.textContent = t;
    labels.appendChild(span);
  }

  inner.append(top, sub, scale, labels);
  section.appendChild(inner);
  return section;
}
