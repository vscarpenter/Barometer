import { describe, it, expect } from "vitest";
import { PROVIDERS, loadProviders } from "../src/config/providers.js";
import { buildAdapters } from "../src/adapters/factory.js";
import { StatuspageAdapter } from "../src/adapters/statuspage.js";
import { AwsAdapter } from "../src/adapters/aws.js";
import { AzureAdapter } from "../src/adapters/azure.js";
import { GcpAdapter } from "../src/adapters/gcp.js";
import type { AdapterDeps } from "../src/adapters/types.js";

const deps: AdapterDeps = {
  fetch: async () => ({ status: 200, body: "", etag: null }),
  now: () => "2026-06-25T00:00:00.000Z",
};

describe("provider config", () => {
  it("ships exactly nine providers with unique ids", () => {
    expect(PROVIDERS).toHaveLength(9);
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(9);
  });

  it("includes the expected providers and types", () => {
    const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
    for (const id of ["aws", "azure", "gcp", "cloudflare", "github", "openai", "anthropic", "vercel", "digitalocean"]) {
      expect(byId[id], `missing provider ${id}`).toBeDefined();
    }
    expect(byId["aws"]!.type).toBe("aws");
    expect(byId["azure"]!.type).toBe("azure");
    expect(byId["gcp"]!.type).toBe("gcp");
    expect(byId["cloudflare"]!.type).toBe("statuspage");
    expect(byId["anthropic"]!.url).toContain("status.claude.com");
  });

  it("every provider url is https", () => {
    for (const p of PROVIDERS) expect(p.url.startsWith("https://")).toBe(true);
  });
});

describe("loadProviders", () => {
  it("returns the built-in list when no override is set", () => {
    expect(loadProviders({})).toBe(PROVIDERS);
  });

  it("honors a BAROMETER_PROVIDERS_JSON override", () => {
    const override = JSON.stringify([
      { id: "x", displayName: "X", type: "statuspage", url: "https://x.example.com" },
    ]);
    const loaded = loadProviders({ BAROMETER_PROVIDERS_JSON: override });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe("x");
  });

  it("falls back to the built-in list when the override is invalid JSON", () => {
    expect(loadProviders({ BAROMETER_PROVIDERS_JSON: "not json" })).toBe(PROVIDERS);
  });
});

describe("buildAdapters", () => {
  it("instantiates the right adapter class per type", () => {
    const adapters = buildAdapters(
      [
        { id: "cloudflare", displayName: "Cloudflare", type: "statuspage", url: "https://www.cloudflarestatus.com" },
        { id: "aws", displayName: "AWS", type: "aws", url: "https://health.aws.amazon.com/public/currentevents" },
        { id: "azure", displayName: "Azure", type: "azure", url: "https://azure.status.microsoft/en-us/status/feed/" },
        { id: "gcp", displayName: "GCP", type: "gcp", url: "https://status.cloud.google.com/incidents.json" },
      ],
      deps,
    );
    expect(adapters[0]).toBeInstanceOf(StatuspageAdapter);
    expect(adapters[1]).toBeInstanceOf(AwsAdapter);
    expect(adapters[2]).toBeInstanceOf(AzureAdapter);
    expect(adapters[3]).toBeInstanceOf(GcpAdapter);
  });

  it("builds a StatuspageAdapter for the custom type too", () => {
    const [adapter] = buildAdapters(
      [{ id: "x", displayName: "X", type: "custom", url: "https://x.example.com" }],
      deps,
    );
    expect(adapter).toBeInstanceOf(StatuspageAdapter);
  });

  it("builds an adapter for every shipped provider", () => {
    const adapters = buildAdapters(PROVIDERS, deps);
    expect(adapters).toHaveLength(9);
  });
});
