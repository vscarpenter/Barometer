# Consolidate Overview + About Into One Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the marketing Overview page (`landing.html`) and the reference About page (`about.html`) into a single live `/about.html`, each fact appearing once, and retire `landing.html`.

**Architecture:** The unified page is *live* — it follows the current `landing.ts` lifecycle (60s poller + 1s freshness tick), not the static `about.ts` mount. `src/render/aboutPage.ts` becomes `createAboutPage(): { element, update, tick }`, absorbing the live hero + status-chip rule from `landingPage.ts` and keeping About's pipeline/architecture/open-source sections. Three green commits: (1) build the unified live About page, (2) retire the landing page, (3) prune dead CSS.

**Tech Stack:** vanilla TypeScript + Vite (multi-page), vitest + jsdom, `@barometer/types` (zod), `@fontsource/*` self-hosted fonts.

## Global Constraints

- **CSP is `script-src 'self'`** — no inline scripts. The `landing.html` stub uses `<meta http-equiv="refresh">` (not a script) so it's CSP-safe.
- **`PROVIDERS` is the single source of truth** — 11 entries (9 providers + 2 DNS probes), exported from `aboutPage.ts`. Prose stays count-neutral (never the word "nine").
- **Status chips are `--c`-driven** — `chip.style.setProperty("--c", \`var(--status-${status})\`)`, never a hardcoded hex.
- **Adapters/render fail safe** — keep-last-good-reading on a transient poll blip (only an error before ANY data shows the error state).
- **Author** commits as `Vinny Carpenter <vscarpenter@gmail.com>`, Conventional Commits with `(web)` scope, `Claude-Session:` trailer, no Co-Authored-By.
- **Commit directly to `main`** (solo repo norm). Do not push without explicit go-ahead.

---

### Task 1: Build the unified live About page (module + entry + tests)

Landing stays alive this commit; About becomes the live, unified page. No footer/landing changes yet, so the tree stays green.

**Files:**
- Modify: `packages/web/src/render/aboutPage.ts` (rewrite — add `createAboutPage`, drop `renderAboutPage`)
- Modify: `packages/web/src/about.ts` (rewrite — poller lifecycle)
- Modify: `packages/web/test/aboutPage.test.ts` (rewrite for the unified live page)
- Modify: `packages/web/test/about.smoke.test.ts` (live hero + panel, offline)

**Interfaces:**
- Produces: `createAboutPage(): AboutPage` where `interface AboutPage { element: HTMLElement; update(summary: SummaryFile | null, failed: boolean): void; tick(): void; }`; still `export const PROVIDERS: string[]` (11 names).
- Consumes: `createHeadline()` → `{ element, update(overall, offenders?) }`; `offenders(providers)`; `statusLabel`, `makeStatusIcon`; `secondsAgo`, `formatAgo`; `el(tag, cls?)`; `createPoller`; `SummaryFileSchema`, `SummaryFile`; `buildThemeToggle`; `buildFooter`.

- [ ] **Step 1: Rewrite `test/aboutPage.test.ts`** (folds in the live-behavior tests from `landingPage.test.ts`, adapted to `about__providers` + single ghost CTA)

