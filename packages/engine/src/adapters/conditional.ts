import type { ProviderSnapshot } from "@barometer/types";
import type { AdapterDeps, ProviderConfig, SnapshotFetchContext } from "./types.js";

export type ConditionalFetchResult =
  | { kind: "body"; body: string }
  | { kind: "snapshot"; snapshot: ProviderSnapshot }
  | { kind: "unavailable" };

/**
 * Shared conditional GET behavior for adapters. Provider adapters own parsing;
 * this module owns the cross-provider ETag/304 mechanics.
 */
export async function fetchConditionally(
  deps: AdapterDeps,
  sourceUrl: string,
  config: ProviderConfig,
  context?: SnapshotFetchContext,
): Promise<ConditionalFetchResult> {
  const res = await deps.fetch(sourceUrl, { etag: context?.etag });

  if (res.status === 304) {
    context?.recordEtag?.(res.etag ?? context.etag ?? null);
    const snapshot = snapshotFromNotModified(context, config, sourceUrl, deps.now());
    return snapshot ? { kind: "snapshot", snapshot } : { kind: "unavailable" };
  }

  if (res.status !== 200) return { kind: "unavailable" };
  context?.recordEtag?.(res.etag);
  return { kind: "body", body: res.body };
}

function snapshotFromNotModified(
  context: SnapshotFetchContext | undefined,
  config: ProviderConfig,
  sourceUrl: string,
  checkedAt: string,
): ProviderSnapshot | null {
  const previous = context?.previousSnapshot;
  if (!previous) return null;
  return {
    ...previous,
    id: config.id,
    displayName: config.displayName,
    checkedAt,
    sourceUrl,
  };
}
