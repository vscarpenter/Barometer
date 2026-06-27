# Handoff: Barometer — “Almanac” redesign

A complete, self-sufficient spec to restyle the **existing** Barometer web frontend
(`packages/web`) into the approved **Direction A “Almanac”** design: a clean, modern
status page with the weather-station metaphor kept as a tasteful accent, distinctive
typography, a refined barometer icon, and a light/dark theme toggle.

A developer (or Claude Code) who was **not** in the original design conversation should be
able to implement this from this README alone.

---

## Overview

Barometer is a static dashboard (vanilla TypeScript + Vite) that answers “is the internet
healthy right now?” It polls `/status/summary.json` every 60s and reads
`/history/recent.json` for sparklines. The current UI works but reads like a default
template. This redesign keeps **all existing behavior, data flow, and DOM architecture**
and changes only the **visual layer**: tokens, typography, the icon, the headline
treatment, and a new theme toggle.

**Nothing about the engine, polling, schemas, or availability rules changes.**

---

## About the design files

The files in this bundle are **design references**, not production code to ship verbatim:

| File | What it is |
|---|---|
| `almanac-reference.html` | **Source of truth.** A standalone, self-contained build of the Almanac dashboard (both themes, working toggle, real demo data). Its `<style>` block maps 1:1 to `styles.css`; its `:root` blocks map 1:1 to `tokens.css`; its render functions mirror the `src/render/*` modules. Open it and click the toggle. |
| `tokens.css` | **Drop-in** replacement for `packages/web/src/tokens.css`. |
| `barometer-dial.svg` | The redesigned app icon (standalone SVG asset). |
| `README.md` | This document. |

The task is to **recreate the Almanac design inside `packages/web` using its existing
vanilla-TS render modules + CSS-custom-property token system** — not to drop the HTML in.
The codebase already has exactly the right structure for this (a `tokens.css` token layer,
small `render/*.ts` DOM builders, a `styles.css`), so the change is surgical.

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, and the headline/scale treatment are
final. Match them exactly. Hex values, font families, and sizes below are authoritative.

---

## The redesign at a glance

**Keep as-is:** the polling loop (`poll.ts`), schema validation, the stale-data banner
(`render/banner.ts`), status labels + icon glyphs (`render/status.ts`), the sparkline
concept (`render/sparkline.ts`), the card structure (`render/card.ts`), empty/error states,
and the 1100px centered app shell.

**Change:**
1. **Type** → Space Grotesk (display), Hanken Grotesk (body/UI), JetBrains Mono (figures).
2. **Color** → a calmer, AA-minded palette with deeper status hues; light is now the
   default, dark is a toggle (was: dark default via `prefers-color-scheme`).
3. **Icon** → the generic circle-with-tick becomes a barometer dial (cyan instrument +
   ember needle).
4. **Headline / reading band** → replace the small dial gauge with a large weather word
   plus a horizontal **Stormy → Fair pressure scale** with a marker at the current reading.
5. **Theme toggle** → a new light/dark control in the masthead, persisted to `localStorage`,
   defaulting to the OS preference on first visit.
6. **Polish** → softer radii (cards 14px, band 18px), refined shadows, status pills with
   icon + tinted background, mono uptime figures.

---

## Design tokens

All semantic token **names are unchanged** from the current `tokens.css` (so `styles.css`
keeps resolving). Three are **added**: `--font-display`, `--accent`, and the existing
`--font-mono` is now actually used. Full values are in the provided `tokens.css`; summary:

