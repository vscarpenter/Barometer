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
    // matchMedia is polyfilled globally in test/setup.ts (jsdom lacks it).
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

  it("footer links to the About page and drops the inline description line", async () => {
    await import("../src/main.js");
    const about = document.querySelector<HTMLAnchorElement>('footer a[href="/about.html"]');
    expect(about).not.toBeNull();
    expect(about!.textContent).toBe("About");
    expect(document.body.textContent).not.toContain("weather labels are presentation only");
  });
});
