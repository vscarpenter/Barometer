/**
 * Shared HTTP client for adapters: timeout, retries with exponential backoff,
 * a descriptive User-Agent, and conditional GET (If-None-Match -> 304 reuse).
 * SPEC §5.3. fetchImpl and sleep are injectable so tests run without network
 * or real delays.
 */

const USER_AGENT = "Barometer/1.0 (+https://barometer.vinny.dev)";

export interface FetchResult {
  status: number;
  body: string;
  etag: string | null;
}

export interface FetchOptions {
  etag?: string | null;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    etag = null,
    timeoutMs = 5000,
    retries = 2,
    fetchImpl = fetch,
    sleep = realSleep,
  } = opts;

  const headers: Record<string, string> = { "user-agent": USER_AGENT };
  if (etag) headers["if-none-match"] = etag;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(200 * 2 ** (attempt - 1));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
      const resEtag = res.headers.get("etag");

      if (res.status === 304) {
        return { status: 304, body: "", etag: resEtag ?? etag };
      }
      if (res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        if (attempt < retries) continue;
        return { status: res.status, body: await res.text(), etag: resEtag };
      }
      return { status: res.status, body: await res.text(), etag: resEtag };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
