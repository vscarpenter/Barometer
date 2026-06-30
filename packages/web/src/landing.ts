// Self-hosted brand fonts — the landing is the marketing showcase, so the
// Almanac type pairing matters most here. Same weights the dashboard imports
// (self-hosted, not the Google CDN, to satisfy the site's font-src 'self' CSP).
import "@fontsource/space-grotesk/600.css"; // display: wordmark, headline, weather word
import "@fontsource/hanken-grotesk/400.css"; // body default
import "@fontsource/hanken-grotesk/500.css"; // toggle, labels
import "@fontsource/hanken-grotesk/600.css"; // counts, status chips
import "@fontsource/jetbrains-mono/500.css"; // reading-band figures
import "./styles.css";
import { SummaryFileSchema, type SummaryFile } from "@barometer/types";
import { createPoller } from "./poll.js";
import { createLandingPage } from "./render/landingPage.js";
import { buildThemeToggle } from "./render/theme.js";
import { buildFooter } from "./render/footer.js";

const SUMMARY_URL = "/status/summary.json";
const POLL_MS = 60_000;

// Entry point for /landing.html. Mounts the page, drops the shared theme toggle
// into the nav (so the live instrument's tints can be flipped here too), appends
// the shared footer, and feeds the hero's live reading band from the same
// summary.json the dashboard polls.
const root = document.querySelector<HTMLDivElement>("#landing")!;
root.replaceChildren();

const page = createLandingPage();
page.element.querySelector(".lp-nav__right")?.appendChild(buildThemeToggle());
page.element.appendChild(buildFooter("landing"));
root.appendChild(page.element);

// Hold the last good reading so a transient poll failure keeps showing it (the
// instrument stays calm on a blip) instead of blanking to an error — only an
// error before ANY data arrives shows the error state. Mirrors the dashboard.
let summary: SummaryFile | null = null;

const poller = createPoller<SummaryFile>({
  url: SUMMARY_URL,
  intervalMs: POLL_MS,
  schema: SummaryFileSchema,
  onData: (data) => {
    summary = data;
    page.update(summary, false);
  },
  onError: () => page.update(summary, true),
});

page.update(null, false);
poller.start();
// Age the hero's "updated Ns ago" freshness once a second (the reading itself
// only re-polls each minute) — same cadence as the dashboard masthead.
setInterval(() => page.tick(), 1000);
