// src/core/websocket/websocketClient.ts
/**
 * LAN WebSocket client for real-time campus alert delivery.
 *
 * ── What is a WebSocket? (Simple explanation) ─────────────────────────────────
 * Normal HTTP: Phone asks → Server answers → Connection closes. Repeat for each message.
 * WebSocket:   Phone connects → CONNECTION STAYS OPEN → Server can push messages
 *              to the phone AT ANY TIME without the phone asking first.
 *
 * This is perfect for alerts: when an admin sends an alert, Django immediately
 * pushes it to every connected phone over the open WebSocket connection.
 * The phone doesn't have to keep polling "are there new alerts?" every few seconds.
 *
 * ── Architecture in CampusAlert ───────────────────────────────────────────────
 *
 *   [Admin composes alert]
 *         ↓
 *   [Django saves alert to DB]
 *         ↓
 *   [Celery task publishes to Redis pub/sub channel "alerts"]
 *         ↓
 *   [Django ASGI consumer subscribes to Redis, receives message]
 *         ↓
 *   [Consumer pushes alert JSON to ALL connected WebSocket clients]
 *         ↓
 *   [This file's _handleMessage() receives it on the phone]
 *         ↓
 *   [onAlert callback is called → alert appears in the feed]
 *
 * ── Connection URL format ─────────────────────────────────────────────────────
 * ws://10.89.126.143:8000/ws/alerts/?token=<jwt_access_token>
 *
 * Why JWT in the query string?
 * The WebSocket handshake is an HTTP Upgrade request. You CAN send headers
 * during the initial handshake, but the browser WebSocket API (which React Native
 * also uses) doesn't let you set custom headers like "Authorization: Bearer ...".
 * So Django reads the token from ?token= in the URL query string instead.
 *
 * ── Reconnection strategy ─────────────────────────────────────────────────────
 * WiFi drops are common on campus. We automatically reconnect with
 * "exponential backoff":
 *   - First retry: wait 1 second
 *   - Second retry: wait 2 seconds
 *   - Third retry: wait 4 seconds
 *   - ... doubles each time, up to 30 seconds maximum
 *
 * This prevents hammering the server with constant reconnect attempts
 * during a prolonged outage.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   // Start listening (called after login):
 *   await wsClient.connect('10.89.126.143:8000', (alert) => {
 *     console.log('New alert received!', alert);
 *   });
 *
 *   // Stop listening (called on logout):
 *   wsClient.disconnect();
 *
 *   // Check if connected:
 *   if (wsClient.isConnected) { ... }
 */

// ── Fix for error: "Module '@core/api/apiClient' has no exported member 'SECURE_KEYS'" ──
// The old apiClient.ts kept SecureStore keys as private constants.
// They are now exported as the SECURE_KEYS object so this file can import them.
// This avoids duplicating the key string literals ("auth_access_token" etc.)
// in multiple files, which would cause silent bugs if they ever drifted apart.
import { SECURE_KEYS } from "@core/api/apiClient";
import type { Alert } from "@models/Alert";
import * as SecureStore from "expo-secure-store";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The delay doubles on each failed reconnect attempt, up to this ceiling.
 * 30 seconds prevents excessive reconnect attempts during long outages.
 */
const MAX_RECONNECT_DELAY_MS = 30_000; // 30 seconds

/**
 * How long to wait before the FIRST reconnect attempt after a disconnect.
 * 1 second is fast enough to feel responsive but not aggressive.
 */
const INITIAL_RECONNECT_DELAY_MS = 1_000; // 1 second

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Function signature for the alert notification callback.
 * Called each time a new_alert message arrives from Django.
 *
 * @param alert - The full Alert object as serialised by Django's AlertSerializer
 */
type AlertCallback = (alert: Alert) => void;

// ─────────────────────────────────────────────────────────────────────────────
// WebSocketClient class
// ─────────────────────────────────────────────────────────────────────────────

class WebSocketClient {
  /** The active WebSocket connection, or null when disconnected. */
  private socket: WebSocket | null = null;

  /**
   * Current reconnect delay in milliseconds.
   * Starts at INITIAL_RECONNECT_DELAY_MS, doubles on each failure,
   * resets to initial value on successful connection.
   */
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

  /**
   * Handle for the pending reconnect setTimeout.
   * Stored so we can cancel it if disconnect() is called while waiting.
   */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * When true, reconnection is suppressed.
   * Set to true by disconnect() (explicit logout/stop).
   * Set to false by connect() (user logs in).
   */
  private intentionalDisconnect = false;

  /**
   * The function to call when a new alert arrives from Django.
   * Set by connect(), cleared by disconnect().
   */
  private onAlertCallback: AlertCallback | null = null;

