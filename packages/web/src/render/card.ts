import type { SummaryProvider, ProviderStatus, UptimeWindows } from "@barometer/types";
import { isUsRelevant } from "@barometer/types";
import { el } from "./dom.js";
import { statusLabel, makeStatusIcon } from "./status.js";
import { renderSparkline } from "./sparkline.js";

function formatUptime(value: number | null): string {
  return value === null ? "—" : `${+value.toFixed(2)}%`;
}

/** Only http(s) URLs are safe to put in an href (blocks javascript:, data:, etc.). */
function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
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
    const counted = isUsRelevant(incident);
    const para = el("p", counted ? "card__incident" : "card__incident card__incident--muted");
    // incident.url comes from a third-party status feed. Only link http(s) —
    // a hostile/compromised feed could otherwise inject javascript: and run
    // script in our origin. Allowlist (not denylist); fall back to plain text.
    if (isSafeHttpUrl(incident.url)) {
      const link = el("a");
      link.href = incident.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = incident.title;
      para.appendChild(link);
    } else {
      para.textContent = incident.title;
    }
    if (incident.regions && incident.regions.length > 0) {
      const tag = el("span", "card__regions");
      tag.textContent = counted
        ? incident.regions.join(", ")
        : `${incident.regions.join(", ")} — outside US, not counted`;
      para.appendChild(document.createTextNode(" "));
      para.appendChild(tag);
    }
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
