/**
 * Polling + freshness helpers (SPEC §8). Pure helpers take nowMs so they are
 * testable; createPoller injects fetchImpl for the same reason. The poller
 * refreshes on an interval and whenever the tab becomes visible again.
 */

export function secondsAgo(iso: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 1000));
}

/** Stale guard: generatedAt older than thresholdMin minutes means the engine may be down. */
export function isStale(generatedAt: string, nowMs: number, thresholdMin = 15): boolean {
  return secondsAgo(generatedAt, nowMs) > thresholdMin * 60;
}

export interface Poller {
  start(): void;
  stop(): void;
  refresh(): Promise<void>;
}

export interface PollerOptions<T> {
  url: string;
  intervalMs: number;
  onData: (data: T) => void;
  onError: (err: unknown) => void;
  fetchImpl?: typeof fetch;
}

export function createPoller<T>(opts: PollerOptions<T>): Poller {
  const { url, intervalMs, onData, onError, fetchImpl = fetch } = opts;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refresh(): Promise<void> {
    try {
      const res = await fetchImpl(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onData((await res.json()) as T);
    } catch (err) {
      onError(err);
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "visible") void refresh();
  }

  return {
    start() {
      void refresh();
      timer = setInterval(() => void refresh(), intervalMs);
      document.addEventListener("visibilitychange", onVisibilityChange);
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
    refresh,
  };
}
