import type { ProviderStatus } from "@barometer/types";
import { svgEl } from "./dom.js";

// Bar height encodes severity (a calm baseline that "spikes" during outages —
// the barometric-pressure metaphor); color encodes status.
const HEIGHT: Record<ProviderStatus, number> = {
  operational: 0.2,
  maintenance: 0.36,
  unknown: 0.3,
  degraded: 0.55,
  partial_outage: 0.78,
  major_outage: 1,
};

/** Informative sparkline of recent status (role=img + title). One bar per check. */
export function renderSparkline(statuses: ProviderStatus[]): SVGElement {
  const n = statuses.length;
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", `0 0 ${Math.max(n, 1)} 1`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.classList.add("card__spark");

  const title = svgEl("title");
  title.textContent = n
    ? `Recent status across the last ${n} checks`
    : "No recent history yet";
  svg.appendChild(title);

  statuses.forEach((status, i) => {
    const h = HEIGHT[status];
    const rect = svgEl("rect");
    rect.setAttribute("x", String(i + 0.2));
    rect.setAttribute("width", "0.6");
    rect.setAttribute("y", String(1 - h));
    rect.setAttribute("height", String(h));
    rect.setAttribute("rx", "0.07");
    rect.style.fill = `var(--status-${status})`;
    svg.appendChild(rect);
  });

  return svg;
}