```ts
import { describe, it, expect, vi } from "vitest";
import type { ProviderStatus, SummaryFile, SummaryProvider } from "@barometer/types";
import { createAboutPage } from "../src/render/aboutPage.js";

const ISO = "2026-06-26T03:37:11.872Z";

function provider(displayName: string, status: ProviderStatus): SummaryProvider {
  return {
    id: displayName.toLowerCase().replace(/\s+/g, "-"),
    displayName,
    status,
    activeIncidents: [],
    checkedAt: ISO,
    sourceUrl: "https://example.com",
    uptime: { "24h": 100, "7d": 100, "30d": 100, "90d": 99 },
  };
}

function summary(status: ProviderStatus, providers: SummaryProvider[]): SummaryFile {
  const operational = providers.filter((p) => p.status === "operational").length;
  return {
    overall: {
      status,
      label: status === "operational" ? "Fair — all clear (high pressure)" : "Unsettled",
      providersOperational: operational,
      providersTotal: providers.length,
      generatedAt: ISO,
    },
    providers,
    generatedAt: ISO,
  };
}

describe("createAboutPage — static structure", () => {
  const page = createAboutPage().element;

  it("has one h1 carrying the question and the signature key word, plus a back link", () => {
    expect(page.querySelectorAll("h1")).toHaveLength(1);
    expect(page.querySelector("h1")?.textContent).toMatch(/is the internet healthy right now\?/i);
    expect(page.querySelector(".lp-mark")?.textContent).toBe("healthy");
    expect(page.querySelector('a.about__back[href="/"]')).not.toBeNull();
  });

  it("carries the pipeline description that moved out of the footer", () => {
    expect(page.textContent).toContain("weather labels are presentation only");
  });

  it("explains the availability rule with the real status chips (all six statuses)", () => {
    const t = (page.textContent ?? "").toLowerCase();
    expect(t).toContain("excluded");
    expect(t).toContain("maintenance");
    const labels = [...page.querySelectorAll(".lp-chip__label")].map((n) => n.textContent);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Operational",
        "Degraded",
        "Partial outage",
        "Major outage",
        "Maintenance",
        "Unknown",
      ]),
    );
    const chips = page.querySelectorAll(".lp-chip");
    expect([...chips].every((c) => c.querySelector("svg") !== null)).toBe(true);
  });

  it("states the overall reading is US-scoped without claiming US-only providers", () => {
    const t = (page.textContent ?? "").toLowerCase();
    expect(t).toContain("us-scoped");
    expect(t).toContain("global");
    expect(t).toContain("united states");
  });

  it("lists the live provider set (incl. DNS probes) with no stale hardcoded count", () => {
    const items = page.querySelectorAll(".about__providers li");
    const t = page.textContent ?? "";
    expect(items).toHaveLength(11);
    expect(t).toContain("Cloudflare DNS");
    expect(t).toContain("Google DNS");
    expect(t).not.toMatch(/\bnine\b/i);
  });

  it("links to the GitHub repository (new tab, safe rel)", () => {
    const gh = page.querySelector<HTMLAnchorElement>('a[href*="github.com/vscarpenter/Barometer"]');
    expect(gh).not.toBeNull();
    expect(gh!.target).toBe("_blank");
    expect(gh!.rel).toContain("noopener");
  });

  it("shows the theme-aware architecture diagram (light + dark, alt text, not lazy)", () => {
    expect(page.querySelector('img[src="/barometer-overview-almanac.svg"]')).not.toBeNull();
    expect(page.querySelector('img[src="/barometer-overview-almanac-dark.svg"]')).not.toBeNull();
    const diagrams = page.querySelectorAll<HTMLImageElement>("img.about__diagram");
    expect(diagrams).toHaveLength(2);
    expect([...diagrams].every((img) => img.alt.length > 0)).toBe(true);
    expect([...diagrams].every((img) => img.loading !== "lazy")).toBe(true);
  });

  it("has exactly one quiet CTA that opens the dashboard", () => {
    const ctas = page.querySelectorAll<HTMLAnchorElement>("a.lp-cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0].getAttribute("href")).toBe("/");
    expect(ctas[0].classList.contains("lp-cta--ghost")).toBe(true);
  });
});

describe("createAboutPage — live reading band", () => {
  it("shows a loading state before any data and no reading band yet", () => {
    const page = createAboutPage();
    page.update(null, false);
    expect(page.element.querySelector(".lp-panel__state")?.textContent).toMatch(/reading the barometer/i);
    expect(page.element.querySelector(".reading")).toBeNull();
  });

  it("mounts the live reading band and names offenders when something is down", () => {
    const page = createAboutPage();
    page.update(
      summary("partial_outage", [provider("AWS", "operational"), provider("GitHub", "partial_outage")]),
      false,
    );
    const band = page.element.querySelector(".reading");
    expect(band).not.toBeNull();
    expect(band?.getAttribute("data-status")).toBe("partial_outage");
    expect(page.element.querySelector(".reading__count")?.textContent).toBe("1 of 2");
    expect(page.element.querySelector(".reading__offenders")?.textContent).toMatch(/github/i);
  });

  it("keeps the last good reading on a transient error (failed flag, summary present)", () => {
    const page = createAboutPage();
    page.update(summary("operational", [provider("AWS", "operational")]), false);
    page.update(summary("operational", [provider("AWS", "operational")]), true);
    expect(page.element.querySelector(".reading")).not.toBeNull();
    expect(page.element.querySelector(".lp-panel__state")).toBeNull();
  });

  it("shows the error state only when no data has ever arrived", () => {
    const page = createAboutPage();
    page.update(null, true);
    expect(page.element.querySelector(".lp-panel__state")?.textContent).toMatch(/couldn't reach/i);
  });

  it("ages the freshness label from the data's generatedAt, ticking in place", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-26T03:37:21.872Z")); // +10s
      const page = createAboutPage();
      page.update(summary("operational", [provider("AWS", "operational")]), false);
      expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Updated 10s ago");
      vi.setSystemTime(new Date("2026-06-26T03:38:11.872Z")); // +60s
      page.tick();
      expect(page.element.querySelector(".lp-panel__label")?.textContent).toBe("Updated 1m ago");
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --filter '@barometer/web' test -- aboutPage`
Expected: FAIL — `createAboutPage` is not exported.