### Light (default)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f3f5f8` | page background |
| `--bg-grad` | `radial-gradient(125% 70% at 50% -15%, color-mix(in oklab, var(--brand) 7%, transparent), transparent 60%)` | faint atmospheric glow over `--bg` |
| `--surface` | `#ffffff` | cards, reading band |
| `--surface-2` | `#f6f8fb` | toggle, insets |
| `--border` | `#e6eaf0` | card/band borders |
| `--border-soft` | `#eef1f6` | inner dividers (uptime rule) |
| `--text` | `#18212e` | primary text |
| `--text-muted` | `#586478` | secondary text |
| `--text-faint` | `#8a94a6` | labels, footer |
| `--brand` | `#0d7a99` | barometric cyan (the instrument) |
| `--accent` | `#c2632c` | ember (the needle) |
| `--status-operational` | `#15885c` | up / Fair |
| `--status-degraded` | `#9a6c12` | Changeable |
| `--status-partial_outage` | `#b4551f` | Unsettled |
| `--status-major_outage` | `#bf3d37` | Stormy |
| `--status-maintenance` | `#2a6fb8` | Planned |
| `--status-unknown` | `#646f82` | instrument fault |

### Dark (`<html data-theme="dark">`)

| Token | Value |
|---|---|
| `--bg` | `#0a0e15` |
| `--surface` | `#121925` |
| `--surface-2` | `#0e1521` |
| `--border` | `#243042` |
| `--border-soft` | `#1b2533` |
| `--text` | `#e8eef6` |
| `--text-muted` | `#9aa7b9` |
| `--text-faint` | `#647184` |
| `--brand` | `#56c7e8` |
| `--accent` | `#ec8b4f` |
| `--status-operational` | `#2fbf8c` |
| `--status-degraded` | `#e6bd4d` |
| `--status-partial_outage` | `#ef8a4c` |
| `--status-major_outage` | `#ef716a` |
| `--status-maintenance` | `#5aa9f0` |
| `--status-unknown` | `#8593a6` |

### Scale / radii / motion (unchanged names, retuned)

`--space-1…8`: `.25/.5/.75/1/1.5/2/3 rem` · `--radius-sm/md/lg/pill`: `8 / 14 / 18 / 999px` ·
`--transition`: `180ms cubic-bezier(.4,0,.2,1)` · `--shadow-1`: `0 1px 2px rgb(16 24 33/.05)`
(light) / `0 1px 2px rgb(0 0 0/.35)` (dark) · `--shadow-2`: `0 10px 30px -14px rgb(20 40 70/.14)`
(light) / `0 12px 32px -14px rgb(0 0 0/.6)` (dark).

---

## Typography

| Role | Family | Token | Used on |
|---|---|---|---|
| Display | **Space Grotesk** 600 | `--font-display` | masthead wordmark (`h1`), reading weather word, card names |
| Body / UI | **Hanken Grotesk** 400–600 | `--font-sans` | everything else, body default |
| Mono | **JetBrains Mono** 500 | `--font-mono` | uptime figures (`.card__uptime dd`), any tabular numbers |

**Loading.** Quick start — add to `index.html <head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
```

**Production recommendation:** Barometer is a privacy-minded static site on CloudFront, so
prefer **self-hosting** over a third-party CDN. Install `@fontsource/space-grotesk`,
`@fontsource/hanken-grotesk`, `@fontsource/jetbrains-mono` and `import` the needed weights
in `main.ts` (Vite will hash + bundle them, and they ship under the immutable `/app` prefix).
Either way, the `--font-*` stacks already include `ui-sans-serif`/`system-ui` fallbacks.

---

## Iconography & assets

**App mark — barometer dial.** A circle dial with three quadrant ticks and a needle swung
up-right toward “fair.” The dial uses `currentColor` (so it inherits `--brand` in the
masthead); the needle is `--accent` (ember). Source: `barometer-dial.svg` (in this bundle).

- **Masthead:** render inline (see `main.ts` changes) at 30×30, container `color: var(--brand)`.
- **Favicon:** replace the `<link rel="icon">` data-URI in `index.html` with the dial
  (fixed colors so it reads on any browser chrome):

```html
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='8.4' stroke='%231593b8' stroke-width='1.7'/%3E%3Cpath d='M12 12L16.8 7.6' stroke='%23d27a3f' stroke-width='1.9'/%3E%3Ccircle cx='12' cy='12' r='1.6' fill='%231593b8'/%3E%3C/svg%3E" />
```

