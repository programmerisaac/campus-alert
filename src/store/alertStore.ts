// src/store/alertStore.ts
/**
 * Global alert feed state managed with Zustand.
 *
 * Holds the in-memory list of alerts shown in the feed, the unread count
 * badge, and the currently pending full-screen alert (if any).
 *
 * The alertRepository writes into this store via its actions.
 * UI components read from it via hooks/useAlerts.ts.
 */

import type { Alert } from "@models/Alert";
import { create } from "zustand";

interface AlertState {
  /** Ordered list of alerts (most recent first) shown in the feed. */
  alerts: Alert[];

  /** Count of unread (unacknowledged) alerts — drives the tab badge. */
  unreadCount: number;

  /**
   * An alert that should trigger the full-screen takeover UI.
   * Set by prependAlert when urgency is critical or high.
   * Cleared by dismissFullScreenAlert once the user acknowledges.
   * Can also be set directly by setFullScreenAlert (notification tap path).
   */
  pendingFullScreenAlert: Alert | null;

  /** Whether an initial feed load is in progress. */
  isLoading: boolean;

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Replaces the entire feed (e.g. after a fresh API load or pull-to-refresh).
   * Deduplicates by ID so WebSocket-prepended alerts (full created_by object)
   * are not replaced by REST-fetched duplicates.
   */
  setAlerts: (alerts: Alert[]) => void;

  /**
   * Prepends a newly arrived alert to the feed list.
   * Increments unread count and sets pendingFullScreenAlert for
   * Critical/High urgency levels.
   * No-op if the alert ID already exists in the list (FCM + WS race guard).
   */
  prependAlert: (alert: Alert) => void;

  /** Marks a single alert as acknowledged in the store. */
  acknowledgeAlert: (alertId: string) => void;

  /** Clears the pending full-screen alert after the user dismisses it. */
  dismissFullScreenAlert: () => void;

  /**
   * Directly sets (or clears) the pending full-screen alert.
   * Used by the notification tap handler in AlertFeedScreen so that tapping
   * a Critical/High notification opens the modal even when the alert is not
   * yet in the feed list.
   */
  setFullScreenAlert: (alert: Alert | null) => void;

  setLoading: (loading: boolean) => void;

  /** Resets the entire store — called on logout. */
  reset: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  unreadCount: 0,
  pendingFullScreenAlert: null,
  isLoading: false,

  setAlerts: (alerts) => {
    // Deduplicate by ID — keeps the FIRST occurrence so WebSocket-prepended
    // alerts (which carry the full created_by nested object) are not
    // overwritten by a REST-fetched copy of the same alert.
    const seen = new Set<string>();
    const deduped = alerts.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    const unread = deduped.filter((a) => !a.acknowledged).length;
    set({ alerts: deduped, unreadCount: unread });
  },

  prependAlert: (alert) => {
    set((state) => {
      // Avoid duplicates if the same alert arrives via both FCM and WebSocket
      const isDuplicate = state.alerts.some((a) => a.id === alert.id);
      if (isDuplicate) return state;

      const newAlerts = [alert, ...state.alerts];
      const newUnread = state.unreadCount + (alert.acknowledged ? 0 : 1);

      // Trigger full-screen takeover for Critical and High alerts
      const isPendingFullScreen =
        (alert.urgency === "critical" || alert.urgency === "high") &&
        !alert.acknowledged;

      return {
        alerts: newAlerts,
        unreadCount: newUnread,
        pendingFullScreenAlert: isPendingFullScreen
          ? alert
          : state.pendingFullScreenAlert,
      };
    });
  },

  acknowledgeAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  dismissFullScreenAlert: () => set({ pendingFullScreenAlert: null }),

  setFullScreenAlert: (alert) => set({ pendingFullScreenAlert: alert }),

  setLoading: (isLoading) => set({ isLoading }),

  reset: () =>
    set({
      alerts: [],
      unreadCount: 0,
      pendingFullScreenAlert: null,
      isLoading: false,
    }),
}));
