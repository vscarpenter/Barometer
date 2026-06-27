import type { SummaryProvider, ProviderStatus } from "@barometer/types";
import { isUsRelevant } from "@barometer/types";
import { el } from "./dom.js";
import { statusLabel, makeStatusIcon } from "./status.js";
import { renderSparkline } from "./sparkline.js";
import { incidentTitle, regionTag } from "./incident.js";
import { renderUptimeWindows } from "./uptimeWindows.js";

/** One provider instrument tile (SPEC §8): LED + name + status pill, incident, sparkline, uptime. */
export function renderCard(
  provider: SummaryProvider,
  recent: ProviderStatus[],
  onOpen?: (provider: SummaryProvider) => void,
): HTMLElement {
  const interactive = Boolean(onOpen);
  const card = el("article", "card");
  card.dataset.provider = provider.id; // lets focus return to this tile after the dialog closes
  card.style.setProperty("--c", `var(--status-${provider.status})`);

  // When a drill-down handler is supplied, the whole tile becomes a button that
  // opens the provider dialog (keyboard + pointer). Its label stays non-
  // interactive (no nested link — invalid ARIA, and Enter/Space would hijack it);
  // the dialog is where the clickable incident link lives.
  if (onOpen) {
    card.classList.add("card--interactive");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", `${provider.displayName}: ${statusLabel(provider.status)} — open details`);
    card.addEventListener("click", () => onOpen(provider));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(provider);
      }
    });
  }

  const head = el("div", "card__head");
  const led = el("span", "card__led");
  led.setAttribute("aria-hidden", "true");
  led.appendChild(makeStatusIcon(provider.status, 22));

  const name = el("h3", "card__name");
  name.textContent = provider.displayName;

  const pill = el("span", "card__status");
  pill.appendChild(makeStatusIcon(provider.status, 13));
  pill.appendChild(document.createTextNode(statusLabel(provider.status)));

  head.append(led, name, pill);
  card.appendChild(head);

  const incident = provider.activeIncidents.find(isUsRelevant) ?? provider.activeIncidents[0];
  if (incident) {
    const counted = isUsRelevant(incident);
    const para = el("p", counted ? "card__incident" : "card__incident card__incident--muted");
    // A link inside a role=button is invalid ARIA, so only the inert (non-button)
    // card links the incident; the interactive card shows the title as text.
    para.appendChild(
      interactive ? document.createTextNode(incident.title) : incidentTitle(incident.title, incident.url),
    );
    const tag = regionTag(incident.regions, counted);
    if (tag) {
      para.appendChild(document.createTextNode(" "));
      para.appendChild(tag);
    }
    card.appendChild(para);
  }

  card.appendChild(renderSparkline(recent));
  card.appendChild(renderUptimeWindows(provider.uptime));

  return card;
}
