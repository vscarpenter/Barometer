import { describe, it, expect, vi } from "vitest";
import { secondsAgo, isStale, formatAgo, createPoller } from "../src/poll.js";

const NOW = Date.parse("2026-06-25T12:00:00.000Z");

describe("secondsAgo", () => {
  it("returns whole seconds since the timestamp", () => {
    expect(secondsAgo("2026-06-25T11:59:30.000Z", NOW)).toBe(30);
  });
  it("clamps future timestamps to 0", () => {
    expect(secondsAgo("2026-06-25T12:00:30.000Z", NOW)).toBe(0);
  });
  it("treats an unparseable timestamp as infinitely old", () => {
    expect(secondsAgo("not-a-date", NOW)).toBe(Infinity);
  });
});

describe("isStale", () => {
  it("is false within the threshold", () => {
    expect(isStale("2026-06-25T11:50:00.000Z", NOW, 15)).toBe(false); // 10 min
  });
  it("is true past the threshold", () => {
    expect(isStale("2026-06-25T11:40:00.000Z", NOW, 15)).toBe(true); // 20 min
  });
  it("fails safe to stale when the timestamp is unparseable", () => {
    expect(isStale("garbage", NOW, 15)).toBe(true);
  });
});

describe("formatAgo", () => {
  it("renders compact durations", () => {
    expect(formatAgo(45)).toBe("45s");
    expect(formatAgo(125)).toBe("2m");
    expect(formatAgo(3900)).toBe("1h 5m");
  });
  it("renders a non-finite duration as 'unknown' (never NaN)", () => {
    expect(formatAgo(Infinity)).toBe("unknown");
    expect(formatAgo(NaN)).toBe("unknown");
  });
});

describe("createPoller", () => {
  it("refresh delivers parsed JSON to onData", async () => {
    const onData = vi.fn();
    const onError = vi.fn();
    const fetchImpl = (async () => new Response(JSON.stringify({ hello: "world" }), { status: 200 })) as typeof fetch;
    const poller = createPoller<{ hello: string }>({ url: "/status/summary.json", intervalMs: 1000, fetchImpl, onData, onError });

    await poller.refresh();

    expect(onData).toHaveBeenCalledWith({ hello: "world" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("refresh routes a non-ok response to onError", async () => {
    const onData = vi.fn();
    const onError = vi.fn();
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    const poller = createPoller({ url: "/x", intervalMs: 1000, fetchImpl, onData, onError });

    await poller.refresh();

    expect(onData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("refresh routes a thrown fetch to onError", async () => {
    const onError = vi.fn();
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const poller = createPoller({ url: "/x", intervalMs: 1000, fetchImpl, onData: vi.fn(), onError });

    await poller.refresh();

    expect(onError).toHaveBeenCalledOnce();
  });
});
