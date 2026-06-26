import type { SummaryProvider, ProviderStatus, UptimeWindows } from "@barometer/types";
import { el } from "./dom.js";
import { statusLabel, makeStatusIcon } from "./status.js";
import { renderSparkline } from "./sparkline.js";

function formatUptime(value: number | null): string {
  return value === null ? "—" : `${+value.toFixed(2)}%`;
}

/** One provider instrument tile (SPEC §8): LED + name + status pill, incident, sparkline, uptime. */
export function renderCard(provider: SummaryProvider, recent: ProviderStatus[]): HTMLElement {
  const card = el("article", "card");
  card.style.setProperty("--c", `var(--status-${provider.status})`);

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

  const incident = provider.activeIncidents[0];
  if (incident) {
    const para = el("p", "card__incident");
    const link = el("a");
    link.href = incident.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = incident.title;
    para.appendChild(link);
    card.appendChild(para);
  }

  card.appendChild(renderSparkline(recent));

  const dl = el("dl", "card__uptime");
  (["24h", "7d", "30d", "90d"] as const).forEach((window: keyof UptimeWindows) => {
    const cell = el("div");
    const dt = el("dt");
    dt.textContent = window;
    const dd = el("dd");
    dd.textContent = formatUptime(provider.uptime[window]);
    cell.append(dt, dd);
    dl.appendChild(cell);
  });
  card.appendChild(dl);

  return card;
}