- [ ] **Step 3: Rewrite `src/render/aboutPage.ts`** (full file)

```ts
import type { ProviderStatus, SummaryFile } from "@barometer/types";
import { el } from "./dom.js";
import { createHeadline } from "./headline.js";
import { secondsAgo, formatAgo } from "../poll.js";
import { offenders } from "./order.js";
import { statusLabel, makeStatusIcon } from "./status.js";

const REPO_URL = "https://github.com/vscarpenter/Barometer";
const DASHBOARD_URL = "/";

// Reused from the README's diagram alt text — one honest description of the system.
const ARCH_ALT =
  "Barometer system architecture: nine provider status feeds polled by a scheduled " +
  "AWS Lambda, normalized and written as tiered JSON to a private S3 bucket, served via " +
  "CloudFront and Route 53 to a vanilla-TypeScript dashboard, with CloudWatch alarms " +
  "paging an SNS email alert.";

// The live provider set, including the two DNS active probes. Kept in step with
// packages/engine/src/config/providers.ts. The surrounding prose is count-neutral
// so it can't drift from this list (or from the dashboard's live count).
export const PROVIDERS = [
  "Amazon Web Services",
  "Microsoft Azure",
  "Google Cloud",
  "Cloudflare",
  "GitHub",
  "OpenAI",
  "Anthropic",
  "Vercel",
  "DigitalOcean",
  "Cloudflare DNS (1.1.1.1)",
  "Google DNS (8.8.8.8)",
];

// The availability rule, made visible. Each group is one bucket of the single knob
// in packages/types/src/availability.ts, shown with the real status chips (color +
// label + icon) so the page can't drift from the engine.
const RULE_GROUPS: { kicker: string; rule: string; statuses: ProviderStatus[] }[] = [
  { kicker: "Counts as up", rule: "A provider reporting operational.", statuses: ["operational"] },
  {
    kicker: "Counts as down",
    rule: "Degraded service or a partial or major outage.",
    statuses: ["degraded", "partial_outage", "major_outage"],
  },
  {
    kicker: "Never counted",
    rule: "Planned maintenance, or a feed we couldn't read — excluded, never guessed.",
    statuses: ["maintenance", "unknown"],
  },
];

function externalLink(href: string, text: string): HTMLAnchorElement {
  const a = el("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function section(heading: string): HTMLElement {
  const s = el("section", "about__section");
  const h = el("h2", "about__h2");
  h.textContent = heading;
  s.appendChild(h);
  return s;
}

function para(text: string, cls?: string): HTMLParagraphElement {
  const p = el("p", cls);
  p.textContent = text;
  return p;
}

/** A status chip in the card vocabulary: --c-driven fill, icon + label. */
function statusChip(status: ProviderStatus): HTMLElement {
  const chip = el("span", "lp-chip");
  chip.style.setProperty("--c", `var(--status-${status})`);
  const icon = el("span", "lp-chip__icon");
  icon.setAttribute("aria-hidden", "true");
  icon.appendChild(makeStatusIcon(status, 15));
  const label = el("span", "lp-chip__label");
  label.textContent = statusLabel(status);
  chip.append(icon, label);
  return chip;
}

function stateMessage(text: string): HTMLElement {
  const div = el("div", "lp-panel__state");
  div.textContent = text;
  return div;
}

/**
 * The theme-aware overview diagram. Both variants are in the DOM; CSS shows the
 * one matching html[data-theme]. width/height pin the aspect ratio (no layout
 * shift). Both eagerly loaded (tiny SVGs near the fold) so the theme swap is instant.
 */
function diagram(): HTMLElement {
  const figure = el("figure", "about__figure");
  for (const variant of ["light", "dark"] as const) {
    const img = el("img", `about__diagram about__diagram--${variant}`);
    img.src =
      variant === "dark" ? "/barometer-overview-almanac-dark.svg" : "/barometer-overview-almanac.svg";
    img.alt = ARCH_ALT;
    img.width = 1680;
    img.height = 905;
    figure.appendChild(img);
  }
  const caption = el("figcaption", "about__figcaption");
  caption.textContent =
    "Public status feeds → one normalized schema → tiered JSON on S3 → this dashboard.";
  figure.appendChild(caption);
  return figure;
}

export interface AboutPage {
  element: HTMLElement;
  /** Mount/refresh the live reading from a poll. null + failed drive the panel state. */
  update(summary: SummaryFile | null, failed: boolean): void;
  /** Re-render the "updated Ns ago" freshness from the last reading; call ~1/s. */
  tick(): void;
}

/**
 * The unified About page: a live hero (the dashboard's real reading band, wired to
 * the same summary.json), then how it's watched, how a reading is decided (the
 * availability rule as real status chips), how it works, the architecture diagram,
 * and the source. Built once; update() feeds the live instrument each poll.
 */
export function createAboutPage(): AboutPage {
  const root = el("div", "about");

  // ── Nav: back to the dashboard. The theme toggle is dropped in by the entry. ──
  const nav = el("nav", "about__nav");
  const back = el("a", "about__back");
  back.href = DASHBOARD_URL;
  back.textContent = "← Dashboard";
  nav.appendChild(back);
  root.appendChild(nav);

  // ── Hero: value prop (left) + live instrument (right, the real reading band). ──
  const hero = el("header", "lp-hero");
  const text = el("div", "lp-hero__text");
  const h1 = el("h1", "lp-hero__title");
  h1.append(
    document.createTextNode("Is the internet "),
    (() => {
      const mark = el("span", "lp-mark");
      mark.textContent = "healthy";
      return mark;
    })(),
    document.createTextNode(" right now?"),
  );
  const sub = el("p", "lp-hero__sub");
  sub.textContent =
    "Barometer reads the public status of the cloud, network, and AI providers the web " +
    "runs on, normalizes their very different formats into one honest reading, and answers " +
    "in a single glance — without crying wolf.";
  text.append(h1, sub);

  const panel = el("div", "lp-hero__panel");
  const panelLabel = el("p", "lp-panel__label");
  panelLabel.textContent = "Live";
  const panelSlot = el("div", "lp-panel__slot");
  panelSlot.appendChild(stateMessage("Reading the barometer…"));
  panel.append(panelLabel, panelSlot);
  hero.append(text, panel);
  root.appendChild(hero);

  const headline = createHeadline();
  let headlineMounted = false;

  // ── What it watches: the real provider set (one source of truth). ──
  const watches = section("What it watches");
  watches.appendChild(
    para(
      "The cloud, network, and AI providers most of the web depends on — each read straight " +
        "from its own public status feed, plus active DNS probes:",
    ),
  );
  const providerList = el("ul", "about__providers");
  for (const name of PROVIDERS) {
    const li = el("li");
    li.textContent = name;
    providerList.appendChild(li);
  }
  watches.appendChild(providerList);
  root.appendChild(watches);

  // ── How a reading is decided: the availability knob, shown with real chips. ──
  const rule = section("How a reading is decided");
  rule.appendChild(
    para(
      "One rule, applied the same way every five minutes — so planned work and our own fetch " +
        "failures never fake an outage or a perfect 100%. The reading is US-scoped: every provider " +
        "here is global, but an incident only moves the reading when it affects the United States " +
        "(or names no region); a purely non-US incident stays visible on a provider's tile yet " +
        "never flips the overall reading.",
    ),
  );
  const ruleGroups = el("div", "lp-rule__groups");
  for (const group of RULE_GROUPS) {
    const row = el("div", "lp-rule__group");
    const kicker = el("p", "lp-rule__kicker");
    kicker.textContent = group.kicker;
    const body = el("div", "lp-rule__body");
    const chips = el("div", "lp-rule__chips");
    for (const s of group.statuses) chips.appendChild(statusChip(s));
    const desc = el("p", "lp-rule__desc");
    desc.textContent = group.rule;
    body.append(chips, desc);
    row.append(kicker, body);
    ruleGroups.appendChild(row);
  }
  rule.appendChild(ruleGroups);
  root.appendChild(rule);

  // ── How it works: the pipeline, in prose. ──
  const how = section("How it works");
  how.appendChild(
    para(
      "Barometer reads each provider's public status page every 5 minutes. Raw status " +
        "is normalized; weather labels are presentation only.",
    ),
  );
  how.appendChild(
    para(
      "A scheduled AWS Lambda fetches every feed, maps each provider's own format into one " +
        "shared schema, and writes tiered JSON to S3. This dashboard polls that JSON every 60 " +
        "seconds — there is no server rendering the page and no database.",
    ),
  );
  root.appendChild(how);

  // ── Architecture: the theme-aware diagram. ──
  const arch = section("Architecture");
  arch.appendChild(diagram());
  root.appendChild(arch);

  // ── Open source. ──
  const source = section("Open source");
  const colophon = el("p");
  colophon.append(
    document.createTextNode(
      "Barometer is built with vanilla TypeScript and runs serverless on AWS " +
        "(Lambda, S3, CloudFront, Route 53). The code is on GitHub: ",
    ),
    externalLink(REPO_URL, "github.com/vscarpenter/Barometer"),
    document.createTextNode("."),
  );
  source.appendChild(colophon);
  root.appendChild(source);

  // ── One quiet CTA back to the live dashboard. ──
  const ctaWrap = el("div", "about__cta");
  const cta = el("a", "lp-cta lp-cta--ghost");
  cta.href = DASHBOARD_URL;
  cta.textContent = "Open the dashboard →";
  ctaWrap.appendChild(cta);
  root.appendChild(ctaWrap);

  // The instant the live reading was generated, kept so tick() can age it each
  // second without re-polling. Null until the first reading arrives.
  let lastGeneratedAt: string | null = null;

  function refreshAgo(): void {
    panelLabel.textContent = lastGeneratedAt
      ? `Updated ${formatAgo(secondsAgo(lastGeneratedAt, Date.now()))} ago`
      : "Live";
  }

  function update(summary: SummaryFile | null, failed: boolean): void {
    if (!summary) {
      headlineMounted = false;
      lastGeneratedAt = null;
      refreshAgo();
      panelSlot.replaceChildren(
        stateMessage(failed ? "Couldn't reach the barometer. Retrying…" : "Reading the barometer…"),
      );
      return;
    }
    if (!headlineMounted) {
      panelSlot.replaceChildren(headline.element);
      headlineMounted = true;
    }
    headline.update(summary.overall, offenders(summary.providers));
    lastGeneratedAt = summary.generatedAt;
    refreshAgo();
  }

  return { element: root, update, tick: refreshAgo };
}
```

