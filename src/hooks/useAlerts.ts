// src/hooks/useAlerts.ts
/**
 * Convenience hook for reading alert state from the store.
 *
 * Returns the live alert feed, unread badge count, the pending full-screen
 * alert (if any), and the loading flag — everything a feed screen needs.
 */

import type { Alert } from "@models/Alert";
import { useAlertStore } from "@store/alertStore";

interface UseAlertsReturn {
  alerts: Alert[];
  unreadCount: number;
  pendingFullScreenAlert: Alert | null;
  isLoading: boolean;
  dismissFullScreen: () => void;
}

export function useAlerts(): UseAlertsReturn {
  const alerts = useAlertStore((s) => s.alerts);
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const pendingFullScreenAlert = useAlertStore((s) => s.pendingFullScreenAlert);
  const isLoading = useAlertStore((s) => s.isLoading);
  const dismissFullScreenAlert = useAlertStore((s) => s.dismissFullScreenAlert);

  return {
    alerts,
    unreadCount,
    pendingFullScreenAlert,
    isLoading,
    dismissFullScreen: dismissFullScreenAlert,
  };
}
