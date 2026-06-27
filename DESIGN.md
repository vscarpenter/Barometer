---
name: Barometer
description: A calm weather-instrument dashboard that answers "is the internet healthy right now?"
colors:
  brand: "#0d7a99"
  accent: "#c2632c"
  bg: "#f3f5f8"
  surface: "#ffffff"
  surface-2: "#f6f8fb"
  border: "#e6eaf0"
  border-soft: "#eef1f6"
  text: "#18212e"
  text-muted: "#586478"
  text-faint: "#8a94a6"
  status-operational: "#15885c"
  status-degraded: "#9a6c12"
  status-partial_outage: "#b4551f"
  status-major_outage: "#bf3d37"
  status-maintenance: "#2a6fb8"
  status-unknown: "#646f82"
typography:
  display:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4vw, 2.6rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.07em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.81rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "14px"
  lg: "18px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "8": "48px"
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
  reading-band:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "32px"
  status-pill:
    textColor: "{colors.status-operational}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  provider-dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "24px"
  theme-toggle:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  dialog-close:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.8rem"
---

# Design System: Barometer

## 1. Overview

**Creative North Star: "The Almanac"**

Barometer is a weather instrument for the internet, and the interface is built to be read the way you read a real barometer: one glance, no deciphering. A swept needle on a Stormy-to-Fair dial gives the verdict; everything else (the per-provider tiles, the 90-day uptime bars, the drill-down) is the fine print you consult only when the needle has already told you something is wrong. The system is light-first, cool, and quiet at rest, with one warm note (the ember needle) and one piece of instrument chrome (barometric cyan). It carries a real light/dark pair driven by a manual toggle, not the OS preference.

The whole system is organized around restraint as information. Healthy is near-monochrome: ink on a faintly blue-tinted off-white, hairline borders, almost no shadow. Color is not decoration here, it is signal, so it is rationed. Each surface that reports a status sets a single `--c` custom property to the live status hue, and every tint on that surface (a 13% pill fill, a 45% hover-border blend, the faint glow behind the headline) is derived from `--c` through `color-mix(in oklab, …)`. Nothing is painted a fixed status color by hand. The payoff: when one provider goes red, it is the only red on the page, and the eye lands on it instantly precisely because the resting field is so calm.

This explicitly rejects the four things a monitoring dashboard usually becomes. It is not a **generic SaaS dashboard** (no gradient cards, no big-hero-metric template, no endless identical icon-heading-text grids). It is not a **status-page clone** (Barometer normalizes nine Atlassian-Statuspage-style feeds; it must not look like one of them). It is not **alarmist red-everywhere** monitoring (severity is earned and proportionate, never the resting mood). And it is not a **neon dev-tool dark mode** (light is the designed default; dark is an equal, deliberate variant, not a "looks technical" costume).

**Key Characteristics:**
- Light-first, cool neutral field with a single warm accent (the ember needle).
- Status color is rationed and derived from one `--c` variable, never hardcoded per component.
- Numbers are monospace and tabular so live-polling values never jitter.
- Near-flat elevation; only the headline lifts and cards lift 2px on hover.
- A real, designed dark theme (manual toggle, set before first paint), not an inverted afterthought.

## 2. Colors

A cool, near-monochrome neutral field with barometric cyan as instrument chrome, an ember accent for the needle, and a six-step status ramp that is the only saturated color most of the time.

### Primary
- **Barometric Cyan** (`#0d7a99` light / `#56c7e8` dark): The instrument's chrome. The masthead barometer mark, focus rings, the dial's tick marks, and links. It reads as "the device," not as a status. Deepened in light mode for AA on white; brightened in dark mode.

### Secondary
- **Ember** (`#c2632c` light / `#ec8b4f` dark): The needle, and the "offenders" callout under the reading. The single warm note in an otherwise cool system. Used almost nowhere else on purpose.

### Tertiary (Status ramp)
The functional palette. Six hues, deepened for AA on light surfaces and brightened for dark. Each is exposed to components through the live `--c` variable, never applied as a flat fill.
- **Operational Green** (`#15885c` / `#2fbf8c`): Up. The only "good" color.
- **Degraded Amber** (`#9a6c12` / `#e6bd4d`): Reduced but serving.
- **Partial-Outage Rust** (`#b4551f` / `#ef8a4c`): A real partial outage.
- **Major-Outage Red** (`#bf3d37` / `#ef716a`): The page's loudest color. Also tints the stale-data banner.
- **Maintenance Blue** (`#2a6fb8` / `#5aa9f0`): A hold state, excluded from the reading. Visibly *not* an outage.
- **Unknown Slate** (`#646f82` / `#8593a6`): A feed we could not read. Neutral on purpose; honesty, not a guess.