- [ ] **Step 4: Rewrite `src/about.ts`** (poller lifecycle — mirrors the old `landing.ts`)

```ts
// Self-hosted brand fonts — same weights the dashboard imports (self-hosted, not
// the Google CDN, to satisfy the site's font-src 'self' CSP).
import "@fontsource/space-grotesk/600.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles.css";
import { SummaryFileSchema, type SummaryFile } from "@barometer/types";
import { createPoller } from "./poll.js";
import { createAboutPage } from "./render/aboutPage.js";
import { buildThemeToggle } from "./render/theme.js";
import { buildFooter } from "./render/footer.js";

const SUMMARY_URL = "/status/summary.json";
const POLL_MS = 60_000;

// Entry point for /about.html. Mounts the unified live page, drops the shared theme
// toggle into the nav, appends the shared footer, and feeds the hero's live reading
// band from the same summary.json the dashboard polls.
const root = document.querySelector<HTMLDivElement>("#about")!;
root.replaceChildren();

const page = createAboutPage();
page.element.querySelector(".about__nav")?.appendChild(buildThemeToggle());
page.element.appendChild(buildFooter("about"));
root.appendChild(page.element);

// Hold the last good reading so a transient poll failure keeps showing it (the
// instrument stays calm on a blip) — only an error before ANY data shows the error.
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
// Age the hero's "updated Ns ago" freshness once a second (the reading re-polls
// each minute) — same cadence as the dashboard masthead.
setInterval(() => page.tick(), 1000);
```

