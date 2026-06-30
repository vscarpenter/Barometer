import { el } from "./dom.js";

/** Which page is showing the footer, so the matching nav link reads "you are here". */
export type FooterPage = "home" | "about" | "landing";

const PAGES: { page: FooterPage; href: string; label: string }[] = [
  { page: "home", href: "/", label: "Home" },
  { page: "landing", href: "/landing.html", label: "Overview" },
  { page: "about", href: "/about.html", label: "About" },
];

/**
 * The site footer — shared chrome on every page so it stays identical (the same
 * pattern as the theme toggle). Two groups: navigation (Home · Overview · About)
 * and build metadata (version · build time in Central time · author). The link
 * for the current page is marked aria-current and styled as settled rather than active.
 *
 * Build constants (__APP_VERSION__, __BUILD_TIME__) are baked in by Vite at build
 * time (see vite.config.ts), so the footer shows what's running with no fetch.
 */
export function buildFooter(current: FooterPage): HTMLElement {
  const footer = el("footer", "footer");

  const nav = el("nav", "footer__nav");
  nav.setAttribute("aria-label", "Footer");
  for (const { page, href, label } of PAGES) {
    const link = el("a", "footer__link");
    link.href = href;
    link.textContent = label;
    if (page === current) {
      link.classList.add("footer__link--current");
      link.setAttribute("aria-current", "page");
    }
    nav.appendChild(link);
  }

  const version = el("span", "footer__version");
  version.textContent = `v${__APP_VERSION__}`;

  // <time> so the build instant is machine-readable (the raw ISO) while the
  // visible text is the human Central-time reading. Falls back gracefully if the
  // stamp is ever unparseable (formatBuildTime returns the raw string).
  const built = el("time", "footer__time");
  built.setAttribute("datetime", __BUILD_TIME__);
  built.textContent = `Built ${formatBuildTime(__BUILD_TIME__)}`;

  const credit = el("a", "footer__credit");
  credit.href = "https://vinny.dev/";
  credit.textContent = "vinny.dev";
  credit.target = "_blank";
  credit.rel = "noopener noreferrer";

  const meta = el("p", "footer__meta");
  meta.append(version, footerSep(), built, footerSep(), credit);

  footer.append(nav, meta);
  return footer;
}

/** Decorative "·" between metadata items; hidden from the accessibility tree. */
function footerSep(): HTMLElement {
  const dot = el("span", "footer__sep");
  dot.textContent = "·";
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

/**
 * Build timestamp → e.g. "Jan 15, 2026, 2:15 PM CST" / "Jun 26, 2026, 3:15 PM CDT".
 * Rendered in America/Chicago with the real zone abbreviation, so it's honest
 * across daylight saving instead of hard-coding "CST" year-round. dateStyle /
 * timeStyle can't be combined with timeZoneName, so explicit components are used.
 * Falls back to the raw ISO string if it can't be parsed (fail safe, like the
 * rest of the app).
 */
export function formatBuildTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(date);
}
