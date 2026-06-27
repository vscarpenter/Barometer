import type { Incident } from "./status.js";

/**
 * US-region policy — the single knob (sibling to availability.ts). A region id
 * is US-relevant if it is `global` or starts with `us-` (GCP `us-central1`,
 * AWS `us-east-1` / `us-gov-*`). SPEC: 2026-06-26-us-region-scoping-design.md.
 */
export function isUsRegion(id: string): boolean {
  return id === "global" || id.startsWith("us-");
}

/**
 * Do these regions count toward the US reading?
 *  - no data                          → fail-open (count it)
 *  - any explicit `us-*` region       → count it
 *  - only `global` (nothing specific) → count it (truly worldwide)
 *  - specific non-US regions named, none US → exclude
 *
 * The last rule is why this isn't a plain `.some(isUsRegion)`: feeds tag a
 * region-specific incident with a stray `global` token (GCP labels the
 * Delhi/Mumbai networking event `["asia-south2","global"]`). When specific
 * regions are present, we trust them and ignore the `global` co-tag, so a
 * non-US outage never flips the US reading.
 */
export function regionsAreUsRelevant(regions: string[] | undefined): boolean {
  const r = regions ?? [];
  if (r.length === 0) return true;
  if (r.some((id) => id.startsWith("us-"))) return true;
  return r.every((id) => id === "global");
}

/** Convenience over a built Incident — used by the web card. */
export function isUsRelevant(incident: Incident): boolean {
  return regionsAreUsRelevant(incident.regions);
}

/**
 * Conservative region extraction from prose incident text (Statuspage titles,
 * Azure RSS). v1 punted on these feeds and failed open (counted everything);
 * v2 extracts region hints so an obviously-non-US incident stops flipping the
 * US reading — without the brittleness that punt was avoiding.
 *
 * Two safe signals only:
 *  1. The unambiguous cloud-region grammar (`us-east-1`, `eu-west-2`, `ap-southeast`).
 *  2. A small allowlist of explicit geographic phrases ("United States", "Europe",
 *     "APAC"), each mapped to a representative `<prefix>-detected` token so the
 *     existing `isUsRegion`/`regionsAreUsRelevant` rules classify it unchanged.
 *
 * Returns `[]` when nothing matches → fail-open (the incident still counts). We
 * only ever *exclude* an incident when every region we positively identify is
 * non-US, so this can never hide a US outage. Tokens are lowercased + deduped.
 */
const REGION_TOKEN = /\b(?:us|eu|ap|sa|ca|me|af|cn)-[a-z]{2,}(?:-?\d)?\b/gi;

const PHRASE_RULES: Array<{ pattern: RegExp; token: string }> = [
  { pattern: /\b(?:u\.?s\.?a?\.?|united states|us[- ](?:east|west|central))\b/i, token: "us-detected" },
  { pattern: /\b(?:europe|european|emea|eu[- ](?:west|central|north|south))\b/i, token: "eu-detected" },
  { pattern: /\b(?:asia|apac|asia[- ]pacific|ap[- ](?:south|east|northeast|southeast))\b/i, token: "ap-detected" },
  { pattern: /\b(?:australia|oceania|sydney|melbourne)\b/i, token: "ap-detected" },
  { pattern: /\b(?:south america|brazil|s[a~]o paulo|sa[- ]east)\b/i, token: "sa-detected" },
  { pattern: /\b(?:canada|ca[- ]central)\b/i, token: "ca-detected" },
  { pattern: /\b(?:middle east|me[- ](?:central|south))\b/i, token: "me-detected" },
  { pattern: /\b(?:africa|af[- ]south)\b/i, token: "af-detected" },
];

export function extractRegions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(REGION_TOKEN)) {
    found.add(match[0].toLowerCase());
  }
  for (const { pattern, token } of PHRASE_RULES) {
    if (pattern.test(text)) found.add(token);
  }
  return [...found];
}
