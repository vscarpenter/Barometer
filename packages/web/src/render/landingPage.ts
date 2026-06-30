import type { ProviderStatus, SummaryFile } from "@barometer/types";
import { el } from "./dom.js";
import { createHeadline } from "./headline.js";
import { secondsAgo, formatAgo } from "../poll.js";
import { offenders } from "./order.js";
import { statusLabel, makeStatusIcon } from "./status.js";
import { PROVIDERS } from "./aboutPage.js";

const DASHBOARD_URL = "/";

// The availability rule, made visible. Each group is one bucket of the single
// knob in packages/types/src/availability.ts, shown with the real status chips
// (color + label + icon) so the marketing page can't drift from the engine.
const RULE_GROUPS: { kicker: string; rule: string; statuses: ProviderStatus[] }[] = [
  {
    kicker: "Counts as up",
    rule: "A provider reporting operational.",
    statuses: ["operational"],
  },
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

/** A status chip in the exact card vocabulary: --c-driven 13% fill, label + icon. */
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

function ctaLink(text: string, variant: "primary" | "secondary" | "ghost"): HTMLAnchorElement {
  const a = el("a", `lp-cta lp-cta--${variant}`);
  a.href = DASHBOARD_URL;
  a.textContent = text;
  return a;
}

/** The masthead barometer mark — the same instrument glyph as the dashboard. */
function brandMark(): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const mark = document.createElementNS(ns, "svg");
  mark.classList.add("lp-brand__mark");
  mark.setAttribute("viewBox", "0 0 24 24");
  mark.setAttribute("fill", "none");
  mark.setAttribute("stroke-linecap", "round");
  mark.setAttribute("stroke-linejoin", "round");
  mark.setAttribute("aria-hidden", "true");
  const ring = document.createElementNS(ns, "circle");
  ring.setAttribute("cx", "12");
  ring.setAttribute("cy", "12");
  ring.setAttribute("r", "8.4");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-width", "1.7");
  const needle = document.createElementNS(ns, "path");
  needle.setAttribute("d", "M12 12L16.8 7.6");
  needle.setAttribute("stroke", "var(--accent)");
  needle.setAttribute("stroke-width", "1.9");
  const hub = document.createElementNS(ns, "circle");
  hub.setAttribute("cx", "12");
  hub.setAttribute("cy", "12");
  hub.setAttribute("r", "1.55");
  hub.setAttribute("fill", "currentColor");
  mark.append(ring, needle, hub);
  return mark;
}

export interface LandingPage {
  element: HTMLElement;
  /** Mount/refresh the live reading from a poll. null + failed drive the panel state. */
  update(summary: SummaryFile | null, failed: boolean): void;
  /** Re-render the "updated Ns ago" freshness from the last reading; call ~1/s. */
  tick(): void;
}

/**
 * The marketing landing page. One conversion action — "Open the live dashboard"
 * (every CTA points at "/") — and one honest proof: the hero "product shot" is
 * the dashboard's real reading band wired to the same summary.json, not a
 * screenshot. Built once; update() feeds the live instrument each poll.
 */
export function createLandingPage(): LandingPage {
  const root = el("div", "lp");

  // ── Nav: wordmark + the quiet (level-3) dashboard link. The theme toggle is
  // dropped in by the entry, matching the About page. ──
  const nav = el("nav", "lp-nav");
  const brand = el("a", "lp-brand");
  brand.href = DASHBOARD_URL;
  const brandText = el("span", "lp-brand__name");
  brandText.textContent = "Barometer";
  brand.append(brandMark(), brandText);
  const navRight = el("div", "lp-nav__right");
  navRight.appendChild(ctaLink("Open dashboard →", "ghost"));
  nav.append(brand, navRight);
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
  const actions = el("div", "lp-hero__actions");
  actions.appendChild(ctaLink("Open the live dashboard", "primary"));
  const trust = el("p", "lp-hero__trust");
  trust.textContent = "Free · no sign-up · refreshes every 5 minutes";
  text.append(h1, sub, actions, trust);

  // The instrument: the dashboard's actual reading band lives here, framed as the
  // "product shot". A persistent slot shows a state message until the first poll
  // lands, then the live band takes over (same pattern as the dashboard).
  const panel = el("div", "lp-hero__panel");
  // Honest liveness: a live dot (::before) + a freshness reading that ticks from
  // the data's own generatedAt — so the hero visibly *is* live, not a screenshot.
  const panelLabel = el("p", "lp-panel__label");
  panelLabel.textContent = "Live";
  const panelSlot = el("div", "lp-panel__slot");
  panelSlot.appendChild(stateMessage("Reading the barometer…"));
  panel.append(panelLabel, panelSlot);
  hero.append(text, panel);
  root.appendChild(hero);

  const headline = createHeadline();
  let headlineMounted = false;

  // ── Coverage: what it watches (the real provider set, one source of truth). ──
  const coverage = el("section", "lp-section lp-coverage");
  const covH2 = el("h2", "lp-h2");
  covH2.textContent = "What it watches";
  const covP = el("p", "lp-section__lede");
  covP.textContent =
    "The cloud, network, and AI providers most of the web depends on — each read straight " +
    "from its own public status feed, plus active DNS probes:";
  const providerList = el("ul", "lp-providers");
  for (const name of PROVIDERS) {
    const li = el("li");
    li.textContent = name;
    providerList.appendChild(li);
  }
  coverage.append(covH2, covP, providerList);
  root.appendChild(coverage);

  // ── Rule: how a reading is decided. The credibility section — the actual
  // availability knob, shown with real status chips. Not an icon-card grid. ──
  const rule = el("section", "lp-section lp-rule");
  const ruleH2 = el("h2", "lp-h2");
  ruleH2.textContent = "How a reading is decided";
  const ruleP = el("p", "lp-section__lede");
  ruleP.textContent =
    "One rule, applied the same way every five minutes — so planned work and our own fetch " +
    "failures never fake an outage or a perfect 100%. The reading is also US-scoped: a purely " +
    "non-US incident stays visible on a provider's tile but never moves the overall reading.";
  rule.append(ruleH2, ruleP);
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

  // ── Final CTA: restate the one action (level-2 secondary, so the hero stays
  // the single most-prominent CTA on the page). ──
  const final = el("section", "lp-final");
  const finalH2 = el("h2", "lp-final__title");
  finalH2.textContent = "See the live reading";
  const finalSub = el("p", "lp-final__sub");
  finalSub.textContent =
    "The full dashboard adds per-provider incidents, 90-day uptime, and recent history — " +
    "opt-in detail, never in the way of the answer.";
  const finalActions = el("div", "lp-final__actions");
  finalActions.appendChild(ctaLink("Open the live dashboard", "secondary"));
  final.append(finalH2, finalSub, finalActions);
  root.appendChild(final);

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

function stateMessage(text: string): HTMLElement {
  const div = el("div", "lp-panel__state");
  div.textContent = text;
  return div;
}