  /**
   * The server address (host:port) for the WebSocket URL.
   * Example: "10.89.126.143:8000"
   * Stored so _openSocket() can rebuild the URL on reconnects.
   */
  private serverIp: string = "";

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Opens a WebSocket connection to Django's LAN alert consumer.
   *
   * This reads the JWT access token from SecureStore and appends it
   * to the WebSocket URL as a query parameter.
   *
   * Safe to call multiple times — calling connect() while already connected
   * will close the old connection and open a new one.
   *
   * @param serverIp - Host and port of the Django server, e.g. "10.89.126.143:8000"
   *                   Do NOT include ws:// or any path — this method adds those.
   * @param onAlert  - Callback invoked every time an alert message arrives from Django
   *
   * @example
   * await wsClient.connect('10.89.126.143:8000', (alert) => {
   *   useAlertStore.getState().prependAlert(alert);
   * });
   */
  async connect(serverIp: string, onAlert: AlertCallback): Promise<void> {
    // Store these so _openSocket() and _scheduleReconnect() can use them
    this.serverIp = serverIp;
    this.onAlertCallback = onAlert;

    // Allow reconnection (in case connect() is called after a disconnect())
    this.intentionalDisconnect = false;

    // Open the actual WebSocket connection
    await this._openSocket();
  }

  /**
   * Permanently closes the WebSocket connection.
   *
   * After calling disconnect():
   * - No more alert callbacks will fire
   * - No reconnection attempts will be made
   * - The connection is closed cleanly (WebSocket close code 1000)
   *
   * Call this on user logout or app teardown.
   */
  disconnect(): void {
    // Signal that this disconnect is intentional (suppress reconnection)
    this.intentionalDisconnect = true;

    // Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close the socket if it exists
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    console.info("[WebSocketClient] Disconnected intentionally.");
  }

  /**
   * True if the WebSocket connection is currently open and ready.
   *
   * WebSocket readyState values:
   *   0 = CONNECTING — handshake in progress
   *   1 = OPEN       — connected and ready
   *   2 = CLOSING    — close handshake in progress
   *   3 = CLOSED     — connection closed
   *
   * We only return true for state 1 (OPEN).
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // ─── Private methods ────────────────────────────────────────────────────────

  /**
   * Creates and opens the WebSocket connection to Django.
   *
   * Steps:
   * 1. Read JWT access token from SecureStore
   * 2. Build the WebSocket URL with the token as a query parameter
   * 3. Create the WebSocket and attach event handlers
   *
   * Called by connect() initially, then by _scheduleReconnect() on each retry.
   */
  private async _openSocket(): Promise<void> {
    // ── Read JWT token ────────────────────────────────────────────────────────
    // Django's WebSocket consumer validates this token to identify the user.
    // We use the same SecureStore key as authStore uses to store the token.
    const token = await SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);

    if (!token) {
      // No token means the user isn't logged in. Don't try to connect.
      // This can happen if connect() is called before login completes.
      console.warn(
        "[WebSocketClient] No access token found in SecureStore. " +
          "Cannot connect — user may not be logged in.",
      );
      return;
    }

    // ── Build WebSocket URL ────────────────────────────────────────────────────
    // Format: ws://10.89.126.143:8000/ws/alerts/?token=eyJhbG...
    //
    // Django's consumer reads: scope['query_string'] → parses ?token=...
    // This matches the route in asgi.py: '/ws/alerts/'
    //
    // We use ws:// (not wss://) because we're on a local LAN without SSL.
    // In production with SSL, change this to wss://.
    const url = `ws://${this.serverIp}/ws/alerts/?token=${token}`;

    console.info(
      `[WebSocketClient] Connecting to: ws://${this.serverIp}/ws/alerts/`,
    );

    // ── Create WebSocket ──────────────────────────────────────────────────────
    this.socket = new WebSocket(url);

    // ── Event: connection opened ──────────────────────────────────────────────
    this.socket.onopen = () => {
      console.info("[WebSocketClient] LAN connection established.");
      // Reset backoff delay so the NEXT disconnect starts with a 1s retry
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    };

    // ── Event: message received from Django ───────────────────────────────────
    this.socket.onmessage = (event) => {
      // event.data is a string — parse it and route to the correct handler
      this._handleMessage(event.data as string);
    };

    // ── Event: connection error ───────────────────────────────────────────────
    // This fires when the connection attempt fails (e.g., server unreachable)
    // or when an established connection encounters an error.
    // onclose always fires after onerror, so reconnection is handled there.
    this.socket.onerror = (event) => {
      console.warn(
        "[WebSocketClient] Socket error. Will attempt to reconnect.",
        event,
      );
    };