**Status glyphs** (check / cloud / alert-triangle / bolt / wrench / help) in
`render/status.ts` are **unchanged** — they’re already the right line-icon set. They’re used
in the card LED, the status pill, and the reading-band icon.

---

## File-by-file implementation

> Paths are relative to `packages/web/`. Where full code is given, it’s drop-in. The
> authoritative CSS/markup is `almanac-reference.html`; snippets below extract the parts
> that change.

### 1. `index.html`

- Add the three font `<link>`s (above).
- Replace the favicon data-URI (above).
- Change `<meta name="color-scheme" content="dark light" />` → `content="light dark"`.
- Add a **theme bootstrap** inline script in `<head>` **before** the stylesheet, to set
  `data-theme` before first paint (no flash):

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('barometer-theme');
      if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
</script>
```

### 2. `src/tokens.css`

Replace the whole file with the provided `tokens.css`. Key differences from today:
semantic colors retuned (table above); **light is the default** block and **dark moves to
`:root[data-theme="dark"]`** (instead of `@media (prefers-color-scheme: light)`); adds
`--font-display` and `--accent`; softer radii/shadows. Components still consume only
semantic tokens, so no component needs new token names.

### 3. `src/styles.css`

Adopt the rules from `almanac-reference.html`’s `<style>` (everything **after** the two
`:root` token blocks — those belong to `tokens.css`). The mechanical changes:

- `body { font-family: var(--font-sans); }` (now Hanken) — already the case via token.
- **Masthead:** `.masthead__titles h1 { font-family: var(--font-display); font-weight: 600; font-size: 1.18rem; }`. Shrink `.masthead__mark` to `30px` and set `color: var(--brand)`. Wrap the right-hand block in `.masthead__right` (flex, gap `--space-4`) holding status + the new toggle. Add `.masthead__dot` glow:
  `box-shadow: 0 0 0 3px color-mix(in oklab, var(--status-operational) 20%, transparent);`
- **New — theme toggle:**
  ```css
  .theme-toggle {
    display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
    font: 500 .75rem var(--font-sans); color: var(--text-muted);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-pill); padding: 6px 12px;
  }
  .theme-toggle:hover { color: var(--text); }
  ```
- **Reading band (the headline) — replaces the old grid/gauge layout.** Full CSS:
  ```css
  .reading {
    position: relative; overflow: hidden;
    border: 1px solid var(--border); border-radius: var(--radius-lg);
    background: var(--surface); box-shadow: var(--shadow-2);
    padding: var(--space-6); margin-block-end: var(--space-6);
  }
  .reading::before { /* faint glow tinted by the current reading (--c) */
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(125% 130% at 11% -25%, color-mix(in oklab, var(--c) 13%, transparent), transparent 56%);
  }
  .reading__inner { position: relative; }
  .reading__top { display: flex; align-items: center; gap: var(--space-3); }
  .reading__icon { color: var(--c); display: flex; }
  .reading__weather {
    margin: 0; font-family: var(--font-display); font-weight: 600;
    font-size: clamp(2rem, 4vw, 2.6rem); letter-spacing: -.025em; line-height: 1; color: var(--text);
  }
  .reading__sub { margin: var(--space-3) 0 var(--space-5); color: var(--text-muted); font-size: .95rem; }
  .reading__count { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
  .reading__scale { position: relative; block-size: 9px; }
  .reading__scale-track {
    position: absolute; inset: 0; border-radius: var(--radius-pill);
    background: linear-gradient(90deg, var(--status-major_outage), var(--status-partial_outage) 34%, var(--status-degraded) 62%, var(--status-operational));
  }
  .reading__marker {
    position: absolute; top: -4px; transform: translateX(-50%);
    inline-size: 3px; block-size: 17px; border-radius: 3px;
    background: var(--text); box-shadow: 0 0 0 2.5px var(--surface); /* left set inline */
  }
  .reading__scale-labels {
    display: flex; justify-content: space-between; margin-block-start: 9px;
    font-size: .625rem; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--text-faint);
  }
  ```
  You can delete the old `.reading__gauge` / `.reading__label` rules (replaced by
  `.reading__weather` etc.). `.reading` keeps using `--c` set by the headline module.
- **Cards:** add `.card__name { font-family: var(--font-display); font-weight: 600; }`,
  shrink `.card__led` to 24px, set status pill font to `.69rem`, and make
  `.card__uptime dd { font-family: var(--font-mono); }`. Border radius comes from
  `--radius-md` (now 14px). Hover stays `translateY(-2px)` + tinted border. Everything else
  in `.card*` is unchanged from today; see the reference for exact values.

### 4. `src/render/headline.ts` — replace the dial gauge with the pressure scale

Delete `renderGauge` and the `NEEDLE_ANGLE` map. Replace `renderHeadline` with:

```ts
import type { OverallReading, ProviderStatus } from "@barometer/types";
import { el } from "./dom.js";
import { statusLabel, makeStatusIcon } from "./status.js";

