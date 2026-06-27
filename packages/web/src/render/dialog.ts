import type { SummaryProvider, RollupsFile, IncidentRecord } from "@barometer/types";
import { isUsRelevant } from "@barometer/types";
import { el } from "./dom.js";
import { statusLabel, makeStatusIcon } from "./status.js";
import { renderUptimeBar } from "./uptimeBar.js";
import { renderUptimeWindows } from "./uptimeWindows.js";
import { incidentTitle, regionTag } from "./incident.js";
import { secondsAgo, formatAgo } from "../poll.js";

/** Everything the drill-down needs, gathered from the live pollers at open time. */
export interface ProviderDialogData {
  provider: SummaryProvider;
  rollups: RollupsFile | null;
  resolvedIncidents: IncidentRecord[];
  now?: number;
}

function startedAgo(startedAt: string, now: number): string {
  const secs = secondsAgo(startedAt, now);
  return Number.isFinite(secs) && secs >= 0 ? `started ${formatAgo(secs)} ago` : "start time unknown";
}

function impactDot(impact: string): HTMLElement {
  const dot = el("span", "dlg-incident__impact");
  dot.dataset.impact = impact; // none/unmapped → neutral via CSS; minor/major/critical tinted
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

/** Build (but don't show) the provider drill-down dialog. */
export function renderProviderDialog(data: ProviderDialogData): HTMLDialogElement {
  const now = data.now ?? Date.now();
  const { provider } = data;
  const dialog = document.createElement("dialog");
  dialog.className = "provider-dialog";
  dialog.style.setProperty("--c", `var(--status-${provider.status})`);
  dialog.setAttribute("aria-label", `${provider.displayName} status detail`);

  // All content lives in an inner padded body. The <dialog> itself has no
  // padding, so a click only reaches it from the true backdrop — clicks on the
  // visible panel (incl. its padding gutter) never have target === dialog.
  const body = el("div", "dlg__body");

  // Header: name + status pill + close.
  const header = el("div", "dlg__head");
  const title = el("h2", "dlg__title");
  title.textContent = provider.displayName;
  const pill = el("span", "card__status");
  pill.appendChild(makeStatusIcon(provider.status, 13));
  pill.appendChild(document.createTextNode(statusLabel(provider.status)));
  const close = document.createElement("button");
  close.type = "button";
  close.className = "dlg__close";
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());
  header.append(title, pill, close);
  body.appendChild(header);

  // Active incidents (all of them, with impact + age + regions).
  const active = provider.activeIncidents;
  const incSection = el("section", "dlg__section");
  const incHeading = el("h3", "dlg__h3");
  incHeading.textContent = active.length ? "Active incidents" : "No active incidents";
  incSection.appendChild(incHeading);
  for (const inc of active) {
    const counted = isUsRelevant(inc);
    const row = el("div", counted ? "dlg-incident" : "dlg-incident dlg-incident--muted");
    const head = el("div", "dlg-incident__head");
    head.append(impactDot(inc.impact), incidentTitle(inc.title, inc.url));
    const meta = el("p", "dlg-incident__meta");
    meta.textContent = `${inc.impact} · ${inc.status} · ${startedAgo(inc.startedAt, now)}`;
    row.append(head, meta);
    const tag = regionTag(inc.regions, counted);
    if (tag) row.appendChild(tag);
    incSection.appendChild(row);
  }
  body.appendChild(incSection);

  // 90-day uptime bar (from rollups.json).
  if (data.rollups) {
    const upSection = el("section", "dlg__section");
    const upHeading = el("h3", "dlg__h3");
    upHeading.textContent = "90-day uptime";
    upSection.append(upHeading, renderUptimeBar(data.rollups, provider.id));
    body.appendChild(upSection);
  }

  // Uptime windows (shared with the card tiles).
  body.appendChild(renderUptimeWindows(provider.uptime, "dlg__uptime"));

  // Recent resolved incidents from the archive.
  if (data.resolvedIncidents.length > 0) {
    const histSection = el("section", "dlg__section");
    const histHeading = el("h3", "dlg__h3");
    histHeading.textContent = "Recently resolved";
    histSection.appendChild(histHeading);
    for (const rec of data.resolvedIncidents.slice(0, 10)) {
      const row = el("div", "dlg-resolved");
      row.append(impactDot(rec.impact), incidentTitle(rec.title, rec.url));
      const when = el("span", "dlg-resolved__when");
      when.textContent = rec.resolvedAt ? `resolved ${rec.resolvedAt.slice(0, 10)}` : "";
      row.appendChild(when);
      histSection.appendChild(row);
    }
    body.appendChild(histSection);
  }

  dialog.appendChild(body);

  // Click on the backdrop (outside the content body) closes.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  return dialog;
}

/** Build, attach, and show the dialog; clean up the node when it closes. */
export function openProviderDialog(data: ProviderDialogData): HTMLDialogElement {
  const dialog = renderProviderDialog(data);
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", ""); // jsdom / very old browsers
  return dialog;
}

/** The resolved incidents for one provider, newest-first. */
export function resolvedFor(
  incidents: { incidents: IncidentRecord[] } | null,
  providerId: string,
): IncidentRecord[] {
  if (!incidents) return [];
  return incidents.incidents
    .filter((r) => r.providerId === providerId && r.resolvedAt !== null)
    .sort((a, b) => (a.resolvedAt! < b.resolvedAt! ? 1 : a.resolvedAt! > b.resolvedAt! ? -1 : 0));
}
