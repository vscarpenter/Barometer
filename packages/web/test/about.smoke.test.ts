import { describe, it, expect, beforeEach } from "vitest";

/** Smoke test for the /about.html entry — mirrors main.smoke for the second page. */
describe("about.ts entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="about"></div>';
  });

  it("mounts the About page with a theme toggle and the shared footer", async () => {
    await expect(import("../src/about.js")).resolves.toBeDefined();
    expect(document.querySelector("#about .about__title")?.textContent).toMatch(/about barometer/i);
    expect(document.querySelector("#about .about__nav .theme-toggle")).not.toBeNull();
    // The shared footer mounts inside the content column, with About as current.
    const footer = document.querySelector("#about footer.footer");
    expect(footer).not.toBeNull();
    expect(footer!.querySelector<HTMLAnchorElement>('a[href="/"]')?.textContent).toBe("Home");
    expect(footer!.querySelector('a[href="/about.html"]')?.getAttribute("aria-current")).toBe("page");
  });
});
