// src/features/alerts/alertRepository.ts
/**
 * Alert repository — the unified delivery pipeline for the student-facing feed.
 *
 * Wires three delivery sources into a single stream:
 *   1. REST API    — initial feed load and pagination
 *   2. WebSocket   — real-time LAN delivery (campus Wi-Fi, no internet)
 *   3. SQLite      — offline fallback read + missed-alert sync on reconnect
 *
 * All incoming alerts (regardless of source) are:
 *   - Upserted to SQLite (local cache)
 *   - Prepended to the alertStore feed
 *   - Checked for Critical/High urgency → triggers pendingFullScreenAlert
 *
 * Usage (called once from alertFeedScreen on mount):
 *   alertRepository.initialise(serverIp);
 *   // On unmount:
 *   alertRepository.teardown();
 */

import { apiClient } from "@core/api/apiClient";
import { ENDPOINTS } from "@core/api/endpoints";
import {
    getAllAlerts,
    markAlertAcknowledged,
    upsertAlert,
} from "@core/db/localDb";
import { wsClient } from "@core/websocket/websocketClient";
import type { AcknowledgePayload, Alert, PaginatedAlerts } from "@models/Alert";
import { connectivityService } from "@services/connectivityService";
import { syncMissedAlerts } from "@services/syncService";
import { useAlertStore } from "@store/alertStore";

class AlertRepository {
  private connectivityUnsub: (() => void) | null = null;

  /**
   * Performs the initial feed load and wires up live delivery sources.
   *
   * @param lanServerIp - IP:port of the LAN Django server, e.g. "192.168.1.5:8000"
   */
  async initialise(lanServerIp: string): Promise<void> {
    // Load the initial alert feed from the API (or SQLite if offline).
    await this._loadInitialFeed();

    // Wire up the connectivity-change handler to manage WebSocket and sync.
    this.connectivityUnsub = connectivityService.subscribe(async (state) => {
      if (state === "internet" || state === "lanOnly") {
        // Device came online — sync any missed alerts first.
        const missed = await syncMissedAlerts();
        missed.forEach((alert) => useAlertStore.getState().prependAlert(alert));
      }

      if (state === "lanOnly") {
        // Switch to WebSocket delivery over the campus LAN.
        await wsClient.connect(lanServerIp, this._onWebSocketAlert.bind(this));
      } else {
        // Disconnect WebSocket when we have internet (FCM handles it) or are offline.
        wsClient.disconnect();
      }
    });
  }

  /** Cleans up subscriptions and WebSocket on screen unmount. */
  teardown(): void {
    this.connectivityUnsub?.();
    wsClient.disconnect();
  }

  /**
   * Fetches a page of alerts from the REST API.
   * Called for initial load and for "load more" pagination.
   *
   * @param page    - Page number (1-based)
   * @param urgency - Optional urgency filter
   * @returns Paginated alerts response
   */
  async fetchAlertFeed(
    page: number = 1,
    urgency?: Alert["urgency"],
  ): Promise<PaginatedAlerts> {
    const connectState = connectivityService.state;

    if (connectState === "offline") {
      // No connectivity — return the local SQLite cache.
      const localAlerts = await getAllAlerts();
      return {
        count: localAlerts.length,
        next: null,
        previous: null,
        results: localAlerts,
      };
    }

    const params: Record<string, string | number> = { page };
    if (urgency) params.urgency = urgency;

    const response = await apiClient.get<PaginatedAlerts>(
      ENDPOINTS.ALERTS.FEED,
      { params },
    );
    return response.data;
  }

  /**
   * Sends an acknowledgement to the backend for a Critical/High alert.
   * Also marks the alert as acknowledged in local SQLite and the store.
   *
   * @param alertId - UUID of the alert to acknowledge
   * @param channel - Delivery channel that delivered this alert
   */
  async acknowledgeAlert(
    alertId: string,
    channel: AcknowledgePayload["channel"],
  ): Promise<void> {
    try {
      await apiClient.post(ENDPOINTS.ALERTS.ACKNOWLEDGE(alertId), { channel });
    } catch (err) {
      // Network failure during acknowledgement is non-fatal.
      // The local state is still updated so the UI reflects the action.
      console.warn("[AlertRepository] Acknowledge API call failed:", err);
    }

    await markAlertAcknowledged(alertId);
    useAlertStore.getState().acknowledgeAlert(alertId);
    useAlertStore.getState().dismissFullScreenAlert();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Loads the first page of alerts from the API and populates the store.
   * Falls back to the local SQLite cache if the device is offline.
   */
  private async _loadInitialFeed(): Promise<void> {
    useAlertStore.getState().setLoading(true);

    try {
      const data = await this.fetchAlertFeed(1);
      useAlertStore.getState().setAlerts(data.results);
    } catch (err) {
      // API call failed — try the local cache.
      console.warn(
        "[AlertRepository] Feed load failed, using SQLite cache:",
        err,
      );
      const localAlerts = await getAllAlerts();
      useAlertStore.getState().setAlerts(localAlerts);
    } finally {
      useAlertStore.getState().setLoading(false);
    }
  }

  /**
   * Handles a new_alert message from the LAN WebSocket.
   * Caches and prepends the alert to the feed, then triggers full-screen if needed.
   */
  private async _onWebSocketAlert(alert: Alert): Promise<void> {
    const taggedAlert: Alert = { ...alert, delivery_channel: "lan_websocket" };

    // Cache locally so the alert survives an app restart.
    await upsertAlert(taggedAlert);

    // Prepend to the live feed (also triggers full-screen if critical/high).
    useAlertStore.getState().prependAlert(taggedAlert);
  }
}

/** Singleton — import and use directly in the alert feed screen. */
export const alertRepository = new AlertRepository();
