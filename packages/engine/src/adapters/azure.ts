import { overallStatus, type ProviderSnapshot, type ProviderStatus, type Incident } from "@barometer/types";
import type { ProviderAdapter, AdapterDeps, ProviderConfig } from "./types.js";

/**
 * Adapter for Azure's RSS 2.0 status feed (azure.status.microsoft).
 * Empty channel = all systems operational; items in the channel = active incidents.
 * Status is inferred from item text via keyword matching — RSS has no structured
 * severity field, so this mapping is intentionally coarse and documented. SPEC §5.x.
 *
 * Keyword → ProviderStatus mapping (checked against title + description, case-insensitive):
 *   "outage" | "unavailable" → major_outage
 *   "degrad" | "latency" | "error" | "impact" → partial_outage
 *   (no keyword match)       → degraded
 *
 * Incident impact field (title-only check):
 *   "outage" | "unavailable" in title → "major"; otherwise → "minor"
 */

// Ordered worst-first so we short-circuit at the first match.
const STATUS_RULES: Array<{ pattern: RegExp; status: ProviderStatus }> = [
  { pattern: /outage|unavailable/i, status: "major_outage" },
  { pattern: /degrad|latency|error|impact/i, status: "partial_outage" },
];

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Extract the inner text of the first matching XML tag, stripping any CDATA wrapper. */
function extractTag(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml);
  return match ? stripCdata(match[1] ?? "").trim() : "";
}

function inferItemStatus(title: string, description: string): ProviderStatus {
  const text = `${title} ${description}`;
  for (const { pattern, status } of STATUS_RULES) {
    if (pattern.test(text)) return status;
  }
  return "degraded";
}

function incidentImpact(title: string): Incident["impact"] {
  return /outage|unavailable/i.test(title) ? "major" : "minor";
}

export class AzureAdapter implements ProviderAdapter {
  readonly id: string;
  private readonly sourceUrl: string;

  constructor(
    private readonly config: ProviderConfig,
    private readonly deps: AdapterDeps,
  ) {
    this.id = config.id;
    this.sourceUrl = config.url;
  }

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    try {
      const res = await this.deps.fetch(this.sourceUrl);
      if (res.status !== 200) return this.unknown();

      const body = res.body;

      // Reject anything that doesn't look like an RSS channel document.
      if (!body.includes("<channel")) {
        throw new Error("Response is not a recognizable RSS feed");
      }

      const parsed = this.parseItems(body);
      const status: ProviderStatus =
        parsed.length === 0 ? "operational" : overallStatus(parsed.map((p) => p.itemStatus));

      return {
        id: this.config.id,
        displayName: this.config.displayName,
        status,
        activeIncidents: parsed.map((p) => p.incident),
        checkedAt: this.deps.now(),
        sourceUrl: this.sourceUrl,
      };
    } catch {
      return this.unknown();
    }
  }

  private parseItems(body: string): Array<{ incident: Incident; itemStatus: ProviderStatus }> {
    const results: Array<{ incident: Incident; itemStatus: ProviderStatus }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(body)) !== null) {
      const itemXml = match[1] ?? "";
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link");
      const pubDate = extractTag(itemXml, "pubDate");
      const guid = extractTag(itemXml, "guid");
      const description = extractTag(itemXml, "description");

      const dateObj = new Date(pubDate);
      const startedAt =
        pubDate && !isNaN(dateObj.getTime()) ? dateObj.toISOString() : this.deps.now();

      results.push({
        incident: {
          id: guid || link,
          title,
          impact: incidentImpact(title),
          status: "active",
          startedAt,
          url: link,
        },
        itemStatus: inferItemStatus(title, description),
      });
    }

    return results;
  }

  private unknown(): ProviderSnapshot {
    return {
      id: this.config.id,
      displayName: this.config.displayName,
      status: "unknown",
      activeIncidents: [],
      checkedAt: this.deps.now(),
      sourceUrl: this.sourceUrl,
    };
  }
}