// Needle position on the Stormy→Fair pressure scale, as % from the left.
// maintenance/unknown don't worsen the reading (SPEC §4), so they read "fair".
const SCALE_POS: Record<ProviderStatus, number> = {
  major_outage: 8,
  partial_outage: 34,
  degraded: 62,
  operational: 90,
  maintenance: 90,
  unknown: 50,
};

const SCALE_LABELS = ["Stormy", "Unsettled", "Changeable", "Fair"] as const;

/** The Almanac reading band: weather word + Stormy→Fair pressure scale (SPEC §8/§9). */
export function renderHeadline(overall: OverallReading): HTMLElement {
  const section = el("section", "reading");
  section.setAttribute("data-status", overall.status);
  section.setAttribute("aria-label", `Overall internet health: ${statusLabel(overall.status)}`);
  section.style.setProperty("--c", `var(--status-${overall.status})`);

  const inner = el("div", "reading__inner");

  const top = el("div", "reading__top");
  const icon = el("span", "reading__icon");
  icon.setAttribute("aria-hidden", "true");
  icon.appendChild(makeStatusIcon(overall.status, 26));
  const weather = el("h2", "reading__weather");
  weather.textContent = overall.label;
  top.append(icon, weather);

  const sub = el("p", "reading__sub");
  const count = el("span", "reading__count");
  count.textContent = `${overall.providersOperational} of ${overall.providersTotal}`;
  sub.append(count, document.createTextNode(` providers operational · ${statusLabel(overall.status)}`));

  const scale = el("div", "reading__scale");
  scale.appendChild(el("div", "reading__scale-track"));
  const marker = el("div", "reading__marker");
  marker.style.left = `${SCALE_POS[overall.status]}%`;
  scale.appendChild(marker);

  const labels = el("div", "reading__scale-labels");
  for (const t of SCALE_LABELS) {
    const span = el("span");
    span.textContent = t;
    labels.appendChild(span);
  }

  inner.append(top, sub, scale, labels);
  section.appendChild(inner);
  return section;
}
```

The scale track is a fixed Stormy→Fair gradient (decorative axis); the marker conveys the
reading and the **label + count text still carry the meaning** (color is never the only
signal, SPEC §8).

### 5. `src/main.ts` — masthead mark, theme toggle, persistence

**(a) Replace the masthead mark** inside `buildMasthead`. Swap the two generic paths for the
barometer dial and add the ember needle:

```ts
const mark = svgEl("svg");
mark.classList.add("masthead__mark");
mark.setAttribute("viewBox", "0 0 24 24");
mark.setAttribute("fill", "none");
mark.setAttribute("stroke-linecap", "round");
mark.setAttribute("stroke-linejoin", "round");
mark.setAttribute("aria-hidden", "true");
// dial + ticks inherit currentColor (--brand via .masthead__mark)
for (const d of ["M12 3.2V4.6", "M20.5 12H19.1", "M3.5 12H4.9"]) {
  const tick = svgEl("path");
  tick.setAttribute("d", d);
  tick.setAttribute("stroke", "currentColor");
  tick.setAttribute("stroke-width", "1.4");
  tick.setAttribute("opacity", "0.5");
  mark.appendChild(tick);
}
const ring = svgEl("circle");
ring.setAttribute("cx", "12"); ring.setAttribute("cy", "12"); ring.setAttribute("r", "8.4");
ring.setAttribute("stroke", "currentColor"); ring.setAttribute("stroke-width", "1.7");
const needle = svgEl("path");
needle.setAttribute("d", "M12 12L16.8 7.6");
needle.setAttribute("stroke", "var(--accent)"); needle.setAttribute("stroke-width", "1.9");
const hub = svgEl("circle");
hub.setAttribute("cx", "12"); hub.setAttribute("cy", "12"); hub.setAttribute("r", "1.55");
hub.setAttribute("fill", "currentColor");
mark.append(ring, ...mark.childNodes.length ? [] : [], needle, hub); // append ring first, then needle, hub
```
*(Simplest is to append in order `ring`, the three `tick`s, `needle`, `hub`.)* Ensure
`.masthead__mark { color: var(--brand); }` in CSS.

**(b) Restructure the masthead right side** so it holds the status block **and** a toggle:

```ts
const right = el("div", "masthead__right");
const status = el("div", "masthead__status");
status.append(dot, updated);
right.append(status, buildThemeToggle());
header.append(mark, titles, right);
```

**(c) Add the toggle + theme helpers** (new code in `main.ts`):

```ts
const THEME_KEY = "barometer-theme";
type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function applyTheme(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: ignore */ }
}