### Neutral
- **Ink** (`#18212e` / `#e8eef6`): Body text and headings. AA+ on every surface.
- **Muted Ink** (`#586478` / `#9aa7b9`): Secondary copy, sub-text, captions.
- **Faint Ink** (`#647083` / `#768396`): Micro-labels, separators, the footer. The lightest text tier, deepened to hold WCAG AA (≥4.5:1) on bg and surface.
- **Body Background** (`#f3f5f8` / `#0a0e15`): The page. A faint cyan radial glow sits at the top.
- **Surface** (`#ffffff` / `#121925`): Cards, the reading band, the dialog.
- **Surface-2** (`#f6f8fb` / `#0e1521`): The theme toggle and other recessed chrome.
- **Border** (`#e6eaf0` / `#243042`) and **Border-Soft** (`#eef1f6` / `#1b2533`): Hairline 1px dividers; soft is for internal rules (the uptime row).

### Named Rules
**The `--c` Rule.** Status color is never a literal in a component. A surface sets `--c` to its live status hue, and every status-derived tint is `color-mix(in oklab, var(--c) <pct>%, …)`. Pill fills sit at ~13%, hover borders at ~45%. Hardcoding a status hex anywhere is forbidden; it breaks the single-source signal.

**The One-Warm-Note Rule.** Ember (`--accent`) appears on the needle and the offenders line, and essentially nowhere else. Its scarcity is what makes the needle the first thing you see. Do not reach for it as a generic highlight.

**The Honest-Neutral Rule.** Unknown is slate and maintenance is blue, both visibly outside the green-to-red severity ramp. A feed we could not read or a planned maintenance window must never borrow operational green or an outage red; the color itself says "not counted."

## 3. Typography

