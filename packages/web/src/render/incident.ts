import { el } from "./dom.js";
import { isSafeHttpUrl } from "./url.js";

/**
 * An incident title that links to the upstream status page when the url is a
 * safe http(s) url, and falls back to plain text otherwise. Incident urls come
 * from third-party status feeds; a hostile/compromised feed could inject
 * `javascript:`/`data:`, so we allowlist at this render sink. Shared by the card
 * tile (non-interactive variant) and the drill-down dialog.
 */
export function incidentTitle(title: string, url: string): HTMLElement {
  if (isSafeHttpUrl(url)) {
    const link = el("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = title;
    return link;
  }
  const span = el("span");
  span.textContent = title;
  return span;
}

/** The affected-regions tag, annotated when the incident is outside the US reading. */
export function regionTag(regions: string[] | undefined, counted: boolean): HTMLElement | null {
  if (!regions || regions.length === 0) return null;
  const tag = el("span", "card__regions");
  tag.textContent = counted ? regions.join(", ") : `${regions.join(", ")} — outside US, not counted`;
  // Inline hint: the "not counted" wording is cryptic without the region rule.
  tag.title = counted
    ? "Regions reported affected by this incident."
    : "Outside the US region this reading tracks, so it doesn't change the overall reading.";
  return tag;
}
