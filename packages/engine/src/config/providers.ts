import { z } from "zod";
import { ProviderConfigSchema, type ProviderConfig } from "../adapters/types.js";

/**
 * Canonical provider list (SPEC §5). Adding a provider is a one-line change.
 * URLs verified live before wiring. Statuspage providers use the base domain
 * (the adapter appends /api/v2/summary.json); bespoke providers use the full
 * feed URL. Fastly (bot-blocked) and GitLab (Status.io, not Statuspage) from
 * the original brief were replaced with Vercel and DigitalOcean.
 */
export const PROVIDERS: ProviderConfig[] = [
  // Status-page providers. healthProbe = a canonical service endpoint used only
  // when the status feed itself is unreachable, to confirm a real outage (v2).
  { id: "aws", displayName: "AWS", type: "aws", url: "https://health.aws.amazon.com/public/currentevents", healthProbe: "https://s3.amazonaws.com" },
  { id: "azure", displayName: "Microsoft Azure", type: "azure", url: "https://azure.status.microsoft/en-us/status/feed/" },
  { id: "gcp", displayName: "Google Cloud", type: "gcp", url: "https://status.cloud.google.com/incidents.json", healthProbe: "https://storage.googleapis.com" },
  { id: "cloudflare", displayName: "Cloudflare", type: "statuspage", url: "https://www.cloudflarestatus.com", healthProbe: "https://www.cloudflare.com" },
  { id: "github", displayName: "GitHub", type: "statuspage", url: "https://www.githubstatus.com", healthProbe: "https://api.github.com" },
  { id: "openai", displayName: "OpenAI", type: "statuspage", url: "https://status.openai.com" },
  { id: "anthropic", displayName: "Anthropic", type: "statuspage", url: "https://status.claude.com" },
  { id: "vercel", displayName: "Vercel", type: "statuspage", url: "https://www.vercel-status.com" },
  { id: "digitalocean", displayName: "DigitalOcean", type: "statuspage", url: "https://status.digitalocean.com" },
  // Active DNS probes (v2): foundational-layer coverage independent of any
  // vendor status page, via each resolver's DNS-over-HTTPS JSON endpoint.
  {
    id: "cloudflare-dns",
    displayName: "Cloudflare DNS (1.1.1.1)",
    type: "probe",
    url: "https://1.1.1.1/dns-query?name=example.com&type=A",
    probe: {
      url: "https://1.1.1.1/dns-query?name=example.com&type=A",
      headers: { accept: "application/dns-json" },
      degradedMs: 1500,
    },
  },
  {
    id: "google-dns",
    displayName: "Google DNS (8.8.8.8)",
    type: "probe",
    url: "https://dns.google/resolve?name=example.com&type=A",
    probe: { url: "https://dns.google/resolve?name=example.com&type=A", degradedMs: 1500 },
  },
];

const ProvidersArraySchema = z.array(ProviderConfigSchema);

/**
 * Resolve the provider list. A BAROMETER_PROVIDERS_JSON env override (the
 * Terraform "provider list source" knob) wins when present and valid; a broken
 * override falls back to the built-in list rather than breaking the run.
 */
export function loadProviders(
  env: Record<string, string | undefined> = process.env,
): ProviderConfig[] {
  const override = env.BAROMETER_PROVIDERS_JSON;
  if (!override) return PROVIDERS;
  try {
    return ProvidersArraySchema.parse(JSON.parse(override));
  } catch {
    return PROVIDERS;
  }
}
