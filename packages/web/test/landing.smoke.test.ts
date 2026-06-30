import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Smoke test for the /landing.html entry — catches module-evaluation crashes
 *  (TDZ, bad import) that sail past unit tests and only show as a blank page. */
describe("landing.ts entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="landing"></div>';
    // The summary poller fetches on start; keep it offline + deterministic and
    // freeze timers so the 60s interval never fires during the test.
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mounts the landing page with the hero, theme toggle, and shared footer", async () => {
    await expect(import("../src/landing.js")).resolves.toBeDefined();
    expect(document.querySelector("#landing .lp-hero__title")?.textContent).toMatch(
      /is the internet healthy right now/i,
    );
    // Theme toggle dropped into the nav, matching the About page.
    expect(document.querySelector("#landing .lp-nav__right .theme-toggle")).not.toBeNull();
    // Shared footer with a link back to the dashboard.
    const footer = document.querySelector("#landing footer.footer");
    expect(footer).not.toBeNull();
    expect(footer!.querySelector<HTMLAnchorElement>('a[href="/"]')?.textContent).toBe("Home");
  });
});
