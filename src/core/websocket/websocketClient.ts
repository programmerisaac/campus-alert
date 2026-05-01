// src/core/websocket/websocketClient.ts
/**
 * LAN WebSocket client for real-time campus alert delivery.
 *
 * ── Architecture overview ─────────────────────────────────────────────────────
 *
 *   [Admin sends alert]
 *         ↓
 *   [Django saves to DB → Celery task → publishes to Redis pub/sub]
 *         ↓
 *   [Django ASGI consumer receives Redis message]
 *         ↓
 *   [Consumer pushes { type: "new_alert", alert: {...} } to all connected phones]
 *         ↓
 *   [This client's onmessage fires → onAlert callback → UI updates]
 *
 * ── Connection URL ────────────────────────────────────────────────────────────
 * The base URL comes from EXPO_PUBLIC_WS_BASE_URL in .env:
 *   ws://10.89.126.143:8000
 *
 * The client appends the path and JWT token:
 *   ws://10.89.126.143:8000/ws/alerts/?token=<jwt>
 *
 * ── Why env var, not a passed parameter? ─────────────────────────────────────
 * Previously connect() accepted a `serverIp` string from the caller.
 * This caused a bug where a stale IP (e.g. from a previous Wi-Fi network)
 * was passed in, leading to connection failures like:
 *   "failed to connect to /192.168.1.100 (port 8000)"
 *
 * The server address is a compile-time configuration value, not runtime data.
 * Reading it from the env var here makes the URL single-sourced and
 * eliminates an entire class of "wrong IP" bugs.
 *
 * ── Reconnection strategy ─────────────────────────────────────────────────────
 * Exponential backoff: 1s → 2s → 4s → 8s → ... capped at 30s.
 * Prevents hammering the server during an outage.
 */

import { SECURE_KEYS } from "@core/api/apiClient";
import type { Alert } from "@models/Alert";
import * as SecureStore from "expo-secure-store";

// ─────────────────────────────────────────────────────────────────────────────
// Server address — read from env var at module load time
//
// EXPO_PUBLIC_WS_BASE_URL should be the scheme + host + port ONLY.
// Example: "ws://10.89.126.143:8000"
// The path "/ws/alerts/" and "?token=..." are appended below.
//
// We strip trailing slashes so the concatenation is always clean:
//   "ws://10.89.126.143:8000" + "/ws/alerts/?token=..."  ✅
//   "ws://10.89.126.143:8000/" + "/ws/alerts/?token=..." → double slash ❌
// ─────────────────────────────────────────────────────────────────────────────

const RAW_WS_BASE = process.env.EXPO_PUBLIC_WS_BASE_URL ?? "ws://10.0.2.2:8000"; // Android emulator fallback

/**
 * Normalised WebSocket base URL — trailing slashes removed.
 * Example: "ws://10.89.126.143:8000"
 */
const WS_BASE_URL = RAW_WS_BASE.trim().replace(/\/+$/, "");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Starting delay for reconnection attempts. Doubles on each failure. */
const INITIAL_RECONNECT_DELAY_MS = 1_000; // 1 second

/** Maximum reconnection delay — caps the exponential backoff. */
const MAX_RECONNECT_DELAY_MS = 30_000; // 30 seconds

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called each time a new_alert message arrives from Django.
 * The caller (typically alertStore) updates the feed UI with the alert.
 */
type AlertCallback = (alert: Alert) => void;

// ─────────────────────────────────────────────────────────────────────────────
// WebSocketClient
// ─────────────────────────────────────────────────────────────────────────────

class WebSocketClient {
  /** The active WebSocket connection, or null when not connected. */
  private socket: WebSocket | null = null;

  /**
   * Current reconnect delay in ms.
   * Starts at INITIAL_RECONNECT_DELAY_MS, doubles on each failure,
   * resets to initial on successful connection.
   */
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

