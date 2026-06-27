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
  headers?: Record<string, string>; // extra request headers (e.g. DoH "accept")
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Response.text() always decodes UTF-8; respect the declared charset (AWS Health serves UTF-16). */
function charsetOf(contentType: string | null): string {
  const match = contentType ? /charset=([^;]+)/i.exec(contentType) : null;
  return match ? match[1]!.trim().toLowerCase() : "utf-8";
}

async function readBody(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // A UTF-16 byte-order mark is authoritative — AWS Health is UTF-16BE but
  // labels itself "charset=utf-16", which TextDecoder would otherwise read as LE.
  let encoding = charsetOf(res.headers.get("content-type"));
  if (bytes.length >= 2) {
    if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
    else if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  }
  try {
    return new TextDecoder(encoding).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    etag = null,
    timeoutMs = 5000,
    retries = 2,
    headers: extraHeaders,
    fetchImpl = fetch,
    sleep = realSleep,
  } = opts;

  const headers: Record<string, string> = { ...extraHeaders, "user-agent": USER_AGENT };
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
        return { status: res.status, body: await readBody(res), etag: resEtag };
      }
      return { status: res.status, body: await readBody(res), etag: resEtag };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
