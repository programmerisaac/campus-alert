// src/core/websocket/websocketClient.ts
/**
 * LAN WebSocket client for Campus LAN alert delivery (Feature F-08).
 *
 * Connects to ws://<server>:8000/ws/alerts/?token=<jwt>
 * Django expects the JWT in the query string because the WebSocket
 * handshake cannot carry an Authorization header.
 *
 * Responsibilities:
 *   - Maintain a persistent connection to the Django ASGI consumer.
 *   - Automatically reconnect with exponential back-off on disconnect.
 *   - Route incoming messages to the registered onAlert callback.
 *   - Answer Django heartbeat pings with pong to keep the connection alive.
 *   - Stop reconnecting when disconnect() is called explicitly (e.g. logout).
 *
 * Usage:
 *   wsClient.connect(serverIp, jwtToken, (alert) => handleNewAlert(alert));
 *   wsClient.disconnect();
 */

import { SECURE_KEYS } from "@core/api/apiClient";
import type { Alert } from "@models/Alert";
import * as SecureStore from "expo-secure-store";

/** Maximum back-off delay between reconnect attempts, in milliseconds. */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Initial back-off delay on first disconnect, in milliseconds. */
const INITIAL_RECONNECT_DELAY_MS = 1_000;

type AlertCallback = (alert: Alert) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;
  private onAlertCallback: AlertCallback | null = null;
  private serverIp: string = "";

  /**
   * Establishes the WebSocket connection to the Django LAN consumer.
   *
   * @param serverIp     - IP and port of the LAN server, e.g. "192.168.1.5:8000"
   * @param onAlert      - Callback invoked whenever a new_alert message arrives
   */
  async connect(serverIp: string, onAlert: AlertCallback): Promise<void> {
    this.serverIp = serverIp;
    this.onAlertCallback = onAlert;
    this.intentionalDisconnect = false;
    this._openSocket();
  }

  /** Permanently closes the connection and suppresses all reconnect attempts. */
  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /** Returns true if the socket is currently in the OPEN state. */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private async _openSocket(): Promise<void> {
    const token = await SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);

    if (!token) {
      console.warn(
        "[WebSocketClient] No access token — skipping LAN connection.",
      );
      return;
    }

    // Django's WebSocket consumer reads the token from the query string
    // because the HTTP Upgrade handshake doesn't support custom headers.
    const url = `ws://${this.serverIp}/ws/alerts/?token=${token}`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.info("[WebSocketClient] LAN connection established.");
      // Reset back-off on successful connection.
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    };

    this.socket.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this.socket.onerror = (event) => {
      console.warn("[WebSocketClient] Socket error:", event);
    };

    this.socket.onclose = (event) => {
      if (!this.intentionalDisconnect) {
        console.info(
          `[WebSocketClient] Disconnected (code ${event.code}). Retrying in ${this.reconnectDelay}ms.`,
        );
        this._scheduleReconnect();
      }
    };
  }

  /** Parses an incoming WebSocket message and dispatches to the correct handler. */
  private _handleMessage(raw: string): void {
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(raw);
    } catch {
      console.warn("[WebSocketClient] Received non-JSON message:", raw);
      return;
    }

    const type = data.type as string | undefined;

    if (type === "new_alert" && this.onAlertCallback) {
      // The Django consumer sends the full serialised alert under the `alert` key.
      const alert = data.alert as Alert;
      this.onAlertCallback(alert);
    } else if (type === "heartbeat") {
      // Django sends periodic heartbeats — reply immediately to keep alive.
      this._sendPong();
    } else if (type === "error") {
      console.warn("[WebSocketClient] Server error:", data.message);
    }
  }

  /** Sends a pong in response to a Django heartbeat. */
  private _sendPong(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "pong" }));
    }
  }

  /**
   * Schedules a reconnect with exponential back-off, capped at MAX_RECONNECT_DELAY_MS.
   * Each failed attempt doubles the delay so that a sustained outage doesn't
   * hammer the server with constant reconnect noise.
   */
  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionalDisconnect) {
        this._openSocket();
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          MAX_RECONNECT_DELAY_MS,
        );
      }
    }, this.reconnectDelay);
  }
}

/** Singleton instance — import and use directly throughout the app. */
export const wsClient = new WebSocketClient();
