import type { ProviderSnapshot } from "@barometer/types";
import type { FetchResult, FetchOptions } from "../http.js";

/**
 * Typed provider config — adding a provider is a one-line change (SPEC §5).
 * This is the adapter contract's home; config/providers.ts supplies the data.
 */
export interface ProviderConfig {
  id: string;
  displayName: string;
  type: "statuspage" | "aws" | "azure" | "gcp" | "custom";
  url: string; // status domain or feed URL
  componentFilter?: string[]; // optional: watch only specific components
}

export interface AdapterDeps {
  fetch: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  now: () => string; // ISO 8601 timestamp for checkedAt
}

export interface ProviderAdapter {
  id: string;
  /** Never throws. Returns a snapshot with status "unknown" on any failure. */
  fetchSnapshot(): Promise<ProviderSnapshot>;
}
