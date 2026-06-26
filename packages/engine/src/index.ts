/**
 * Public API of the Barometer engine — the target of the package.json "."
 * export. The Lambda itself is bundled from handler.ts directly (esbuild), but
 * this barrel is the surface in-repo consumers, tests, and the dry-run import
 * against. Every module below is side-effect-free at import time (AWS clients
 * are constructed lazily inside functions/constructors), so importing the
 * barrel for one symbol never spins up a client.
 */

// Orchestration + Lambda entry
export * from "./run.js";
export * from "./handler.js";

// HTTP client
export * from "./http.js";

// Providers + adapters
export * from "./config/providers.js";
export * from "./adapters/factory.js";
export * from "./adapters/types.js";

// Normalization, history, summary, metrics
export * from "./summary.js";
export * from "./history.js";
export * from "./metrics.js";

// Alerting
export * from "./alerting/machine.js";
export * from "./alerting/notifier.js";

// Storage
export * from "./store/types.js";
export * from "./store/memory.js";
export * from "./store/s3.js";