**Display Font:** Space Grotesk (with `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Hanken Grotesk (with `ui-sans-serif, system-ui, -apple-system, sans-serif`)
**Data / Mono Font:** JetBrains Mono (with `ui-monospace, SF Mono, Menlo, monospace`)

**Character:** A geometric-humanist contrast pairing. Space Grotesk's slightly mechanical display cut reads as "instrument faceplate" for the weather verdict and headings; Hanken Grotesk is a warm, highly legible humanist sans for prose; JetBrains Mono carries every number so live-updating figures stay column-aligned. Three families, each with a distinct job, none competing.

### Hierarchy
- **Display** (Space Grotesk 600, `clamp(2rem, 4vw, 2.6rem)`, line-height 1, `-0.025em`): The weather verdict ("Fair", "Stormy") and the About page title. The single largest thing on any screen; ceiling stays well under shouting size.
- **Headline** (Space Grotesk 600, `1.4rem`): The provider name in the drill-down dialog.
- **Title** (Space Grotesk 600, `0.95rem` to `1.18rem`): The masthead wordmark and each provider tile's name.
- **Body** (Hanken Grotesk 400, `0.9rem`–`0.95rem`, line-height 1.5): The reading sub-line and all prose. Capped at ~65ch on the About page.
- **Label** (Hanken Grotesk 600, `0.59rem`–`0.7rem`, `+0.06em` to `+0.08em`, UPPERCASE): Tiny functional micro-labels only: the dial's Stormy/Fair scale ends, the uptime-window headers (24H / 7D / 30D / 90D), and the dialog's section kickers. Never a heading, never body.
- **Data** (JetBrains Mono 500, `0.81rem`, tabular-nums): Every number that updates: uptime percentages, the version string, timestamps.

### Named Rules
**The Tabular Rule.** Any figure that changes on poll (uptime %, provider counts, "updated Ns ago") is rendered with `font-variant-numeric: tabular-nums`, and the reused data values are monospace. Numbers must not reflow or jitter as they refresh.

**The Label-Only-Uppercase Rule.** Uppercase with tracking is reserved for micro-labels of four words or fewer. Headings and section titles are sentence-case display type. Barometer does not put a tracked uppercase eyebrow above every section; uppercase is a functional label treatment, not a decorative kicker.

## 4. Elevation

Near-flat by design. Depth is a signal, not a texture. Surfaces rest on hairline 1px borders and the body's faint cyan top-glow does the atmospheric work; almost nothing casts a real shadow at rest. Two exceptions earn their lift: the reading band (the answer) sits on the soft `shadow-2`, and a provider tile rises 2px on hover to say "this is interactive." Dark mode keeps the same vocabulary with deeper, higher-contrast shadow alphas so the lift still reads on near-black.

### Shadow Vocabulary
- **Hairline** (`box-shadow: 0 1px 2px rgb(16 24 33 / 0.05)` light / `0 1px 2px rgb(0 0 0 / 0.35)` dark): The default for cards and the dialog. Barely there.
- **Lift** (`box-shadow: 0 10px 30px -14px rgb(20 40 70 / 0.14)` light / `0 12px 32px -14px rgb(0 0 0 / 0.6)` dark): The reading band only. Marks the headline as the focal answer.
- **Ring** (`box-shadow: 0 0 0 1px var(--border) inset`): An inset hairline where a border can't be used.

### Named Rules
**The Flat-with-One-Lift Rule.** Surfaces are flat at rest on a 1px border. The reading band is the one element that lifts by default because it is the answer; everything else lifts only as a response to state (hover, focus). A drop shadow used for decoration is forbidden.

## 5. Components

### Cards (provider tiles)
- **Character:** Quiet, scannable, status-aware. The workhorse of the grid.
- **Shape:** 14px radius (`{rounded.md}`), 1px border, 16px padding, `Hairline` shadow.
- **Layout:** `repeat(auto-fit, minmax(15.5rem, 1fr))` grid, 16px gap. A 24px status LED, the provider name, and a tinted status pill on the head row; optional clamped incident line; a 30px sparkline; a 4-column uptime footer (24H/7D/30D/90D) separated by a soft top border.
- **Status pill:** `color-mix(in oklab, var(--c) 13%, transparent)` fill, text in `var(--c)`, pill radius, `3px 9px`. Color comes entirely from `--c`.
- **Hover / Focus:** `translateY(-2px)` and the border blends 45% toward `var(--c)`. Interactive tiles are real buttons with a 2px cyan `:focus-visible` outline.

### Chips (status pill)
- **Style:** Pill radius, status-tinted background at 13% alpha, status-colored text, `0.69rem` weight 600. Carries a label plus a matching icon, never color alone.
- **State:** Reflects the provider's live status hue through `--c`.

### Reading band (signature)
- **Character:** The Almanac headline. Answers the page in one element.
- **Shape:** 18px radius (`{rounded.lg}`), 1px border, 32px padding, `Lift` shadow, `overflow: hidden`.
- **Detail:** A `::before` radial glow tinted by the current reading (`color-mix(in oklab, var(--c) 13%, transparent)`) sits behind the content. Holds the weather word, a plain-language sub-line, and the dial.

### Dial (signature)
- **Character:** The instrument itself. A semicircular Stormy-to-Fair gauge with a swept needle.
- **Behavior:** SVG, `min(100%, 22rem)` wide, centered. The needle eases to the live reading over `0.85s cubic-bezier(0.22, 1, 0.36, 1)` (a soft ease-out, no bounce); reduced-motion snaps it instantly. Uppercase micro-labels mark the scale ends. The masthead carries a tiny echo of the same needle.

### Inputs / Fields
None. Barometer is read-only; it has no forms. The only interactive controls are buttons (tiles, the theme toggle, the dialog close).

### Provider drill-down dialog
- **Style:** Native `<dialog>` (`showModal`), `min(40rem, calc(100vw - 2rem))`, 14px radius, surface background, `Hairline` shadow. Padding lives on an inner `.dlg__body` (24px) so a backdrop click only hits the true backdrop. Backdrop `rgba(8, 12, 20, 0.55)`.
- **Detail:** Display-type title, a pill close button, uppercase section kickers, and impact dots that are neutral faint by default and tint up through degraded/partial/major for minor/major/critical. Focus returns to the originating tile on close.

### Theme toggle
- **Style:** Pill, `surface-2` background, 1px border, `0.75rem`, a sun/moon glyph plus label. Flips `data-theme` on `<html>` and persists to `localStorage`; `theme-init.js` sets the theme before first paint so there is no flash.

### Uptime bar (90-day)
- **Style:** A flat row of flex cells, 2px gap, each `30px` tall with a 2px radius, colored per day's status. A signature data-viz strip, not a card.

### Navigation
- **Style:** Minimal. A masthead wordmark with the barometer mark and a live status dot; the About page uses a single text back-link ("← Dashboard"). No nav bar, no menu.

## 6. Do's and Don'ts

### Do:
- **Do** drive every status color from the live `--c` custom property via `color-mix(in oklab, …)`. Pill fills at ~13%, hover borders at ~45%.
- **Do** keep the resting state near-monochrome so a single red provider is the only saturated thing on the page.
- **Do** render every polling number in JetBrains Mono with `tabular-nums` so it never jitters on refresh.
- **Do** carry status as color **plus** a text label **plus** a distinct icon, always (WCAG: never color alone).
- **Do** reserve uppercase tracked type for micro-labels of four words or fewer.
- **Do** keep surfaces flat on a 1px border; let only the reading band lift by default and tiles lift on hover.
- **Do** treat dark mode as a designed equal: brightened hues, deeper shadow alphas, set before first paint.

### Don't:
- **Don't** build a **generic SaaS dashboard**: no gradient cards, no big-hero-metric template, no endless identical icon-heading-text card grids.
- **Don't** let it become a **status-page clone**. Barometer normalizes Atlassian-Statuspage-style feeds; it must not look like one of them.
- **Don't** go **alarmist red-everywhere**. No red gradients, no sirens, no urgency as the resting mood. Severity is proportionate.
- **Don't** ship a **neon dev-tool dark mode**. Light is the designed default; dark is a deliberate variant, not a "looks technical" costume.
- **Don't** hardcode a status hex in any component; that breaks the `--c` single-source signal.
- **Don't** spend the ember accent as a generic highlight. It belongs to the needle.
- **Don't** use a `border-left`/`border-right` colored stripe as an accent, `background-clip: text` gradient text, or decorative glassmorphism.
- **Don't** put a tracked uppercase eyebrow above every section. Uppercase is a functional label, not a kicker.