- [ ] **Step 5: Rewrite `test/about.smoke.test.ts`** (entry now polls — offline + fake timers, like the old landing smoke)

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Smoke test for the /about.html entry — catches module-evaluation crashes
 *  (TDZ, bad import) that sail past unit tests and only show as a blank page. */
describe("about.ts entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="about"></div>';
    // The summary poller fetches on start; keep it offline + deterministic and
    // freeze timers so the 60s interval never fires during the test.
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mounts the unified About page with the hero, theme toggle, and shared footer", async () => {
    await expect(import("../src/about.js")).resolves.toBeDefined();
    expect(document.querySelector("#about .lp-hero__title")?.textContent).toMatch(
      /is the internet healthy right now/i,
    );
    // Theme toggle dropped into the About nav.
    expect(document.querySelector("#about .about__nav .theme-toggle")).not.toBeNull();
    // The live panel slot exists (shows a state message until the first poll lands).
    expect(document.querySelector("#about .lp-panel__slot")).not.toBeNull();
    // Shared footer mounts with About marked current.
    const footer = document.querySelector("#about footer.footer");
    expect(footer).not.toBeNull();
    expect(footer!.querySelector<HTMLAnchorElement>('a[href="/"]')?.textContent).toBe("Home");
    expect(footer!.querySelector('a[href="/about.html"]')?.getAttribute("aria-current")).toBe("page");
  });
});
```

- [ ] **Step 6: Run the About tests to verify they pass**

Run: `bun run --filter '@barometer/web' test -- aboutPage about.smoke`
Expected: PASS (both files).

- [ ] **Step 7: Typecheck (landing still compiles — it imports `PROVIDERS`, still exported)**

Run: `bun run typecheck`
Expected: PASS. (If `landingPage.ts` errors on a missing `renderAboutPage`, it shouldn't — it only imports `PROVIDERS`.)

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/render/aboutPage.ts packages/web/src/about.ts \
  packages/web/test/aboutPage.test.ts packages/web/test/about.smoke.test.ts
git commit -m "feat(web): make About the unified live page (hero + chip rule)

$(printf '%s' 'About absorbs the marketing Overview: a live reading band wired to the same summary.json, the availability rule shown with real status chips, plus the existing pipeline / architecture / open-source sections. createAboutPage() replaces the static renderAboutPage() and drives the 60s poll + 1s freshness tick. Landing still exists this commit; it is retired next.')

Claude-Session: https://claude.ai/code/8f8dd180-25bb-4a72-8786-ca25040d1fe3"
```

