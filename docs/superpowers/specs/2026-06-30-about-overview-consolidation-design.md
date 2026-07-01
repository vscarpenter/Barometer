# Design: Consolidate Overview + About into one page

**Date:** 2026-06-30
**Status:** Approved (design gate passed — user chose "Unify into one page" + "Live hero, quiet CTA")
**Scope:** Merge the marketing "Overview" page (`landing.html`) and the reference "About"
page (`about.html`) into a single `/about.html`. Frontend-only; no engine, infra, or
Terraform changes. The dashboard (`index.html`) is untouched.

---

## Problem

The site has three pages sharing one footer nav — **Home** (`index.html`, the live
dashboard, owns `/`), **Overview** (`landing.html`, a marketing page added 2026-06-29),
and **About** (`about.html`, a reference page). Overview and About overlap heavily because
the marketing page was added *after* the reference page without re-drawing the boundary
between them.

**Concretely duplicated across the two pages:**

| Topic | Overview (`landing.html`) | About (`about.html`) |
|---|---|---|
| Value-prop / tagline | Hero headline + subhead | Header lede |
| What it watches | `PROVIDERS` list + DNS lede | `PROVIDERS` list |
| The availability rule | "How a reading is decided" — status **chips** | "How a provider counts" — **prose** |

(The `PROVIDERS` array is already a single shared constant — `aboutPage.ts` exports it and
`landingPage.ts` imports it — so the engineering DRY is done. What's duplicated is the
*presentation* and the *editorial job*.)

**Distinct to each:** Overview owns the live hero (real reading band wired to
`summary.json`), conversion CTAs, and the chip visualization of the rule. About owns "How
it works" (the Lambda→S3→poll pipeline), the theme-aware architecture diagram, and the
open-source colophon.

**The structural catch that justifies unifying:** there is no cold-entry path to Overview.
No sitemap/robots, and nothing external links `/landing.html` (or `/about.html`) — verified
by repo-wide grep. The *only* link to "Overview" is the shared footer, which renders
*inside the dashboard*. So Overview's marketing job (convert a cold visitor → open the
dashboard) fires at people who are already inside the product, and its CTAs point back to
where they came from. In a dashboard-first site, Overview and About are two answers to the
same question — "what is this and how does it work?" — so they should be one page.

## Goal

One page at `/about.html` that keeps the best of both: the live reading band and chip-based
rule from Overview, plus the pipeline explanation, architecture diagram, and open-source
section from About — with each fact appearing exactly once. Footer nav collapses to
**Home · About**.

---

## Design decisions (resolved during brainstorming)

| Question | Decision | Rationale |
|---|---|---|
| One page or two? | **Unify into one** (`/about.html` survives) | Overlap is symptomatic of a weak/circular marketing funnel; the dashboard already owns `/`. |
| Keep the live hero? | **Yes** | It's honest live proof, on-brand, and the user values it. Makes the unified page a *live* page (poller-driven). |
| How much CTA scaffolding? | **One quiet CTA** ("Open the dashboard →") | Nobody deep-links the page; every visitor arrives from the dashboard, so multiple "open the dashboard" CTAs are noise. |
| Rule presentation | **Chips** (from Overview), drop About's prose version | The chip treatment is more visual and can't drift from the engine's status vocabulary. |
| Retired `/landing.html` | **Meta-refresh stub** → `/about.html` | Zero external links, so a hard delete is safe; a ~10-line stub is near-free insurance against stale cached bundles clicking the old footer link during the deploy window. No infra/CloudFront-function change. |
| CSS class names | **Keep `lp-*` in place** (now belong to About); prune dead blocks | A full rename to `about__*` is churn for no functional gain; smaller diff, lower risk. |

---

## The unified page

A single-column page, top → bottom. It is a **live** page: it follows the current
`landing.ts` lifecycle (60s poll + 1s freshness tick), not the static `about.ts` mount.

| # | Section | Source | Notes |
|---|---|---|---|
| — | Nav: `← Dashboard` back link + theme toggle | About | Drop the landing wordmark/ghost-CTA nav. |
| 1 | **Hero** — "Is the internet *healthy* right now?" + value-prop subhead + **live reading band** | Overview | No CTA in the hero; the live band is the hook. |
| 2 | **What it watches** — `PROVIDERS` list (×1) + DNS-probe lede | shared | Overview's fuller lede (mentions active DNS probes) wins. |
| 3 | **How a reading is decided** — status **chips** (Counts as up / Counts as down / Never counted) + US-scope sentence | Overview | Canonical form; About's prose "How a provider counts" is removed. |
| 4 | **How it works** — reads every 5 min, normalized, weather labels presentation-only; Lambda → S3 → dashboard polls JSON; no server, no DB | About | Overview lacked this. |
| 5 | **Architecture** — theme-aware SVG diagram + caption | About | Both light/dark variants in DOM, CSS shows the active theme's. |
| 6 | **Open source** — vanilla TS / serverless AWS / GitHub link | About | |
| 7 | **One quiet CTA** — `Open the dashboard →` | trimmed | Replaces Overview's primary + secondary + ghost + final-CTA band. |
| — | Footer (`Home · About`) | shared | `buildFooter("about")`. |

