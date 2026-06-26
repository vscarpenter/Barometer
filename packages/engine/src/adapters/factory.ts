import type { ProviderAdapter, AdapterDeps, ProviderConfig } from "./types.js";
import { StatuspageAdapter } from "./statuspage.js";
import { AwsAdapter } from "./aws.js";
import { AzureAdapter } from "./azure.js";
import { GcpAdapter } from "./gcp.js";

/** Map each typed provider config to its adapter instance. */
export function buildAdapters(configs: ProviderConfig[], deps: AdapterDeps): ProviderAdapter[] {
  return configs.map((config) => {
    switch (config.type) {
      case "aws":
        return new AwsAdapter(config, deps);
      case "azure":
        return new AzureAdapter(config, deps);
      case "gcp":
        return new GcpAdapter(config, deps);
      case "statuspage":
      case "custom":
        return new StatuspageAdapter(config, deps);
    }
  });
}
