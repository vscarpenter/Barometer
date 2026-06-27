// Self-hosted fonts (Vite hashes + bundles these under the immutable /app
// prefix). Self-hosting — not the Google Fonts CDN — because the site's CSP is
// font-src 'self' / style-src 'self', and it keeps the page request-private.
// Only the weights the design actually uses are imported.
import "@fontsource/space-grotesk/600.css"; // display: wordmark, weather word, card names
import "@fontsource/hanken-grotesk/400.css"; // body default
import "@fontsource/hanken-grotesk/500.css"; // toggle, labels
import "@fontsource/hanken-grotesk/600.css"; // counts, status pills
import "@fontsource/jetbrains-mono/500.css"; // uptime figures
import "./styles.css";
import {
  SummaryFileSchema,
  RecentFileSchema,
  RollupsFileSchema,
  IncidentsFileSchema,
  type SummaryFile,
  type RecentFile,
  type RollupsFile,
  type IncidentsFile,
  type ProviderStatus,
} from "@barometer/types";
import { createPoller, isStale, secondsAgo, formatAgo } from "./poll.js";
import { el, svgEl } from "./render/dom.js";
import { createHeadline } from "./render/headline.js";
import { renderCard } from "./render/card.js";
import { createBannerRegion, updateBannerRegion } from "./render/banner.js";
import { sortProvidersBySeverity, offenders } from "./render/order.js";
import { needleAngleFor } from "./render/dial.js";
import { openProviderDialog, resolvedFor } from "./render/dialog.js";

const SUMMARY_URL = "/status/summary.json";
const RECENT_URL = "/history/recent.json";
const ROLLUPS_URL = "/history/rollups.json";
const INCIDENTS_URL = "/history/incidents.json";
const POLL_MS = 60_000;
// The drill-down history feeds (rollups ~64 KB, incidents) change at most ~once
// a day and are only read when a dialog opens — no need to re-pull them every
// 60s like the live status. Hourly keeps a long-lived tab fresh for ~1/60th the
// bandwidth.
const HISTORY_POLL_MS = 3_600_000;
const SPARK_SAMPLES = 40;

let summary: SummaryFile | null = null;
let recent: RecentFile | null = null;
let rollups: RollupsFile | null = null;
let incidents: IncidentsFile | null = null;
let failed = false;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.replaceChildren();

const bannerSlot = createBannerRegion();
const readingSlot = el("div");
const gridSlot = el("div", "grid");
const updatedText = el("span", "");
const statusDot = el("span", "masthead__dot");
statusDot.setAttribute("aria-hidden", "true");

// The masthead mini-dial needle, swung to the live reading (no longer hardcoded).
// Declared BEFORE buildMasthead() runs: buildMasthead assigns it, so the binding
// must be initialized first or the write lands in its Temporal Dead Zone and the
// whole module throws on load (blank page).
let mastheadNeedle: SVGElement | null = null;

app.append(buildMasthead(statusDot, updatedText), bannerSlot, readingSlot, gridSlot, buildFooter());

// The reading band is built once and updated in place each poll so the dial
// needle can animate its sweep (a freshly-built needle would just snap).
const headline = createHeadline();

/** Tint the masthead dot + swing the mini-needle to the overall status. */
function setMastheadStatus(status: ProviderStatus): void {
  statusDot.style.background = `var(--status-${status})`;
  if (mastheadNeedle) mastheadNeedle.style.transform = `rotate(${needleAngleFor(status)}deg)`;
}

function recentFor(id: string): ProviderStatus[] {
  if (!recent) return [];
  return recent.samples
    .slice(-SPARK_SAMPLES)
    .map((sample) => sample.s[id])
    .filter((s): s is ProviderStatus => Boolean(s));
}

function render(): void {
  if (!summary) {
    setMastheadStatus("unknown");
    bannerSlot.replaceChildren();
    gridSlot.replaceChildren();
    readingSlot.replaceChildren(
      stateMessage(failed ? "Couldn't reach the barometer. Retrying…" : "Reading the barometer…"),
    );
    return;
  }

  // Defense-in-depth: data is schema-validated at the poller, but a render bug
  // shouldn't blank the page — fall back to a visible error state.
  try {
    const nowMs = Date.now();
    setMastheadStatus(summary.overall.status);
    updateBannerRegion(bannerSlot, summary.generatedAt, nowMs, isStale(summary.generatedAt, nowMs));
    headline.update(summary.overall, offenders(summary.providers));
    if (headline.element.parentNode !== readingSlot) readingSlot.replaceChildren(headline.element);
    const ordered = sortProvidersBySeverity(summary.providers);
    gridSlot.replaceChildren(
      ...(ordered.length
        ? ordered.map((p) => renderCard(p, recentFor(p.id), openDialogFor))
        : [stateMessage("No providers configured.")]),
    );
    updateAgo();
  } catch (err) {
    console.error("Barometer: render failed", err);
    setMastheadStatus("unknown");
    bannerSlot.replaceChildren();
    gridSlot.replaceChildren();
    readingSlot.replaceChildren(stateMessage("Something went wrong rendering the dashboard."));
  }
}

