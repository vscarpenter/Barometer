import { el, svgEl } from "./dom.js";
import { secondsAgo, formatAgo } from "../poll.js";

function warningIcon(): SVGElement {
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M10.3 4 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z", "M12 9v4", "M12 17h.01"]) {
    const path = svgEl("path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * Stale-data guard banner (SPEC §8). A polite live region so screen readers are
 * told when the engine may be down instead of silently trusting stale green.
 */
export function renderStaleBanner(generatedAt: string, nowMs: number): HTMLElement {
  const banner = el("div", "banner");
  banner.setAttribute("role", "status");
  banner.appendChild(warningIcon());
  const text = el("span");
  text.textContent = `Data may be stale — last updated ${formatAgo(secondsAgo(generatedAt, nowMs))} ago. The engine may be down.`;
  banner.appendChild(text);
  return banner;
}
