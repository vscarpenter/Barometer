import "./styles.css";
import type { SummaryFile, RecentFile, ProviderStatus } from "@barometer/types";
import { createPoller, isStale, secondsAgo, formatAgo } from "./poll.js";
import { el, svgEl } from "./render/dom.js";
import { renderHeadline } from "./render/headline.js";
import { renderCard } from "./render/card.js";
import { createBannerRegion, updateBannerRegion } from "./render/banner.js";

const SUMMARY_URL = "/status/summary.json";
const RECENT_URL = "/history/recent.json";
const POLL_MS = 60_000;
const SPARK_SAMPLES = 40;

let summary: SummaryFile | null = null;
let recent: RecentFile | null = null;
let failed = false;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.replaceChildren();

const bannerSlot = createBannerRegion();
const readingSlot = el("div");
const gridSlot = el("div", "grid");
const updatedText = el("span", "");
app.append(buildMasthead(updatedText), bannerSlot, readingSlot, gridSlot, buildFooter());

function recentFor(id: string): ProviderStatus[] {
  if (!recent) return [];
  return recent.samples
    .slice(-SPARK_SAMPLES)
    .map((sample) => sample.s[id])
    .filter((s): s is ProviderStatus => Boolean(s));
}

function render(): void {
  if (!summary) {
    bannerSlot.replaceChildren();
    gridSlot.replaceChildren();
    readingSlot.replaceChildren(
      stateMessage(failed ? "Couldn't reach the barometer. Retrying…" : "Reading the barometer…"),
    );
    return;
  }

  const nowMs = Date.now();
  updateBannerRegion(bannerSlot, summary.generatedAt, nowMs, isStale(summary.generatedAt, nowMs));
  readingSlot.replaceChildren(renderHeadline(summary.overall));
  gridSlot.replaceChildren(
    ...(summary.providers.length
      ? summary.providers.map((p) => renderCard(p, recentFor(p.id)))
      : [stateMessage("No providers configured.")]),
  );
  updateAgo();
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

function buildMasthead(updated: HTMLElement): HTMLElement {
  const header = el("header", "masthead");

  const mark = svgEl("svg");
  mark.classList.add("masthead__mark");
  mark.setAttribute("viewBox", "0 0 24 24");
  mark.setAttribute("fill", "none");
  mark.setAttribute("stroke", "currentColor");
  mark.setAttribute("stroke-width", "2");
  mark.setAttribute("stroke-linecap", "round");
  mark.setAttribute("aria-hidden", "true");
  for (const d of ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 12l4-3"]) {
    const path = svgEl("path");
    path.setAttribute("d", d);
    mark.appendChild(path);
  }

  const titles = el("div", "masthead__titles");
  const h1 = el("h1");
  h1.textContent = "Barometer";
  const tagline = el("p");
  tagline.textContent = "A weather station for the internet";
  titles.append(h1, tagline);

  const status = el("div", "masthead__status");
  const dot = el("span", "masthead__dot");
  dot.setAttribute("aria-hidden", "true");
  status.append(dot, updated);

  header.append(mark, titles, status);
  return header;
}

function buildFooter(): HTMLElement {
  const footer = el("footer");
  footer.append(
    document.createTextNode("Barometer reads each provider's public status page every 5 minutes. "),
  );
  const span = el("span");
  span.textContent = "Raw status is normalized; weather labels are presentation only.";
  footer.appendChild(span);
  return footer;
}

const summaryPoller = createPoller<SummaryFile>({
  url: SUMMARY_URL,
  intervalMs: POLL_MS,
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
  onData: (data) => {
    recent = data;
    render();
  },
  onError: () => {
    /* sparklines are non-critical; ignore */
  },
});

render();
summaryPoller.start();
recentPoller.start();
setInterval(updateAgo, 1000);
