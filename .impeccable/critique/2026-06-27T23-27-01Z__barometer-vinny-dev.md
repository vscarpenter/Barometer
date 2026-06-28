---
target: dashboard
total_score: 34
p0_count: 0
p1_count: 0
timestamp: 2026-06-27T23-27-01Z
slug: barometer-vinny-dev
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | The page *is* a status instrument: weather word + "X of Y operational" + live dial + "updated 3m ago" + stale/down banner. Exemplary. |
| 2 | Match System / Real World | 4 | The barometer/weather metaphor (Stormy→Fair, "Changeable" = degraded) is apt and consistent. |
| 3 | User Control and Freedom | 3 | Read-only surface; theme toggle, drill-down dialog with Esc + focus return. No way to filter/triage the 11 tiles. |
| 4 | Consistency and Standards | 4 | One `--c`-driven status palette, consistent card vocabulary, tabular-nums throughout; hero echoes the masthead's left/right rhythm. |
| 5 | Error Prevention | 3 | The availability rule (maintenance/unknown excluded, region-scoped) prevents false readings. Little user input to guard. |
| 6 | Recognition Rather Than Recall | 4 | Everything visible at a glance; status = icon + label + color; the offenders line names what's wrong. No hidden menus. |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no "problems only" filter, no jump-to-provider. Triage = scan all 11 tiles. The one real gap. |
| 8 | Aesthetic and Minimalist Design | 4 | Near-monochrome resting state, single ember accent reserved for the needle, compact hero, signature dial. No SaaS clichés. |
| 9 | Error Recovery | 3 | Plain-language stale banner ("Data may be stale … the engine may be down"); fetch failures degrade to excluded "unknown". Few error paths. |
| 10 | Help and Documentation | 3 | Strong About page (availability rule, region scoping, architecture). No inline hints on the dashboard itself (dial, weather word, "not counted"). |
| **Total** | | **34/40** | **Good** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.**

**LLM assessment**: This passes the slop test at both altitudes. The weather-instrument concept, the literal barometer dial with a sweeping needle, the near-monochrome calm palette with one ember accent reserved for the needle, and the honest data exclusions are specific, considered choices, not training-data reflexes. None of the absolute bans are present: no gradient cards, no hero-metric template, no identical icon-heading-text grid (cards now vary by content), no per-section eyebrow kickers, no side-stripe borders. It is neither generic-SaaS-dark nor a status-page clone, which are the two obvious category traps.

**Deterministic scan**: `detect.mjs` over `packages/web` returned a single warning, "99 em-dashes" in `tokens.css`. False positive: those are CSS comment section dividers (`/* ── … ── */`) and code comments, not UI body copy. Exit 0 (clean). The Space Grotesk flag from the wider scan is on `design/almanac-reference.html` (out of scope) and is a deliberate, committed brand display face.

**Visual overlays**: Not available. Production serves CSP `script-src 'self'`, which blocks the injected `detect.js` overlay. Fallback used: read-only computed-style inspection in the page (contrast verified ≥4.5:1 light and dark).

## Overall Impression

This is a confident, well-crafted instrument that knows exactly what it is. The single biggest improvement since the last critique: the page now tells the truth about uptime (windows hide until a real span backs them) and the hero is compact, so the actual provider data is the first thing you see. The remaining weakness is triage efficiency: when something breaks, you read all 11 tiles to see the detail. The biggest opportunity is a "problems only" view that turns a scan into a glance.

## What's Working

- **Honest by construction.** Uptime windows hide until backed (cards currently show only the earned 24H), maintenance/unknown are excluded, incidents are region-scoped ("us-central-1 — outside US, not counted"). The product's whole pitch is trustworthiness and the UI now lives up to it.
- **A real identity.** The literal barometer dial, the Stormy→Fair scale, the calm near-monochrome surface with one warm note on the needle. It reads as a designed instrument, not a dashboard template.
- **Accessibility done properly.** Status is carried by icon + label + color (never color alone), contrast is AA in both themes, the dial is aria-hidden with the text as the source of truth, and the drill-down dialog returns focus to its origin tile.

## Priority Issues

- **[P2] No fast path to triage.** With 11 tiles and no filter, finding *what's wrong and its detail* means scanning the whole grid. The hero's offenders line ("Cloudflare degraded, OpenAI degraded") names the culprits but you still hunt for their tiles. **Fix:** a "Show problems only" toggle that collapses operational tiles to the degraded set; optionally arrow-key/tab jump between tiles. **Suggested command:** `/impeccable shape` (plan the filter interaction, then build).
- **[P3] Single-stat cards read sparse in the first week.** Now that 7/30/90D correctly hide until backed, each card shows one centered "24H xx%" under a full-width sparkline, leaving a lot of empty card width. Honest, but momentarily empty-looking. **Fix:** while only 24H is backed, communicate "longer windows fill in as history builds," or size/position the single stat so it doesn't float. Self-resolves by day 7. **Suggested command:** `/impeccable onboard` (early/empty-history state).
- **[P3] No inline help on the dashboard itself.** A first-timer has to open About to learn what "Changeable" or the dial means. **Fix:** a `title`/tooltip on the dial or weather word ("Overall reading: degraded") and on the "not counted" note. **Suggested command:** `/impeccable clarify`.

## Persona Red Flags

**Alex (Power User)**: No keyboard shortcuts; no "problems only" filter, so triage is a full-grid scan. Polls every 60s with no manual refresh. The hero offenders line softens this, but a power user wants to filter and jump.

**Sam (Accessibility)**: Strong. Status = icon + label + color; AA contrast in both themes; dial aria-hidden with text source of truth; live region announces updates; dialog returns focus. Watch item: confirm the 90-day uptime bar cells aren't announced individually (they should be summarized by the bar's aria-label).

**Riley the on-call SRE (project persona)**: Lands to answer "is it us or them?" The hero delivers the single-glance verdict and names the degraded providers. Red flag: can't isolate the degraded providers for a closer look without scanning, and there's no at-a-glance "when did this start" beyond opening each drill-down.

## Minor Observations

- The hero's wide horizontal gap between the offenders text and the dial is calm and intentional at 1440px, but watch it on very wide (1920px+) monitors where it can read as disconnected; an inner max-width would cap it.
- The "us-central-1 — outside US, not counted" faint annotation is a lovely honesty touch; keep it on `--text-faint` (now AA) so it stays legible.
- Footer still reads `v1.0.0`, which predates the About page and these fixes (cosmetic).
- The em-dash detector hit is a false positive (CSS comment dividers, not UI copy); no action.

## Questions to Consider

- Should triage be a glance instead of a scan? Is a "problems only" view worth building, or does the hero offenders line cover it?
- In the first week, when only 24H is backed, should the cards say "longer windows fill in as history builds" so a single stat doesn't read as missing data?
- Does the dial deserve a one-line inline caption for first-timers, or is the About page enough?
