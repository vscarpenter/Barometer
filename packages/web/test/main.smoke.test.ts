import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Smoke test for the app entrypoint. The render modules each have unit tests,
 * but nothing imported main.ts — so a module-evaluation crash (e.g. a Temporal
 * Dead Zone access from a top-level call) sailed past `test` and `typecheck`
 * and only showed up as a blank live page. This evaluates the module the way
 * the browser does and asserts the shell renders.
 */
describe("main.ts entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    // Pollers fetch on start; keep it offline + deterministic and freeze timers
    // so the 60s/1s intervals never fire during the test.
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    // jsdom doesn't implement matchMedia (the theme toggle reads it); a real
    // browser does. Stub it so module evaluation reaches the masthead.
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("evaluates without crashing and renders the masthead shell", async () => {
    await expect(import("../src/main.js")).resolves.toBeDefined();
    expect(document.querySelector(".masthead")).not.toBeNull();
  });
});
