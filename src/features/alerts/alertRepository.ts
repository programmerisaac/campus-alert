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
 * ── Changes from original ────────────────────────────────────────────────────
 * 1. initialise() no longer accepts a `lanServerIp` parameter.
 *    Previously callers passed an IP string which often carried stale or
 *    hardcoded values (e.g. "192.168.1.100:8000"). The WebSocket client
 *    (websocketClient.ts) now reads EXPO_PUBLIC_WS_BASE_URL at module load
 *    time, so the server address is a compile-time constant — never runtime
 *    data the caller can get wrong.
 *
 * 2. wsClient.connect() now takes ONE argument (the alert callback) instead
 *    of two. The IP was the first argument in the old signature; removing it
 *    here matches the updated WebSocketClient.connect(onAlert) signature.
 *
 * Usage (called once from AlertFeedScreen on mount):
 *   alertRepository.initialise();
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
  /**
   * Unsubscribe function returned by connectivityService.subscribe().
   * Stored so teardown() can remove the listener on unmount.
   */
  private connectivityUnsub: (() => void) | null = null;

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Performs the initial feed load and wires up all live delivery sources.
   *
   * No parameters needed — the server address is read from environment variables
   * at module load time inside websocketClient.ts (EXPO_PUBLIC_WS_BASE_URL).
   *
   * Call once from AlertFeedScreen's useEffect on mount.
   * Always pair with teardown() in the cleanup return.
   */
  async initialise(): Promise<void> {
    // Step 1: Load the first page of alerts immediately on mount.
    // Falls back to SQLite cache if the device is offline.
    await this._loadInitialFeed();

    // Step 2: Subscribe to connectivity changes.
    // The handler fires whenever the device transitions between:
    //   offline → lanOnly → internet  (or any combination)
    this.connectivityUnsub = connectivityService.subscribe(async (state) => {
      // ── Coming online (either LAN or full internet) ────────────────────────
      // Fetch any alerts that arrived while the device was offline.
      // syncMissedAlerts() calls GET /alerts/missed/?since=<last_cached_ts>
      // and bulk-upserts results into SQLite before returning them.
      if (state === "internet" || state === "lanOnly") {
        const missed = await syncMissedAlerts();
        missed.forEach((alert) => useAlertStore.getState().prependAlert(alert));
      }

      // ── Campus LAN mode (Wi-Fi without internet) ───────────────────────────
      // FCM push notifications require internet, so we fall back to WebSocket
      // for real-time delivery over the local campus network.
      //
      // wsClient.connect() takes ONE argument — the callback function.
      // The server URL is derived from EXPO_PUBLIC_WS_BASE_URL inside
      // websocketClient.ts — the caller does NOT pass an IP.
      if (state === "lanOnly") {
        await wsClient.connect(this._onWebSocketAlert.bind(this));
      } else {
        // Internet mode: FCM handles push delivery — WebSocket not needed.
        // Offline mode: no connectivity at all — disconnect cleanly.
        wsClient.disconnect();
      }
    });
  }

  /**
   * Cleans up all subscriptions and closes the WebSocket connection.
   * Must be called from AlertFeedScreen's useEffect cleanup (return function).
   */
  teardown(): void {
    // Remove the connectivity change listener
    this.connectivityUnsub?.();
    this.connectivityUnsub = null;

    // Close the WebSocket connection cleanly
    wsClient.disconnect();
  }

  /**
   * Fetches a page of alerts from the REST API.
   *
   * When offline, returns the locally cached SQLite alerts instead of making
   * a network request that would fail. The returned shape matches the paginated
   * API response so callers don't need to know the difference.
   *
   * @param page    - 1-based page number (default: 1)
   * @param urgency - Optional urgency filter applied server-side
   * @returns       Paginated alerts response (or local cache when offline)
   */
  async fetchAlertFeed(
    page: number = 1,
    urgency?: Alert["urgency"],
  ): Promise<PaginatedAlerts> {
    const connectState = connectivityService.state;

    // Offline fallback — return SQLite cache as a fake paginated response.
    // next: null tells the caller there are no more pages (no point retrying).
    if (connectState === "offline") {
      const localAlerts = await getAllAlerts();
      return {
        count: localAlerts.length,
        next: null,
        previous: null,
        results: localAlerts,
      };
    }

    // Build query params — only include urgency if it was provided
    const params: Record<string, string | number> = { page };
    if (urgency) params.urgency = urgency;

    const response = await apiClient.get<PaginatedAlerts>(
      ENDPOINTS.ALERTS.FEED,
      { params },
    );
    return response.data;
  }

  /**
   * Acknowledges a Critical/High alert.
   *
   * Three things happen in sequence:
   * 1. POST to the backend so the server records the acknowledgement
   * 2. Mark the alert as acknowledged in local SQLite (survives restart)
   * 3. Update alertStore so the UI reflects the acknowledged state immediately
   *
   * The API call failure is non-fatal — local state is always updated so the
   * full-screen alert is dismissed even if the network is down.
   *
   * @param alertId - UUID of the alert to acknowledge
   * @param channel - How this device received the alert (fcm/lan_websocket/offline_stored)
   */
  async acknowledgeAlert(
    alertId: string,
    channel: AcknowledgePayload["channel"],
  ): Promise<void> {
    try {
      await apiClient.post(ENDPOINTS.ALERTS.ACKNOWLEDGE(alertId), { channel });
    } catch (err) {
      // Log but don't throw — the screen will still dismiss and local state
      // will be updated below.
      console.warn("[AlertRepository] Acknowledge API call failed:", err);
    }

    // Always update local state, even if the API call failed
    await markAlertAcknowledged(alertId);
    useAlertStore.getState().acknowledgeAlert(alertId);
    useAlertStore.getState().dismissFullScreenAlert();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Loads the first page of alerts from the API and sets them in the store.
   * Falls back to the local SQLite cache if the API call fails (offline/error).
   */
  private async _loadInitialFeed(): Promise<void> {
    useAlertStore.getState().setLoading(true);

    try {
      const data = await this.fetchAlertFeed(1);
      useAlertStore.getState().setAlerts(data.results);
    } catch (err) {
      // API failed — this is normal if the device is offline at launch.
      // The SQLite cache contains previously received alerts.
      console.warn(
        "[AlertRepository] Initial feed load failed — using SQLite cache:",
        err,
      );
      const localAlerts = await getAllAlerts();
      useAlertStore.getState().setAlerts(localAlerts);
    } finally {
      useAlertStore.getState().setLoading(false);
    }
  }

  /**
   * Callback passed to wsClient.connect().
   * Called every time the Django consumer pushes a new_alert message.
   *
   * Tags the alert with delivery_channel = "lan_websocket" so the UI can
   * show "Received via Campus Wi-Fi" in the detail screen.
   *
   * @param alert - The full Alert object as sent by Django's AlertSerializer
   */
  private async _onWebSocketAlert(alert: Alert): Promise<void> {
    // Tag the alert so the detail screen can show the delivery channel
    const taggedAlert: Alert = { ...alert, delivery_channel: "lan_websocket" };

    // Persist to SQLite so the alert survives an app restart or network loss
    await upsertAlert(taggedAlert);

    // Add to the live feed — alertStore.prependAlert() also sets
    // pendingFullScreenAlert if urgency is critical or high
    useAlertStore.getState().prependAlert(taggedAlert);
  }
}

/**
 * Singleton instance — import and use this directly.
 * One instance ensures there is never more than one WebSocket connection
 * or connectivity subscriber open at the same time.
 */
export const alertRepository = new AlertRepository();
