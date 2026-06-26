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
  { id: "aws", displayName: "AWS", type: "aws", url: "https://health.aws.amazon.com/public/currentevents" },
  { id: "azure", displayName: "Microsoft Azure", type: "azure", url: "https://azure.status.microsoft/en-us/status/feed/" },
  { id: "gcp", displayName: "Google Cloud", type: "gcp", url: "https://status.cloud.google.com/incidents.json" },
  { id: "cloudflare", displayName: "Cloudflare", type: "statuspage", url: "https://www.cloudflarestatus.com" },
  { id: "github", displayName: "GitHub", type: "statuspage", url: "https://www.githubstatus.com" },
  { id: "openai", displayName: "OpenAI", type: "statuspage", url: "https://status.openai.com" },
  { id: "anthropic", displayName: "Anthropic", type: "statuspage", url: "https://status.claude.com" },
  { id: "vercel", displayName: "Vercel", type: "statuspage", url: "https://www.vercel-status.com" },
  { id: "digitalocean", displayName: "DigitalOcean", type: "statuspage", url: "https://status.digitalocean.com" },
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
