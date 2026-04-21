// src/services/connectivityService.ts
/**
 * Connectivity Service
 *
 * Monitors network state changes and automatically switches the Axios
 * base URL between the internet-facing server and the campus LAN server.
 *
 * ── Why This Exists ───────────────────────────────────────────────────────────
 * Students on campus may lose internet access but still be on the campus
 * Wi-Fi network. In that case, the Django server is reachable via LAN IP
 * even though internet.isReachable returns false.
 *
 * This service detects that scenario and switches the API client to the
 * LAN URL automatically — no user action needed.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 * // In App.tsx startup effect:
 * connectivityService.start();
 *
 * // In App.tsx cleanup:
 * return () => connectivityService.stop();
 *
 * ── Singleton Pattern ─────────────────────────────────────────────────────────
 * Only one NetInfo listener exists at a time.
 * Calling start() again safely removes the previous listener first.
 */

import { apiClient } from "@core/api/apiClient";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

// ── Private module state ──────────────────────────────────────────────────────

/**
 * Holds the NetInfo unsubscribe function.
 * Set by start(), cleared by stop().
 * Checked by start() to prevent duplicate listeners.
 */
let unsubscribe: (() => void) | null = null;

// ── Internal handler ──────────────────────────────────────────────────────────

/**
 * Processes a network state change from NetInfo.
 *
 * Decision logic:
 *  - Not connected at all → log only, do not change baseURL
 *    (requests will fail with network error, which the UI handles)
 *  - Connected + internet reachable → use API_BASE_URL (internet server)
 *  - Connected + internet NOT reachable → use LAN_BASE_URL (campus server)
 *
 * @param state - NetInfo network state object
 */
function handleConnectivityChange(state: NetInfoState): void {
  const isConnected = state.isConnected ?? false;
  const isInternetReachable = state.isInternetReachable ?? false;

  if (!isConnected) {
    console.info(
      "[Connectivity] Device is offline — no URL switch performed. " +
        "API calls will fail until connectivity is restored.",
    );
    return;
  }

  if (isInternetReachable) {
    // Full internet access — use the cloud server
    const internetUrl = process.env.API_BASE_URL;

    if (!internetUrl) {
      console.warn(
        "[Connectivity] API_BASE_URL is not set in .env — " +
          "cannot switch to internet URL.",
      );
      return;
    }

    // Only update if the URL actually changed (avoids redundant Axios updates)
    if (apiClient.defaults.baseURL !== internetUrl) {
      apiClient.defaults.baseURL = internetUrl;
      console.info(
        `[Connectivity] Internet reachable — switched to: ${internetUrl}`,
      );
    }
  } else {
    // On network but no internet — try campus LAN server
    const lanUrl = process.env.LAN_BASE_URL;

    if (!lanUrl) {
      console.warn(
        "[Connectivity] LAN_BASE_URL is not set in .env — " +
          "cannot switch to LAN URL. Set LAN_BASE_URL in your .env file.",
      );
      return;
    }

    if (apiClient.defaults.baseURL !== lanUrl) {
      apiClient.defaults.baseURL = lanUrl;
      console.info(
        `[Connectivity] Internet unreachable — switched to LAN: ${lanUrl}`,
      );
    }
  }
}

// ── Public service object ─────────────────────────────────────────────────────

export const connectivityService = {
  /**
   * Starts monitoring network connectivity.
   *
   * Registers a NetInfo listener that fires immediately with the current
   * state, then fires again on every subsequent change.
   *
   * Safe to call multiple times — any existing listener is removed first.
   *
   * Call this in App.tsx inside the startup useEffect.
   */
  start(): void {
    // Remove existing listener before adding a new one
    // Prevents duplicate listeners if start() is called more than once
    if (unsubscribe) {
      unsubscribe();
      console.info("[Connectivity] Removed existing listener before restart.");
    }

    unsubscribe = NetInfo.addEventListener(handleConnectivityChange);
    console.info("[Connectivity] Service started — monitoring network state.");
  },

  /**
   * Stops monitoring network connectivity and releases the listener.
   *
   * Call this in the cleanup function returned from the App.tsx useEffect.
   */
  stop(): void {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      console.info("[Connectivity] Service stopped.");
    }
  },
};