---

### Task 2: Retire the Overview (landing) page

Now nothing needs the landing page; remove it and collapse the footer to Home · About.

**Files:**
- Modify: `packages/web/src/render/footer.ts` (drop `"landing"` from `FooterPage` + `PAGES`)
- Modify: `packages/web/test/footer.test.ts` (Home · About only)
- Modify: `packages/web/landing.html` (→ meta-refresh stub)
- Modify: `packages/web/vite.config.ts` (comment only — `landing` input now points at the stub)
- Delete: `packages/web/src/landing.ts`, `packages/web/src/render/landingPage.ts`, `packages/web/test/landing.smoke.test.ts`, `packages/web/test/landingPage.test.ts`

**Interfaces:**
- Produces: `type FooterPage = "home" | "about"`.

- [ ] **Step 1: Update `test/footer.test.ts`** — replace the first test and delete the landing aria-current test.

Replace the `"renders Home, Overview, and About…"` test body with:

```ts
  it("renders Home and About as footer navigation links", () => {
    const footer = buildFooter("home");
    const nav = footer.querySelector("nav.footer__nav");
    expect(nav?.getAttribute("aria-label")).toBe("Footer");

    const home = footer.querySelector<HTMLAnchorElement>('a[href="/"]');
    const about = footer.querySelector<HTMLAnchorElement>('a[href="/about.html"]');
    expect(home?.textContent).toBe("Home");
    expect(about?.textContent).toBe("About");
    // The Overview/landing page has been retired.
    expect(footer.querySelector('a[href="/landing.html"]')).toBeNull();
  });
```

