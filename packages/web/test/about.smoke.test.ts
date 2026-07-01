import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Smoke test for the /about.html entry — catches module-evaluation crashes
 *  (TDZ, bad import) that sail past unit tests and only show as a blank page. */
describe("about.ts entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="about"></div>';
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

  it("mounts the unified About page with the hero, theme toggle, and shared footer", async () => {
    await expect(import("../src/about.js")).resolves.toBeDefined();
    expect(document.querySelector("#about .lp-hero__title")?.textContent).toMatch(
      /is the internet healthy right now/i,
    );
    // Theme toggle dropped into the About nav.
    expect(document.querySelector("#about .about__nav .theme-toggle")).not.toBeNull();
    // The live panel slot exists (shows a state message until the first poll lands).
    expect(document.querySelector("#about .lp-panel__slot")).not.toBeNull();
    // Shared footer mounts inside the content column, with About as current.
    const footer = document.querySelector("#about footer.footer");
    expect(footer).not.toBeNull();
    expect(footer!.querySelector<HTMLAnchorElement>('a[href="/"]')?.textContent).toBe("Home");
    expect(footer!.querySelector('a[href="/about.html"]')?.getAttribute("aria-current")).toBe("page");
  });
});