    // ── Event: connection closed ──────────────────────────────────────────────
    // Fires when the connection drops for any reason:
    // - WiFi lost
    // - Server restarted
    // - Django closed the connection (e.g., invalid token)
    // - We called socket.close() via disconnect()
    this.socket.onclose = (event) => {
      if (!this.intentionalDisconnect) {
        // Unexpected close — schedule a reconnect with backoff
        console.info(
          `[WebSocketClient] Connection closed (code: ${event.code}, ` +
            `reason: "${event.reason || "none"}"). ` +
            `Retrying in ${this.reconnectDelay / 1000}s...`,
        );
        this._scheduleReconnect();
      }
    };
  }

  /**
   * Parses a raw WebSocket message string and routes it to the correct handler.
   *
   * Django sends JSON messages with a "type" field:
   *
   * Alert message:
   *   { "type": "new_alert", "alert": { ...Alert object... } }
   *
   * Heartbeat (keep-alive ping from Django):
   *   { "type": "heartbeat" }
   *
   * Error message:
   *   { "type": "error", "message": "..." }
   *
   * @param raw - Raw JSON string received from the WebSocket
   */
  private _handleMessage(raw: string): void {
    // ── Parse JSON ────────────────────────────────────────────────────────────
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // The server sent something that isn't valid JSON — log and ignore
      console.warn(
        "[WebSocketClient] Received non-JSON message (ignoring):",
        raw,
      );
      return;
    }

    // ── Route by message type ─────────────────────────────────────────────────
    const type = data.type as string | undefined;

    switch (type) {
      case "new_alert":
        // A new alert was dispatched — notify the app
        if (this.onAlertCallback) {
          // Django sends the full serialised alert object under the "alert" key
          const alert = data.alert as Alert;
          this.onAlertCallback(alert);
        }
        break;

      case "heartbeat":
        // Django sends a heartbeat every ~30 seconds to detect dead connections.
        // We must reply with a pong so Django knows we're still alive.
        // If Django doesn't receive a pong within its timeout, it closes the connection.
        this._sendPong();
        break;

      case "error":
        // Django sent us an error (e.g., invalid token, permission denied)
        console.warn(
          "[WebSocketClient] Received error from server:",
          data.message,
        );
        break;

      default:
        // Unknown message type — log for debugging but don't crash
        console.warn(
          "[WebSocketClient] Unknown message type received:",
          type,
          data,
        );
    }
  }

  /**
   * Sends a pong response to Django's heartbeat ping.
   *
   * Django's consumer sends { "type": "heartbeat" } periodically.
   * We reply with { "type": "pong" } to confirm the connection is alive.
   * If Django doesn't receive a pong within its timeout window,
   * it will close the connection from the server side.
   */
  private _sendPong(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "pong" }));
    }
  }

  /**
   * Schedules a reconnection attempt after the current backoff delay.
   *
   * ── Exponential backoff explained ─────────────────────────────────────────
   * When WiFi drops, we don't want every phone on campus to reconnect
   * simultaneously and overwhelm the server. Exponential backoff spreads
   * reconnection attempts over time:
   *
   * Attempt 1: wait 1s  (reconnectDelay = 1000ms)
   * Attempt 2: wait 2s  (reconnectDelay = 2000ms)
   * Attempt 3: wait 4s  (reconnectDelay = 4000ms)
   * Attempt 4: wait 8s  (reconnectDelay = 8000ms)
   * ...
   * Attempt N: wait 30s (capped at MAX_RECONNECT_DELAY_MS)
   *
   * Note: the delay DOUBLING happens AFTER we try to connect, not before.
   * So on a successful reconnect (onopen fires), reconnectDelay is reset
   * to INITIAL_RECONNECT_DELAY_MS so the next disconnect starts fresh.
   */
  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(async () => {
      // Check again — disconnect() might have been called during the wait
      if (!this.intentionalDisconnect) {
        // Double the delay for next time, capped at maximum
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          MAX_RECONNECT_DELAY_MS,
        );

        // Attempt to reconnect
        await this._openSocket();
      }
    }, this.reconnectDelay);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
//
// We export a single instance rather than the class itself.
// This means every file that imports wsClient gets the SAME connection object.
// If we exported the class, different files could accidentally create
// separate connections to Django.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single WebSocket client instance for the entire app.
 *
 * Import and use this directly:
 * ```ts
 * import { wsClient } from '@core/websocket/websocketClient';
 *
 * // After login:
 * await wsClient.connect('10.89.126.143:8000', handleAlert);
 *
 * // On logout:
 * wsClient.disconnect();
 * ```
 */
export const wsClient = new WebSocketClient();
