import {
  classify,
  type ProviderSnapshot,
  type ProviderStatus,
  type StateFile,
  type ProviderAlertState,
} from "@barometer/types";

/**
 * Alert state machine (SPEC §8). Pure: (prev state + this run's snapshots) ->
 * (new state + notifications). Alerts fire on transitions only. Debounce works
 * on the up/down/hold CLASS (not the exact status) so a worsening outage still
 * fires on the second check while single blips are filtered. maintenance and
 * unknown are "hold" states: they neither trigger nor recover, and reset the
 * active streak (no noise from planned work or transient fetch failures).
 */

export interface Notification {
  kind: "outage" | "recovery";
  providerId: string;
  displayName: string;
  status: ProviderStatus;
  incidentTitle?: string;
  incidentUrl?: string;
}

const DEFAULT_THRESHOLD = 2;

function defaultProviderState(nowIso: string): ProviderAlertState {
  return {
    alertState: "operational",
    triggeringStatus: null,
    pendingStatus: null,
    consecutiveCount: 0,
    lastTransitionAt: nowIso,
    etag: null,
  };
}

export function stepAlerts(
  prev: StateFile,
  snapshots: ProviderSnapshot[],
  nowIso: string,
  threshold: number = DEFAULT_THRESHOLD,
): { state: StateFile; notifications: Notification[] } {
  const providers: Record<string, ProviderAlertState> = { ...prev.providers };
  const notifications: Notification[] = [];

  for (const snap of snapshots) {
    const before = prev.providers[snap.id] ?? defaultProviderState(nowIso);
    const { state, notification } = step(before, snap, nowIso, threshold);
    providers[snap.id] = state;
    if (notification) notifications.push(notification);
  }

  return { state: { providers, updatedAt: nowIso }, notifications };
}

function step(
  before: ProviderAlertState,
  snap: ProviderSnapshot,
  nowIso: string,
  threshold: number,
): { state: ProviderAlertState; notification: Notification | null } {
  const cls = classify(snap.status); // up | down | excluded(=hold)
  const state: ProviderAlertState = { ...before };

  if (state.alertState === "operational") {
    if (cls === "down") {
      const streakContinues = state.pendingStatus !== null && classify(state.pendingStatus) === "down";
      state.consecutiveCount = streakContinues ? state.consecutiveCount + 1 : 1;
      state.pendingStatus = snap.status;
      if (state.consecutiveCount >= threshold) {
        state.alertState = "alerting";
        state.triggeringStatus = snap.status;
        state.lastTransitionAt = nowIso;
        state.pendingStatus = null;
        state.consecutiveCount = 0;
        return { state, notification: outage(snap) };
      }
    } else {
      // up or hold: nothing pending toward an alert
      resetStreak(state);
    }
    return { state, notification: null };
  }

  // alertState === "alerting"
  if (cls === "up") {
    const streakContinues = state.pendingStatus !== null && classify(state.pendingStatus) === "up";
    state.consecutiveCount = streakContinues ? state.consecutiveCount + 1 : 1;
    state.pendingStatus = snap.status;
    if (state.consecutiveCount >= threshold) {
      state.alertState = "operational";
      state.triggeringStatus = null;
      state.lastTransitionAt = nowIso;
      state.pendingStatus = null;
      state.consecutiveCount = 0;
      return { state, notification: recovery(snap) };
    }
  } else {
    // down or hold: stay alerting, no re-alert, reset the recovery streak
    resetStreak(state);
  }
  return { state, notification: null };
}

function resetStreak(state: ProviderAlertState): void {
  state.pendingStatus = null;
  state.consecutiveCount = 0;
}

function outage(snap: ProviderSnapshot): Notification {
  const inc = snap.activeIncidents[0];
  return {
    kind: "outage",
    providerId: snap.id,
    displayName: snap.displayName,
    status: snap.status,
    ...(inc ? { incidentTitle: inc.title, incidentUrl: inc.url } : {}),
  };
}

function recovery(snap: ProviderSnapshot): Notification {
  return {
    kind: "recovery",
    providerId: snap.id,
    displayName: snap.displayName,
    status: snap.status,
  };
}