  /**
   * Handle for the pending reconnect timer.
   * Stored so disconnect() can cancel a scheduled reconnect immediately.
   */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * When true, automatic reconnection is suppressed.
   * Set true by disconnect() (intentional stop).
   * Set false by connect() (intentional start).
   */
  private intentionalDisconnect = false;

  /** Callback invoked when a new_alert message arrives from Django. */
  private onAlertCallback: AlertCallback | null = null;

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Opens a WebSocket connection to Django's ASGI alert consumer.
   *
   * The server address is read from EXPO_PUBLIC_WS_BASE_URL at module load
   * time — there is no `serverIp` parameter. This prevents stale or incorrect
   * IPs from being passed in by the caller.
   *
   * Safe to call while already connected — the old socket is closed cleanly
   * and a new one is opened.
   *
   * @param onAlert - Called every time a new alert is pushed from Django
   *
   * @example
   * // After login:
   * await wsClient.connect((alert) => {
   *   useAlertStore.getState().prependAlert(alert);
   * });
   *
   * // On logout:
   * wsClient.disconnect();
   */
  async connect(onAlert: AlertCallback): Promise<void> {
    this.onAlertCallback = onAlert;
    this.intentionalDisconnect = false;

    // Close any existing socket before opening a new one
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    await this._openSocket();
  }

  /**
   * Permanently closes the connection and suppresses all reconnection attempts.
   * Call this on user logout or app teardown.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;

    // Cancel any pending reconnect timer
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    console.info("[WebSocketClient] Disconnected intentionally.");
  }

  /**
   * True if the WebSocket is currently open and ready to receive messages.
   *
   * WebSocket readyState:
   *   0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // ─── Private methods ────────────────────────────────────────────────────────

  /**
   * Builds the WebSocket URL, reads the JWT from SecureStore, and
   * opens the connection with all four event handlers attached.
   *
   * Called by connect() initially and by _scheduleReconnect() on each retry.
   */
  private async _openSocket(): Promise<void> {
    // ── Read JWT access token ────────────────────────────────────────────────
    // Django's consumer validates this to authenticate the phone.
    // We use the same key as authStore so we're always reading the current token.
    const token = await SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);

    if (!token) {
      // User is not logged in yet — don't attempt to connect.
      // connect() will be called again after login succeeds.
      console.warn(
        "[WebSocketClient] No access token in SecureStore. " +
          "WebSocket connection deferred until after login.",
      );
      return;
    }

    // ── Build connection URL ─────────────────────────────────────────────────
    // Format: ws://10.89.126.143:8000/ws/alerts/?token=eyJhbG...
    //
    // The JWT goes in the query string because the browser/React Native
    // WebSocket API does not support custom headers during the HTTP Upgrade
    // handshake. Django reads it from scope['query_string'].
    //
    // WS_BASE_URL is fixed at module load from EXPO_PUBLIC_WS_BASE_URL.
    // It never changes at runtime — no stale IPs, no caller-supplied values.
    const url = `${WS_BASE_URL}/ws/alerts/?token=${token}`;

    console.info(`[WebSocketClient] Connecting to: ${WS_BASE_URL}/ws/alerts/`);

    // ── Create socket ────────────────────────────────────────────────────────
    this.socket = new WebSocket(url);

    // ── onopen: connection established ────────────────────────────────────────
    this.socket.onopen = () => {
      console.info("[WebSocketClient] Connection established successfully.");
      // Reset backoff so the NEXT disconnect starts with a 1s retry delay
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    };

    // ── onmessage: data received from Django ─────────────────────────────────
    this.socket.onmessage = (event) => {
      this._handleMessage(event.data as string);
    };

    // ── onerror: connection error ─────────────────────────────────────────────
    // This fires when the TCP connection fails (server unreachable, timeout, etc.)
    // onclose always fires immediately after onerror, so reconnection is handled
    // in onclose — we just log here.
    this.socket.onerror = () => {
      console.warn(
        `[WebSocketClient] Connection error on ${WS_BASE_URL}. ` +
          "Will retry via onclose handler.",
      );
    };