Delete the entire `it("marks the current page with aria-current=page (landing/overview)", …)` test.

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter '@barometer/web' test -- footer`
Expected: FAIL — footer still renders the Overview link / `FooterPage` still accepts `"landing"`.

- [ ] **Step 3: Edit `src/render/footer.ts`**

Change the type:

```ts
export type FooterPage = "home" | "about";
```

Change `PAGES` (drop the landing row):

```ts
const PAGES: { page: FooterPage; href: string; label: string }[] = [
  { page: "home", href: "/", label: "Home" },
  { page: "about", href: "/about.html", label: "About" },
];
```

Update the doc comment: `Two groups: navigation (Home · Overview · About)` → `Two groups: navigation (Home · About)`.

- [ ] **Step 4: Delete the landing source, module, and their tests**

```bash
git rm packages/web/src/landing.ts packages/web/src/render/landingPage.ts \
  packages/web/test/landing.smoke.test.ts packages/web/test/landingPage.test.ts
```

- [ ] **Step 5: Replace `landing.html` with a meta-refresh stub** (CSP-safe — no script)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- The Overview page was merged into About. Redirect any stale link
         (bookmark or cached older bundle) to the unified page. meta-refresh,
         not a script, so it satisfies the site's script-src 'self' CSP. -->
    <meta http-equiv="refresh" content="0; url=/about.html" />
    <link rel="canonical" href="/about.html" />
    <meta name="robots" content="noindex" />
    <title>Moved — Barometer</title>
  </head>
  <body>
    <p>This page has moved to <a href="/about.html">/about.html</a>.</p>
  </body>
</html>
```

- [ ] **Step 6: Update the `vite.config.ts` comment** (the input stays; only the meaning changed)

Change the multi-page comment block so it reads:

```ts
    // Multi-page: the dashboard (index.html) and the standalone About page
    // (about.html), which is also the live overview. landing.html is a retired
    // meta-refresh stub redirecting to /about.html (kept as an emitted entry).
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        landing: fileURLToPath(new URL("./landing.html", import.meta.url)),
        about: fileURLToPath(new URL("./about.html", import.meta.url)),
      },
    },
```

- [ ] **Step 7: Run the full web suite + typecheck**

Run: `bun run --filter '@barometer/web' test && bun run typecheck`
Expected: PASS. No test imports the deleted modules; `main.smoke.test.ts` still passes (asserts only `/about.html`).

- [ ] **Step 8: Commit**

```bash
git add -A packages/web
git commit -m "feat(web): retire the Overview page, fold it into About

$(printf '%s' 'The marketing Overview lived only behind the footer (no external links, reachable only from inside the dashboard), so its funnel was circular. Its live hero and chip rule now live on the unified About page. Footer collapses to Home · About; landing.html becomes a CSP-safe meta-refresh stub to /about.html; landing.ts, landingPage.ts, and their tests are removed.')

Claude-Session: https://claude.ai/code/8f8dd180-25bb-4a72-8786-ca25040d1fe3"
```

---

### Task 3: Prune the now-dead landing CSS

**Files:**
- Modify: `packages/web/src/styles.css`

**Remove these blocks entirely** (no longer referenced by any markup — verify each with a grep first):

- `.lp-nav`, `.lp-brand`, `.lp-brand__mark`, `.lp-brand__name`, `.lp-nav__right`
- `.lp-hero__actions`
- `.lp-hero__trust`
- `.lp-cta--primary` (+ `:hover`, `:active`), `.lp-cta--secondary` (+ `:hover`)
- `.lp-section`, `.lp-h2`, `.lp-section__lede`
- `.lp-providers`, `.lp-providers li`
- `.lp-final`, `.lp-final__title`, `.lp-final__sub`, `.lp-final__actions`
- `.about__header`, `.about__title` (the old static About header, replaced by the hero)

