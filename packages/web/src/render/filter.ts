import { el } from "./dom.js";

export interface ProblemsFilter {
  element: HTMLElement;
  /**
   * Reflect the live data: show the control only when there are problems to
   * filter, set the count, and mirror the active state.
   */
  update(problemCount: number, active: boolean): void;
}

/**
 * The "Problems only" grid filter. Built once and updated in place (like the
 * reading band) so a 60s poll can't rebuild the button and steal focus mid-click.
 * It hides itself when nothing is wrong, so the all-clear view stays uncluttered.
 * This component is purely presentational: `onToggle` owns the state flip and the
 * grid re-render.
 */
export function createProblemsFilter(onToggle: () => void): ProblemsFilter {
  const bar = el("div", "filterbar");
  bar.hidden = true; // nothing to filter until the first reading says otherwise

  const btn = document.createElement("button");
  btn.className = "filter-toggle";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");

  const label = el("span", "filter-toggle__label");
  label.textContent = "Problems only";
  const count = el("span", "filter-toggle__count");
  btn.append(label, count);
  btn.addEventListener("click", onToggle);
  bar.appendChild(btn);

  function update(problemCount: number, active: boolean): void {
    bar.hidden = problemCount === 0;
    count.textContent = String(problemCount);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.classList.toggle("is-active", active);
    // The accessible name describes what the toggle does and stays stable; the
    // on/off state rides on aria-pressed (ARIA toggle-button practice). The count
    // is folded in here because the visible chip is not part of the name.
    const noun = problemCount === 1 ? "provider" : "providers";
    btn.setAttribute("aria-label", `Show only the ${problemCount} ${noun} with problems`);
  }

  return { element: bar, update };
}
