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

  it("decodes a non-UTF-8 charset declared in the content-type", async () => {
    // AWS Health serves UTF-16LE; Response.text() would decode it as UTF-8 and garble it.
    const json = JSON.stringify({ hello: "wörld", n: 1 });
    const utf16 = Buffer.from("﻿" + json, "utf16le"); // BOM + UTF-16LE body
    const fetchImpl = (async () =>
      new Response(utf16, {
        status: 200,
        headers: { "content-type": "application/json;charset=utf-16le" },
      })) as typeof fetch;

    const res = await fetchWithRetry("https://x", { fetchImpl, sleep: noSleep });

    expect(JSON.parse(res.body)).toEqual({ hello: "wörld", n: 1 });
  });

  it("decodes UTF-16BE by its BOM even when the charset label is ambiguous", async () => {
    // AWS Health is UTF-16BE (BOM fe ff) but labels itself charset=utf-16 (defaults LE).
    const json = JSON.stringify({ ok: true, s: "café" });
    const le = Buffer.from(json, "utf16le");
    le.swap16(); // -> big-endian bytes
    const beBytes = Buffer.concat([Buffer.from([0xfe, 0xff]), le]);
    const fetchImpl = (async () =>
      new Response(beBytes, {
        status: 200,
        headers: { "content-type": "application/json;charset=utf-16" },
      })) as typeof fetch;

    const res = await fetchWithRetry("https://x", { fetchImpl, sleep: noSleep });

    expect(JSON.parse(res.body)).toEqual({ ok: true, s: "café" });
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