**Keep** (still used by the unified page): `.lp-hero`, `.lp-hero__title`, `.lp-mark(::after)`, `.lp-hero__sub`, `.lp-hero__panel` (+ `.reading` descendants), `.lp-panel__label(::before)`, `.lp-panel__state`, `.lp-cta`, `.lp-cta--ghost(:hover)`, all `.lp-rule__*`, `.lp-chip*`, and the `@media` rules for `.lp-hero*` / `.lp-rule__*`. Keep `.about__lede` (shared rule `.about__lede, .about__section p`).

- [ ] **Step 1: Confirm each pruned selector is unreferenced in markup**

Run:
```bash
cd packages/web && for c in lp-nav lp-brand lp-nav__right lp-hero__actions lp-hero__trust \
  "lp-cta--primary" "lp-cta--secondary" lp-section lp-h2 lp-section__lede lp-providers \
  lp-final about__header about__title; do
  echo "== $c =="; grep -rn "$c" src --include="*.ts" || echo "  (no TS reference — safe to prune)"; done
```
Expected: every class prints "(no TS reference — safe to prune)".

- [ ] **Step 2: Add the one small CTA-wrapper rule and remove the dead blocks**

Add near the other `.about__*` rules:

```css
.about__cta {
  margin-top: var(--space-8, 2rem);
  text-align: center;
}
```

Then delete each block listed above (match by selector; some carry `:hover`/`:active`/`::before` companions and `@media` entries — remove only the standalone rules listed, not the kept `@media .lp-hero`/`.lp-rule__*`).

- [ ] **Step 3: Verify the build emits both pages and the CSS still resolves**

Run: `bun run --filter '@barometer/web' build`
Expected: PASS; `dist/about.html`, `dist/index.html`, and `dist/landing.html` (the stub) all emitted; no unresolved-class or empty-chunk errors.

- [ ] **Step 4: Run the full suite + typecheck once more**

Run: `bun run test && bun run typecheck`
Expected: PASS across all packages.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/styles.css
git commit -m "refactor(web): prune the retired Overview page's dead CSS

$(printf '%s' 'Remove the landing-only rules no longer referenced after the merge (lp-nav/brand, hero actions/trust, primary+secondary CTAs, lp-section/providers, lp-final, and the old static About header/title). Add a small .about__cta rule for the single closing CTA. Keep the hero, panel, chip, and rule styles the unified page still uses.')

Claude-Session: https://claude.ai/code/8f8dd180-25bb-4a72-8786-ca25040d1fe3"
```

---

## Self-Review

**Spec coverage:**
- Unify into one `/about.html` → Task 1 (module + entry). ✓
- Footer → Home · About → Task 2 Step 3. ✓
- Live hero + one quiet CTA → Task 1 Step 3 (hero without actions/trust; single `lp-cta--ghost`). ✓
- Chip rule as the single rule presentation; About prose dropped → Task 1 Step 3 (`RULE_GROUPS` + chips; no prose "How a provider counts"). ✓
- Provider list once → Task 1 (`about__providers`, `PROVIDERS`). ✓
- Pipeline / architecture / open source retained → Task 1 Step 3. ✓
- `landing.html` meta-refresh stub, vite input kept → Task 2 Steps 5–6. ✓
- Delete `landing.ts` / `landingPage.ts` + tests → Task 2 Step 4. ✓
- Keep `lp-*` names, prune dead blocks → Task 3. ✓
- Tests updated/rewritten → Tasks 1–2. ✓

**Placeholder scan:** No TBD/TODO; all code and test blocks are complete; commands have expected output. ✓

**Type consistency:** `createAboutPage()` returns `AboutPage { element, update, tick }` — matches the entry's `page.element` / `page.update` / `page.tick` usage and the test's `createAboutPage().element`. `FooterPage = "home" | "about"` — `buildFooter("about")`/`("home")` only; no `"landing"` caller remains after Task 2. `PROVIDERS` stays exported (11 entries). ✓
