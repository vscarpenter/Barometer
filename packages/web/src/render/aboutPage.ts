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

/** A status chip in the exact card vocabulary: --c-driven fill, icon + label. */
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
 * one matching html[data-theme] (a <picture media=prefers-color-scheme> would
 * follow the OS, not the site's manual toggle). width/height pin the aspect ratio
 * so there's no layout shift while the SVG loads. Both are eagerly loaded (they're
 * tiny SVGs and sit near the fold) so the theme swap is instant.
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
 * the same summary.json) up top, then what it watches, how a reading is decided (the
 * availability rule shown as real status chips), how it works, the architecture
 * diagram, and the source. One quiet CTA back to the dashboard. Built once; update()
 * feeds the live instrument each poll — same pattern the dashboard masthead uses.
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

  // The instrument: the dashboard's actual reading band lives here. A persistent slot
  // shows a state message until the first poll lands, then the live band takes over.
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

  // ── One quiet CTA back to the live dashboard (the page's single conversion action). ──
  const ctaWrap = el("div", "about__cta");
  const cta = el("a", "lp-cta lp-cta--ghost");
  cta.href = DASHBOARD_URL;
  cta.textContent = "Open the dashboard →";
  ctaWrap.appendChild(cta);
  root.appendChild(ctaWrap);

  // The instant the live reading was generated, kept so tick() can age it each
  // second without re-polling. Null until the first reading arrives.
  let lastGeneratedAt: string | null = null;

  /** "Live" before any data; "Updated 12s ago" once a reading is in. */
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
