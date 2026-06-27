import { z } from "zod";
import type { ProviderSnapshot } from "@barometer/types";
import type { FetchResult, FetchOptions } from "../http.js";

/**
 * Typed provider config — adding a provider is a one-line change (SPEC §5).
 * This is the adapter contract's home; config/providers.ts supplies the data.
 * Defined as a zod schema so the BAROMETER_PROVIDERS_JSON override is validated.
 */
export const ProviderConfigSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  type: z.enum(["statuspage", "aws", "azure", "gcp", "custom"]),
  url: z.string(), // status domain (statuspage) or full feed URL (bespoke)
  componentFilter: z.array(z.string()).optional(), // watch only specific components
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface AdapterDeps {
  fetch: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  now: () => string; // ISO 8601 timestamp for checkedAt
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
