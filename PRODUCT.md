# Product

## Register

product

## Users

People who depend on the big cloud, network, and AI providers and need to know, fast, whether those providers are healthy right now: developers, SRE / ops, and technically literate users mid-incident or doing a routine check. Their context is a glance, not a session. The recurring question is "is it me, or is the internet down?", and the alternative is opening nine separate vendor status pages and reconciling nine different formats by hand.

The job to be done: confirm at a glance whether the providers they rely on are operational, and when they are not, see which ones and how bad, without false alarms and without digging.

## Product Purpose

Barometer is a serverless internet-health monitor. A scheduled AWS Lambda reads the public status of nine major cloud / network / AI providers every 5 minutes, normalizes their wildly different formats into one schema, writes tiered JSON to a private S3 bucket, and a vanilla-TypeScript dashboard (served by CloudFront) answers a single question: "is the internet healthy right now?"

Success is a reading that is fast, trustworthy, and honest about uncertainty: a one-glance overall verdict, per-provider detail on demand (active incidents, 90-day uptime, recently resolved), and transition-only email alerts, all running for a few dollars a month with no servers, API, or database.

## Brand Personality

A calm instrument. Trustworthy, precise, understated. Three words: calm, precise, honest.

Voice and tone are plain and specific, never breathless. The interface is neutral when things are healthy and surfaces color, motion, and emphasis only when there is something real to report, so it never cries wolf. Emotional goal: reassurance when the reading is fair, immediate clarity when it is not. Confidence and calm, never urgency-as-default or alarm fatigue. The barometer / weather-almanac metaphor (a swept needle, Stormy to Fair) is the personality: an instrument you trust at a glance.

## Anti-references

- **Generic SaaS dashboard.** No gradient cards, no big-hero-metric template, no endless identical icon + heading + text card grids.
- **Status-page clones.** Avoid the interchangeable hosted-status sameness (Atlassian Statuspage lookalikes) that most monitors copy. Barometer normalizes those feeds; it should not look like one of them.
- **Alarmist red-everywhere monitoring.** No red gradients, sirens, or urgency as the resting mood. Severity is earned and proportionate, not the default.
- **Neon dev-tool dark mode.** No default-dark neon-on-black "looks technical" costume. Light-first by design; dark is an equal, deliberate variant, not a personality.

## Design Principles

- **Honest instrument.** Never fake a reading. Operational counts as up; degraded and outages count as down; planned maintenance and feeds we could not read are excluded from the denominator, never guessed. No false 100%, no false outage. The reading is only ever as confident as the data behind it.
- **Calm by default, signal on change.** Healthy is quiet. Color, motion, and prominence appear in proportion to what is actually happening, so a real problem reads instantly precisely because the resting state is restrained.
- **One glance answers the question.** Every screen resolves to "is the internet healthy right now?" before any detail. Hierarchy serves that single reading; the worst providers float to the top; depth (incidents, history) is opt-in, never in the way.
- **Color is never the only signal.** Every status is carried by color plus a text label plus a distinct icon, so the reading survives color blindness, grayscale, and glance speed.
- **Degrade, never break.** One provider's broken feed becomes "unknown", not a broken page. Adapters fail safe, stale data is flagged rather than trusted, and the dashboard always renders a visible state.

## Accessibility & Inclusion

Target WCAG 2.2 AA as the floor, already reflected in the build:

- AA contrast on all text and status colors (status hues are deepened for AA on light/tinted surfaces; the dark variant is brightened to match).
- Status is never color alone: color + text label + a distinct per-status icon.
- Persistent ARIA live regions for announcements (e.g. staleness), populated in place so screen readers announce reliably.
- Full reduced-motion support: the needle sweep and transitions snap instead of animating under `prefers-reduced-motion`.
- Keyboard operable: provider tiles are real buttons, the drill-down is a native modal dialog with managed focus return.
