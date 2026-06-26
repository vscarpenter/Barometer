import type { OverallReading, ProviderStatus } from "@barometer/types";
import { el, svgEl } from "./dom.js";
import { statusLabel } from "./status.js";

// Needle angle on the barometer dial: fair (operational) swings right toward
// "high pressure", stormy swings left. Decorative — the label conveys meaning.
const NEEDLE_ANGLE: Record<ProviderStatus, number> = {
  operational: 60,
  maintenance: 0,
  unknown: 0,
  degraded: 18,
  partial_outage: -22,
  major_outage: -60,
};

function renderGauge(status: ProviderStatus): SVGElement {
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", "0 0 100 88");
  svg.classList.add("reading__gauge");
  svg.setAttribute("aria-hidden", "true");

  const track = svgEl("path");
  track.setAttribute("d", "M14 64 A40 40 0 0 1 86 64");
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "var(--border)");
  track.setAttribute("stroke-width", "7");
  track.setAttribute("stroke-linecap", "round");

  const arc = svgEl("path");
  arc.setAttribute("d", "M14 64 A40 40 0 0 1 86 64");
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", "currentColor");
  arc.setAttribute("stroke-width", "7");
  arc.setAttribute("stroke-linecap", "round");
  arc.setAttribute("stroke-dasharray", "1.6 5");
  arc.setAttribute("opacity", "0.55");

  const needle = svgEl("g");
  needle.setAttribute("transform", `rotate(${NEEDLE_ANGLE[status]} 50 64)`);
  const line = svgEl("line");
  line.setAttribute("x1", "50");
  line.setAttribute("y1", "64");
  line.setAttribute("x2", "50");
  line.setAttribute("y2", "30");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "4");
  line.setAttribute("stroke-linecap", "round");
  needle.appendChild(line);

  const hub = svgEl("circle");
  hub.setAttribute("cx", "50");
  hub.setAttribute("cy", "64");
  hub.setAttribute("r", "5");
  hub.setAttribute("fill", "currentColor");

  svg.append(track, arc, needle, hub);
  return svg;
}

/** The prominent barometer reading band (SPEC §8). */
export function renderHeadline(overall: OverallReading): HTMLElement {
  const section = el("section", "reading");
  section.setAttribute("data-status", overall.status);
  section.setAttribute("aria-label", `Overall internet health: ${statusLabel(overall.status)}`);
  section.style.setProperty("--c", `var(--status-${overall.status})`);

  const body = el("div");
  const label = el("h2", "reading__label");
  label.textContent = overall.label;

  const sub = el("p", "reading__sub");
  const count = el("span", "reading__count");
  count.textContent = `${overall.providersOperational} of ${overall.providersTotal}`;
  sub.append(count, document.createTextNode(` providers operational · ${statusLabel(overall.status)}`));

  body.append(label, sub);
  section.append(renderGauge(overall.status), body);
  return section;
}
