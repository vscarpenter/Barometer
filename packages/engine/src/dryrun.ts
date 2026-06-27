/**
 * Local dry-run (SPEC §7, §11). Runs the full fetch + normalize against live
 * provider APIs and prints the resulting summary.json to stdout — no S3 writes,
 * no real alerts, and no synthetic uptime windows from a one-sample in-memory
 * history. Run with: bun run dryrun
 */
import { fetchWithRetry } from "./http.js";
import { buildAdapters } from "./adapters/factory.js";
import { loadProviders } from "./config/providers.js";
import { MemoryStore } from "./store/memory.js";
import { ConsoleNotifier } from "./alerting/notifier.js";
import { runOnce } from "./run.js";

const adapters = buildAdapters(loadProviders(), {
  fetch: fetchWithRetry,
  now: () => new Date().toISOString(),
});

const summary = await runOnce({
  adapters,
  store: new MemoryStore(),
  notifier: new ConsoleNotifier(),
  now: () => new Date(),
  historyMode: "current-only",
});

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