function themeGlyph(theme: Theme): SVGElement {
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15"); svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2"); svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  const paths = theme === "dark"
    ? ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"]               // moon (currently dark)
    : ["M12 2v2","M12 20v2","M2 12h2","M20 12h2","M4.9 4.9l1.4 1.4",
       "M17.7 17.7l1.4 1.4","M19.1 4.9l-1.4 1.4","M6.3 17.7l-1.4 1.4"]; // sun rays
  if (theme !== "dark") {
    const c = svgEl("circle");
    c.setAttribute("cx","12"); c.setAttribute("cy","12"); c.setAttribute("r","4");
    svg.appendChild(c);
  }
  for (const d of paths) { const p = svgEl("path"); p.setAttribute("d", d); svg.appendChild(p); }
  return svg;
}

function buildThemeToggle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "theme-toggle";
  btn.type = "button";
  const label = el("span");
  const sync = () => {
    const t = currentTheme();
    btn.setAttribute("aria-label", `Switch to ${t === "dark" ? "light" : "dark"} theme`);
    btn.replaceChildren(themeGlyph(t), label);
    label.textContent = t === "dark" ? "Dark" : "Light";
  };
  btn.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    sync();
  });
  sync();
  return btn;
}
```

`data-theme` is already set pre-paint by the bootstrap script in `index.html`, so the toggle
only flips + persists. Switching themes needs **no re-render** — every color is a CSS
variable, so the attribute swap restyles the whole page instantly (respect
`prefers-reduced-motion`; there’s no transition to add here).

> Optional nicety: keep open tabs in sync with OS changes when the user hasn’t chosen —
> `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', …)` and only apply
> if `localStorage[THEME_KEY]` is unset.

### 6. `src/render/sparkline.ts` (optional polish)

Keep the module. To match the Almanac’s calmer baseline, set the bar height map to a lower
operational floor and slightly taller spikes, and thin the bars:

