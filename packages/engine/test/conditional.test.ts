import { describe, it, expect } from "vitest";
import { fetchConditionally } from "../src/adapters/conditional.js";
import type { AdapterDeps, ProviderConfig } from "../src/adapters/types.js";
import type { FetchResult } from "../src/http.js";

const NOW = "2026-06-25T00:00:00.000Z";

const config: ProviderConfig = {
  id: "provider",
  displayName: "Provider",
  type: "statuspage",
  url: "https://status.example.com",
};

describe("fetchConditionally", () => {
  it("records the ETag but returns unavailable for 304 without a previous snapshot", async () => {
    let recorded: string | null | undefined;
    const fetch: AdapterDeps["fetch"] = async (_url, opts): Promise<FetchResult> => {
      expect(opts?.etag).toBe("\"old\"");
      return { status: 304, body: "", etag: "\"new\"" };
    };

    const result = await fetchConditionally(
      { fetch, now: () => NOW },
      "https://status.example.com/api/v2/summary.json",
      config,
      {
        etag: "\"old\"",
        previousSnapshot: null,
        recordEtag: (etag) => {
          recorded = etag;
        },
      },
    );

    expect(result).toEqual({ kind: "unavailable" });
    expect(recorded).toBe("\"new\"");
  });
});
