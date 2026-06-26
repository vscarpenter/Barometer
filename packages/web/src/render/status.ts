import type { ProviderStatus } from "@barometer/types";
import { svgEl } from "./dom.js";

/** Human text label — paired with color + icon so color is never the only signal (SPEC §8). */
const LABELS: Record<ProviderStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

export function statusLabel(status: ProviderStatus): string {
  return LABELS[status];
}

// Stroked 24px icon paths (Lucide-ish), one distinct glyph per status.
const ICONS: Record<ProviderStatus, string[]> = {
  operational: ["M20 6 9 17l-5-5"], // check
  degraded: ["M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 2A4 4 0 0 0 6 19z"], // cloud
  partial_outage: ["M10.3 4 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z", "M12 9v4", "M12 17h.01"], // alert triangle
  major_outage: ["M13 2 4 14h7l-1 8 9-12h-7l1-8z"], // storm bolt
  maintenance: ["M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.7 2.7-2.3-.4-.4-2.3 2.4-2.7z"], // wrench
  unknown: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"], // help
};

/** Decorative status icon (the text label carries the meaning) — colored via currentColor. */
export function makeStatusIcon(status: ProviderStatus, size = 20): SVGElement {
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[status]) {
    const path = svgEl("path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
