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
 * The persistent stale-data live region (SPEC §8). Created empty at load and
 * kept in the DOM, so when it later gains content a screen reader announces it.
 * A region inserted already-populated is announced unreliably — hence the
 * region owns role=status, and renderStaleBanner below is purely visual.
 */
export function createBannerRegion(): HTMLElement {
  const region = el("div", "banner-region");
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  return region;
}

/** Show the stale warning (stale) or clear it (fresh), in place — same node. */
export function updateBannerRegion(
  region: HTMLElement,
  generatedAt: string,
  nowMs: number,
  stale: boolean,
): void {
  region.replaceChildren(...(stale ? [renderStaleBanner(generatedAt, nowMs)] : []));
}

/**
 * Stale-data guard banner visual (SPEC §8): warning icon + text. The live
 * region is the container (createBannerRegion); this element carries no role.
 */
export function renderStaleBanner(generatedAt: string, nowMs: number): HTMLElement {
  const banner = el("div", "banner");
  banner.appendChild(warningIcon());
  const text = el("span");
  text.textContent = `Data may be stale — last updated ${formatAgo(secondsAgo(generatedAt, nowMs))} ago. The engine may be down.`;
  banner.appendChild(text);
  return banner;
}
