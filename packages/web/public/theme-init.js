/*
 * Theme bootstrap — runs render-blocking in <head> before first paint.
 *
 * Sets data-theme on <html> from the persisted choice, falling back to the OS
 * preference on first visit, so the page never flashes the wrong theme. main.ts
 * owns flipping + persistence after load; this file only sets the initial value.
 *
 * Kept as a separate, dependency-free file (not inline) because the production
 * CSP is `script-src 'self'`, which blocks inline scripts.
 */
(function () {
  try {
    var t = localStorage.getItem("barometer-theme");
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