```ts
const HEIGHT: Record<ProviderStatus, number> = {
  operational: 0.20, maintenance: 0.36, unknown: 0.30,
  degraded: 0.55, partial_outage: 0.78, major_outage: 1,
};
// in the loop: rect width 0.6 (was 0.84), x = i + 0.2, rx 0.07
```
Set `.card__spark { block-size: 30px; }` in CSS. Color still comes from
`var(--status-${status})` — no change there.

### 7. `src/render/card.ts`, `src/render/status.ts`, `src/render/banner.ts`

**No structural changes.** `card.ts` already emits `.card__head` (LED + name + pill),
optional `.card__incident`, sparkline, and the 24H/7D/30D/90D `.card__uptime` grid — the
redesign is pure CSS over that markup. `status.ts` labels + glyphs are reused verbatim.
`banner.ts` (stale-data guard) is unchanged; it already styles from tokens.

---

## Interactions, states & behavior

- **Polling / freshness:** unchanged. `updated Xs ago`, 60s interval + refocus refresh,
  the 15-minute stale banner, and the masthead dot tinted to overall status all stay.
- **Theme toggle:** click flips light⇄dark, persists to `localStorage["barometer-theme"]`,
  and applies instantly via the `data-theme` attribute. First visit follows the OS setting.
- **Card hover:** `translateY(-2px)` + border tints toward the card’s status color
  (`color-mix(in oklab, var(--c) 45%, var(--border))`). Disabled under reduced motion.
- **Incident links:** unchanged — only `http(s)` URLs become anchors (the existing
  allowlist in `card.ts`), otherwise plain text.
- **Empty / error / loading:** unchanged (`stateMessage(...)`), now styled by the new tokens.
- **Responsive:** the grid stays `repeat(auto-fit, minmax(15.5rem, 1fr))`; the reading band
  is single-column and reflows naturally; masthead wraps (`flex-wrap`).

## Accessibility

- Maintain WCAG AA: the light status hues were **deepened specifically** for AA on white and
  on the ~13% tinted pill backgrounds; the dark hues are tuned for `--surface` `#121925`.
- Color is never the only signal — every status keeps its **icon + text label** (pill, LED,
  reading-band icon).
- Toggle is a real `<button>` with a dynamic `aria-label`; focus-visible outline uses
  `--brand` (keep the existing `:where(a,button):focus-visible` rule).
- The pressure-scale gradient/marker are decorative; the `aria-label` on `.reading` and the
  visible count + label carry the meaning.

---

## Acceptance criteria / QA checklist

- [ ] Fonts load (Space Grotesk wordmark + weather word; Hanken body; **mono** uptime figures).
- [ ] Favicon and masthead show the **barometer dial** (cyan dial, ember needle).
- [ ] Reading band shows the weather word + `X of Y providers operational · <label>` + the
      **Stormy→Fair pressure scale** with the marker at the right position
      (partial_outage → ~34%).
- [ ] Cards: status pill (icon + label + tinted bg), 2-line incident clamp, sparkline,
      mono 24H/7D/30D/90D; Vercel’s 24H shows `—` (null), not `100%`.
- [ ] Theme toggle flips light⇄dark instantly, **persists across reload**, and first visit
      matches the OS preference. No flash of the wrong theme on load.
- [ ] AA contrast holds in **both** themes; status meaning is never color-only.
- [ ] Stale banner, empty, and error states still render and are legibly styled.
- [ ] `bun run typecheck` and `bun run test` pass (no behavior changed; only `headline.ts`
      output structure changed — update `test/render.test.ts` expectations if they assert the
      old `.reading__gauge`/`.reading__label` DOM).
- [ ] Compare side-by-side against `almanac-reference.html` in both themes.

---

## Files in this bundle

- `almanac-reference.html` — standalone reference (open in a browser; the source of truth).
- `tokens.css` — drop-in for `packages/web/src/tokens.css`.
- `barometer-dial.svg` — the app icon asset.
- `README.md` — this document.