    // ── onclose: connection dropped ───────────────────────────────────────────
    // Fires for ALL closes: network drop, server restart, invalid token,
    // or our own disconnect() call.
    this.socket.onclose = (event) => {
      // Only reconnect if the close was NOT triggered by our disconnect() call
      if (!this.intentionalDisconnect) {
        console.info(
          `[WebSocketClient] Connection closed unexpectedly ` +
            `(code: ${event.code}, reason: "${event.reason || "none"}"). ` +
            `Retrying in ${this.reconnectDelay / 1_000}s...`,
        );
        this._scheduleReconnect();
      }
    };
  }

  /**
   * Parses a raw JSON string from Django and routes to the correct handler.
   *
   * Message shapes Django sends:
   *   { "type": "new_alert", "alert": { ...Alert } }  — new alert dispatched
   *   { "type": "heartbeat" }                          — keep-alive ping
   *   { "type": "error",    "message": "..." }         — server-side error
   *
   * @param raw - Raw JSON string from the WebSocket message event
   */
  private _handleMessage(raw: string): void {
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.warn(
        "[WebSocketClient] Received non-JSON message — ignoring:",
        raw,
      );
      return;
    }

    const type = data.type as string | undefined;

    switch (type) {
      case "new_alert":
        // Django pushed a new alert — notify the caller (alertStore)
        if (this.onAlertCallback && data.alert) {
          this.onAlertCallback(data.alert as Alert);
        }
        break;

      case "heartbeat":
        // Django sends a heartbeat every ~30s to detect dead connections.
        // We reply with "pong" so Django knows we're alive.
        // If Django doesn't receive a pong within its timeout, it closes the socket.
        this._sendPong();
        break;

      case "error":
        // Django rejected our connection or encountered a server error.
        // Common cause: JWT token was invalid or expired at handshake time.
        console.warn(
          "[WebSocketClient] Server error message received:",
          data.message,
        );
        break;

      default:
        // Unknown message type — log it but don't crash
        console.warn(
          "[WebSocketClient] Unknown message type received:",
          type,
          data,
        );
    }
  }

  /**
   * Sends a pong reply to Django's heartbeat message.
   *
   * Django expects { "type": "pong" } within its configured timeout window.
   * If the pong doesn't arrive, Django closes the connection from its side.
   */
  private _sendPong(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "pong" }));
    }
  }

  /**
   * Schedules a reconnection attempt after the current backoff delay.
   *
   * Exponential backoff prevents thundering-herd problems when many phones
   * all try to reconnect simultaneously after a server restart:
   *
   *   Attempt 1: wait 1s
   *   Attempt 2: wait 2s
   *   Attempt 3: wait 4s
   *   Attempt 4: wait 8s
   *   Attempt 5+: wait 30s (capped)
   *
   * On successful reconnection (onopen fires), the delay resets to 1s.
   */
  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(async () => {
      // Re-check in case disconnect() was called during the wait
      if (!this.intentionalDisconnect) {
        // Double the delay for the next attempt, capped at maximum
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          MAX_RECONNECT_DELAY_MS,
        );
        await this._openSocket();
      }
    }, this.reconnectDelay);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
//
// One instance = one connection = no duplicate messages.
// Import this directly in every file that needs WS access.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single WebSocket client instance for the entire app.
 *
 * Usage:
 * ```ts
 * import { wsClient } from '@core/websocket/websocketClient';
 *
 * // After login — no IP argument needed, reads from env var automatically:
 * await wsClient.connect((alert) => {
 *   useAlertStore.getState().prependAlert(alert);
 * });
 *
 * // On logout:
 * wsClient.disconnect();
 * ```
 */
export const wsClient = new WebSocketClient();
