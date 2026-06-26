import { describe, it, expect } from "vitest";
import { fetchWithRetry } from "../src/http.js";

const noSleep = async () => {};

function headersOf(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

describe("fetchWithRetry", () => {
  it("sends User-Agent and If-None-Match when an etag is supplied", async () => {
    let seen: Headers | undefined;
    const fetchImpl = (async (_url, init) => {
      seen = headersOf(init as RequestInit);
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    await fetchWithRetry("https://x", { etag: "W/\"abc\"", fetchImpl, sleep: noSleep });

    expect(seen?.get("user-agent")).toBe("Barometer/1.0 (+https://barometer.vinny.dev)");
    expect(seen?.get("if-none-match")).toBe("W/\"abc\"");
  });

  it("returns body and etag on 200", async () => {
    const fetchImpl = (async () =>
      new Response("payload", { status: 200, headers: { etag: "\"v2\"" } })) as typeof fetch;

    const res = await fetchWithRetry("https://x", { fetchImpl, sleep: noSleep });

    expect(res.status).toBe(200);
    expect(res.body).toBe("payload");
    expect(res.etag).toBe("\"v2\"");
  });

  it("passes a 304 through without retrying", async () => {
    let calls = 0;
    // The Response constructor forbids status 304, but real fetch() returns
    // 304s over the wire — model that with a duck-typed response.
    const notModified = {
      status: 304,
      headers: new Headers({ etag: "\"v2\"" }),
      text: async () => "",
    } as unknown as Response;
    const fetchImpl = (async () => {
      calls++;
      return notModified;
    }) as typeof fetch;

    const res = await fetchWithRetry("https://x", { etag: "\"v2\"", fetchImpl, sleep: noSleep });

    expect(res.status).toBe(304);
    expect(res.body).toBe("");
    expect(calls).toBe(1);
  });

  it("retries after a thrown network error, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return new Response("recovered", { status: 200 });
    }) as typeof fetch;

    const res = await fetchWithRetry("https://x", { retries: 2, fetchImpl, sleep: noSleep });

    expect(res.body).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("retries on a 5xx, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response("boom", { status: 503 });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const res = await fetchWithRetry("https://x", { retries: 2, fetchImpl, sleep: noSleep });

    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("throws after exhausting retries", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      throw new Error("down");
    }) as typeof fetch;

    await expect(
      fetchWithRetry("https://x", { retries: 2, fetchImpl, sleep: noSleep }),
    ).rejects.toThrow("down");
    expect(calls).toBe(3); // initial + 2 retries
  });
});