**Deleted content (not hidden):** the secondary/ghost/final CTAs, the trust line
("Free · no sign-up · every 5 minutes"), About's prose rule section, and the now-unused
landing-only CSS.

**Preserved behavior:** keep-last-good-reading on a transient poll blip; the `Live →
Updated Ns ago` freshness tick; the theme-aware diagram; and the single `PROVIDERS` source
of truth.

---

## File changes

**Render module — `src/render/aboutPage.ts` becomes the unified page.**
Export `createAboutPage(): { element, update, tick }` (the live-page interface currently in
`landingPage.ts`, renamed for About). It absorbs from `landingPage.ts`: the live hero
(`createHeadline()` band + panel + `Live/Updated Ns ago` label), `statusChip`,
`RULE_GROUPS`, and the poll-state messaging. It keeps from `aboutPage.ts`: `PROVIDERS`
(still exported for tests / single-source clarity), `diagram()`, and the "How it works" /
"Open source" sections. The `brandMark()` and multi-CTA helpers are dropped (only the one
quiet CTA link remains).

**Entry — `src/about.ts` absorbs `src/landing.ts`.**
Add the brand-font imports, `createPoller` wiring against `/status/summary.json`, the
keep-last-good-reading closure, `page.update(null,false)` + `poller.start()`, and the
`setInterval(() => page.tick(), 1000)` freshness ticker. Drop the theme toggle into the
About nav container. Append `buildFooter("about")`.

**Deletions:**
- `src/render/landingPage.ts` — removed (content folded into `aboutPage.ts`).
- `src/landing.ts` — removed (folded into `about.ts`).
- `landing.html` — replaced with a minimal meta-refresh stub → `/about.html`.

**`packages/web/vite.config.ts`** — **keep** the `landing` rollup input, now pointing at the
tiny meta-refresh stub `landing.html` (no `src/landing.ts` module reference in it), so the
build still emits `dist/landing.html`. Only the page's *content* changes, not the input map.

**`src/render/footer.ts`** — `FooterPage` type drops `"landing"`; the `PAGES` array drops
the Overview row → **Home · About**.

**CSS (`src/styles.css`)** — keep `lp-*` names; prune the blocks that no longer render:
`.lp-final*`, `.lp-hero__trust`, `.lp-nav`/`.lp-brand`/`.lp-nav__right`, and the extra
`.lp-cta--*` variants beyond the single quiet CTA. Keep `.lp-hero`, `.lp-panel*`,
`.lp-chip*`, `.lp-rule*`, and the surviving `.lp-cta` used by the unified page. The About
sections continue to use `about__*` (`about__section`, `about__figure`, `about__diagram`).

---

## Tests (TDD)

- **`test/aboutPage.test.ts`** — rewrite for the unified page: hero headline + live panel
  slot present; `PROVIDERS` list rendered once; the three rule chip-groups render with the
  right statuses; the diagram (both variants) and open-source link present. Assert the live
  `update()` mounts the reading band and `tick()` ages the label.
- **`test/footer.test.ts`** — update: expect **Home · About** only; remove all
  Overview/`landing.html` assertions.
- **`test/landing.smoke.test.ts`** — delete (page removed).
- **`test/about.smoke.test.ts`** — update: the About entry now mounts a live page; assert it
  mounts without crashing and the live panel slot exists.
- **`test/main.smoke.test.ts`** — verify it still only asserts the `/about.html` footer link
  (no `/landing.html`).

Run `bun run test` + `bun run typecheck` + a production `vite build` to confirm the unified
page mounts and the build emits `about.html` (+ the `landing.html` stub) with no `landing`
entry chunk.

---

## Out of scope

- Any change to the dashboard (`index.html` / `main.ts`).
- Engine, infra, Terraform, CloudFront behaviors/functions.
- A real HTTP 301 for `/landing.html` (meta-refresh stub is sufficient given zero external
  links; a CloudFront-function 301 is not worth the infra change).
- The full `lp-*` → `about__*` rename (deliberately deferred; keep the diff small).

## Risks / mitigations

- **Stale cached dashboard bundle clicks "Overview" during deploy** → the meta-refresh stub
  at `landing.html` catches it. After the new footer ships, the link is gone entirely.
- **Live poller now runs on the About page** → it already ran on the identical Overview page;
  same `createPoller` + keep-last-good pattern, no new failure mode.
- **Mixed `lp-*` / `about__*` classes on one page** → cosmetic inconsistency only; documented,
  and the dead `lp-*` blocks are pruned so nothing unused lingers.