function openDialogFor(provider: SummaryFile["providers"][number]): void {
  const dialog = openProviderDialog({
    provider,
    rollups,
    resolvedIncidents: resolvedFor(incidents, provider.id),
  });
  // Return focus to the provider's CURRENT card on close — by id, so it still
  // works if a poll re-rendered the grid and replaced the tile that opened it.
  dialog.addEventListener(
    "close",
    () => gridSlot.querySelector<HTMLElement>(`[data-provider="${CSS.escape(provider.id)}"]`)?.focus(),
    { once: true },
  );
}

function updateAgo(): void {
  if (!summary) return;
  updatedText.textContent = `updated ${formatAgo(secondsAgo(summary.generatedAt, Date.now()))} ago`;
}

function stateMessage(text: string): HTMLElement {
  const div = el("div", "state");
  div.textContent = text;
  return div;
}

function buildMasthead(dot: HTMLElement, updated: HTMLElement): HTMLElement {
  const header = el("header", "masthead");

  // Barometer dial: cyan instrument (ring + ticks inherit currentColor ←
  // --brand) with an ember --accent needle swung up-right toward "fair". The
  // needle uses var(--accent) so it re-tints with the theme without a re-render.
  const mark = svgEl("svg");
  mark.classList.add("masthead__mark");
  mark.setAttribute("viewBox", "0 0 24 24");
  mark.setAttribute("fill", "none");
  mark.setAttribute("stroke-linecap", "round");
  mark.setAttribute("stroke-linejoin", "round");
  mark.setAttribute("aria-hidden", "true");

  const ring = svgEl("circle");
  ring.setAttribute("cx", "12");
  ring.setAttribute("cy", "12");
  ring.setAttribute("r", "8.4");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-width", "1.7");
  mark.appendChild(ring);

  for (const d of ["M12 3.2V4.6", "M20.5 12H19.1", "M3.5 12H4.9"]) {
    const tick = svgEl("path");
    tick.setAttribute("d", d);
    tick.setAttribute("stroke", "currentColor");
    tick.setAttribute("stroke-width", "1.4");
    tick.setAttribute("opacity", "0.5");
    mark.appendChild(tick);
  }

  // Needle drawn pointing straight up, rotated to the reading by setMastheadStatus
  // (CSS transition on transform animates the swing; reduced-motion disables it).
  const needle = svgEl("path");
  needle.classList.add("masthead__needle");
  needle.setAttribute("d", "M12 12L12 4.8");
  needle.setAttribute("stroke", "var(--accent)");
  needle.setAttribute("stroke-width", "1.9");
  needle.style.transformOrigin = "12px 12px";
  // Start centered (unknown) — render() swings it to the live reading on first
  // data. Derived from the single angle table so it can't drift from the dial.
  needle.style.transform = `rotate(${needleAngleFor("unknown")}deg)`;
  mark.appendChild(needle);
  mastheadNeedle = needle;

  const hub = svgEl("circle");
  hub.setAttribute("cx", "12");
  hub.setAttribute("cy", "12");
  hub.setAttribute("r", "1.55");
  hub.setAttribute("fill", "currentColor");
  mark.appendChild(hub);

  const titles = el("div", "masthead__titles");
  const h1 = el("h1");
  h1.textContent = "Barometer";
  const tagline = el("p");
  tagline.textContent = "A weather station for the internet";
  titles.append(h1, tagline);

  const right = el("div", "masthead__right");
  const status = el("div", "masthead__status");
  status.append(dot, updated);
  right.append(status, buildThemeToggle());

  header.append(mark, titles, right);
  return header;
}

// ── Theme: light-first, manual toggle, persisted ──────────────────────────
// data-theme is set pre-paint by public/theme-init.js; this code only flips and
// persists it. Every color is a CSS variable, so swapping the attribute restyles
// the whole page instantly — no re-render needed.
const THEME_KEY = "barometer-theme";
type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode / storage disabled: just don't persist */
  }
}

