import type { ProviderAdapter, AdapterDeps, ProviderConfig } from "./types.js";
import { StatuspageAdapter } from "./statuspage.js";
import { AwsAdapter } from "./aws.js";
import { AzureAdapter } from "./azure.js";
import { GcpAdapter } from "./gcp.js";
import { ProbeAdapter } from "./probe.js";
import { ProbeFallbackAdapter } from "./probeFallback.js";

/** Map each typed provider config to its adapter instance. */
export function buildAdapters(configs: ProviderConfig[], deps: AdapterDeps): ProviderAdapter[] {
  return configs.map((config) => {
    const inner = buildInner(config, deps);
    // Any provider with a healthProbe gets the fallback decorator: if its status
    // feed is unreachable (status "unknown"), confirm a real outage by probing.
    return config.healthProbe
      ? new ProbeFallbackAdapter(inner, config.healthProbe, config, deps)
      : inner;
  });
}

function buildInner(config: ProviderConfig, deps: AdapterDeps): ProviderAdapter {
  switch (config.type) {
    case "aws":
      return new AwsAdapter(config, deps);
    case "azure":
      return new AzureAdapter(config, deps);
    case "gcp":
      return new GcpAdapter(config, deps);
    case "probe":
      return new ProbeAdapter(config, deps);
    case "statuspage":
    case "custom":
      return new StatuspageAdapter(config, deps);
  }
}
