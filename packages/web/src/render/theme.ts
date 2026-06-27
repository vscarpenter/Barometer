import { el, svgEl } from "./dom.js";

// Theme: light-first, manual toggle, persisted. data-theme is set pre-paint by
// public/theme-init.js; this only flips + persists it. Every color is a CSS
// variable, so swapping the attribute restyles the page instantly — no re-render.
// Shared by the dashboard (main.ts) and the About page (about.ts).
const THEME_KEY = "barometer-theme";
type Theme = "light" | "dark";

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode / storage disabled: just don't persist */
  }
}

/** Sun (light) / moon (dark) glyph for the toggle — decorative; the label carries meaning. */
function themeGlyph(theme: Theme): SVGElement {
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const paths =
    theme === "dark"
      ? ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"] // moon
      : ["M12 2v2", "M12 20v2", "M2 12h2", "M20 12h2", "M4.9 4.9l1.4 1.4",
         "M17.7 17.7l1.4 1.4", "M19.1 4.9l-1.4 1.4", "M6.3 17.7l-1.4 1.4"]; // sun rays
  if (theme !== "dark") {
    const c = svgEl("circle");
    c.setAttribute("cx", "12");
    c.setAttribute("cy", "12");
    c.setAttribute("r", "4");
    svg.appendChild(c);
  }
  for (const d of paths) {
    const p = svgEl("path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

export function buildThemeToggle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "theme-toggle";
  btn.type = "button";
  const label = el("span");
  const sync = (): void => {
    const t = currentTheme();
    btn.setAttribute("aria-label", `Switch to ${t === "dark" ? "light" : "dark"} theme`);
    btn.replaceChildren(themeGlyph(t), label);
    label.textContent = t === "dark" ? "Dark" : "Light";
  };
  btn.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    sync();
  });

  // Until the visitor makes an explicit choice, keep open tabs in sync with the
  // OS theme as it changes (no-op once they've toggled, since that persists).
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let chosen: string | null = null;
    try {
      chosen = localStorage.getItem(THEME_KEY);
    } catch {
      /* ignore */
    }
    if (chosen === "light" || chosen === "dark") return;
    document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    sync();
  });

  sync();
  return btn;
}