/** Sun (light) / moon (dark) glyph for the toggle — decorative; the label carries meaning. */
function themeGlyph(theme: Theme): SVGElement {
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const paths =
    theme === "dark"
      ? ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"] // moon
      : ["M12 2v2", "M12 20v2", "M2 12h2", "M20 12h2", "M4.9 4.9l1.4 1.4",
         "M17.7 17.7l1.4 1.4", "M19.1 4.9l-1.4 1.4", "M6.3 17.7l-1.4 1.4"]; // sun rays
  if (theme !== "dark") {
    const c = svgEl("circle");
    c.setAttribute("cx", "12");
    c.setAttribute("cy", "12");
    c.setAttribute("r", "4");
    svg.appendChild(c);
  }
  for (const d of paths) {
    const p = svgEl("path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

function buildThemeToggle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "theme-toggle";
  btn.type = "button";
  const label = el("span");
  const sync = (): void => {
    const t = currentTheme();
    btn.setAttribute("aria-label", `Switch to ${t === "dark" ? "light" : "dark"} theme`);
    btn.replaceChildren(themeGlyph(t), label);
    label.textContent = t === "dark" ? "Dark" : "Light";
  };
  btn.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    sync();
  });

  // Until the visitor makes an explicit choice, keep open tabs in sync with the
  // OS theme as it changes (no-op once they've toggled, since that persists).
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let chosen: string | null = null;
    try {
      chosen = localStorage.getItem(THEME_KEY);
    } catch {
      /* ignore */
    }
    if (chosen === "light" || chosen === "dark") return;
    document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    sync();
  });

  sync();
  return btn;
}

function buildFooter(): HTMLElement {
  const footer = el("footer");

  const note = el("p", "footer__note");
  note.textContent =
    "Barometer reads each provider's public status page every 5 minutes. " +
    "Raw status is normalized; weather labels are presentation only.";

  const version = el("span", "footer__version");
  version.textContent = `v${__APP_VERSION__}`;

  const deployed = el("span");
  deployed.textContent = `Deployed ${formatBuildTime(__BUILD_TIME__)}`;

  const credit = el("span");
  credit.append(document.createTextNode("Crafted by "));
  const link = el("a");
  link.href = "https://vinny.dev/";
  link.textContent = "Vinny Carpenter";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  credit.appendChild(link);

  const meta = el("p", "footer__meta");
  meta.append(version, footerSep(), deployed, footerSep(), credit);

  footer.append(note, meta);
  return footer;
}

/** Decorative "·" between footer items; hidden from the accessibility tree. */
function footerSep(): HTMLElement {
  const dot = el("span", "footer__sep");
  dot.textContent = "·";
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

/** Build timestamp → e.g. "Jun 26, 2026, 8:15 PM UTC". Falls back to the raw
 *  ISO string if it can't be parsed (fail safe, like the rest of the app). */
function formatBuildTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

const summaryPoller = createPoller<SummaryFile>({
  url: SUMMARY_URL,
  intervalMs: POLL_MS,
  schema: SummaryFileSchema,
  onData: (data) => {
    summary = data;
    failed = false;
    render();
  },
  onError: () => {
    failed = true;
    render();
  },
});

const recentPoller = createPoller<RecentFile>({
  url: RECENT_URL,
  intervalMs: POLL_MS,
  schema: RecentFileSchema,
  onData: (data) => {
    recent = data;
    render();
  },
  onError: () => {
    /* sparklines are non-critical; ignore */
  },
});

// History feeds for the provider drill-down (90-day bars + resolved incidents).
// Non-critical: a failure just leaves the dialog without that section.
const rollupsPoller = createPoller<RollupsFile>({
  url: ROLLUPS_URL,
  intervalMs: HISTORY_POLL_MS,
  schema: RollupsFileSchema,
  onData: (data) => {
    rollups = data;
  },
  onError: () => {},
});

const incidentsPoller = createPoller<IncidentsFile>({
  url: INCIDENTS_URL,
  intervalMs: HISTORY_POLL_MS,
  schema: IncidentsFileSchema,
  onData: (data) => {
    incidents = data;
  },
  onError: () => {},
});

render();
summaryPoller.start();
recentPoller.start();
rollupsPoller.start();
incidentsPoller.start();
setInterval(updateAgo, 1000);
