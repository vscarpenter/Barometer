import { z } from "zod";
import type { ProviderSnapshot } from "@barometer/types";
import type { FetchResult, FetchOptions } from "../http.js";

/**
 * Typed provider config — adding a provider is a one-line change (SPEC §5).
 * This is the adapter contract's home; config/providers.ts supplies the data.
 * Defined as a zod schema so the BAROMETER_PROVIDERS_JSON override is validated.
 */
/**
 * Active-probe target (v2 signal honesty). The probe adapter GETs `url` and maps
 * reachability to a status; `healthProbe` (any adapter) is a fallback endpoint
 * checked only when the status feed itself is unreachable, to tell a real outage
 * apart from a status-page hiccup. Both are plain HTTP(S) so they reuse the
 * hardened, injectable fetch client (DNS resolvers are probed via their
 * DNS-over-HTTPS endpoints).
 */
export const ProbeConfigSchema = z.object({
  url: z.string(),
  degradedMs: z.number().optional(), // elapsed over this → "degraded"
  timeoutMs: z.number().optional(), // default 5000 (matches http.ts)
  headers: z.record(z.string(), z.string()).optional(), // e.g. DoH `accept: application/dns-json`
});
export type ProbeConfig = z.infer<typeof ProbeConfigSchema>;

export const ProviderConfigSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  type: z.enum(["statuspage", "aws", "azure", "gcp", "custom", "probe"]),
  url: z.string(), // status domain (statuspage) or full feed URL (bespoke)
  componentFilter: z.array(z.string()).optional(), // watch only specific components
  probe: ProbeConfigSchema.optional(), // required when type === "probe"
  healthProbe: z.string().optional(), // confirm a real outage when the status feed is down
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface AdapterDeps {
  fetch: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  now: () => string; // ISO 8601 timestamp for checkedAt
  monotonicMs?: () => number; // elapsed-time clock for probes (default Date.now)
}

export interface SnapshotFetchContext {
  etag?: string | null;
  previousSnapshot?: ProviderSnapshot | null;
  recordEtag?: (etag: string | null) => void;
}

export interface ProviderAdapter {
  id: string;
  /** Never throws. Returns a snapshot with status "unknown" on any failure. */
  fetchSnapshot(context?: SnapshotFetchContext): Promise<ProviderSnapshot>;
}
