// src/core/websocket/websocketClient.ts
/**
 * Singleton WebSocket client for real-time LAN alert delivery.
 *
 * Connects to ws://<server>/ws/alerts/?token=<jwt>
 * The Django ASGI consumer validates the JWT on handshake and pushes
 * { type: "new_alert", alert: {...} } messages when alerts are dispatched.
 *
 * Implements exponential backoff reconnect so temporary network drops
 * recover automatically without manual intervention.
 */

import type { Alert } from "@models/Alert";
import { useAuthStore } from "@store/authStore";

// Strip trailing slash to avoid double-slash in URL construction
const WS_BASE = (
  process.env.EXPO_PUBLIC_WS_BASE_URL ?? "ws://localhost:8080"
).replace(/\/$/, "");

const WS_PATH = "/ws/alerts/";

export type AlertCallback = (alert: Alert) => void | Promise<void>;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private callback: AlertCallback | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private attempts = 0;

  /**
   * Opens the WebSocket connection.
   * Reads the JWT access token from authStore at call time — no stale token risk.
   * Resolves when the handshake is complete (ws.onopen fires).
   * Rejects if the connection fails immediately.
   *
   * @param onAlert — Called every time the server pushes a new_alert message.
   */
  async connect(onAlert: AlertCallback): Promise<void> {
    this.callback = onAlert;
    this.intentionalClose = false;

    const token = useAuthStore.getState().tokens?.access;
    if (!token) {
      throw new Error("[wsClient] No JWT access token — user not logged in");
    }

    // Close any stale socket without triggering our auto-reconnect logic
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close(1000, "reconnecting");
      this.socket = null;
    }

    const url = `${WS_BASE}${WS_PATH}?token=${token}`;
    console.info(`[wsClient] Connecting to ${url}`);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.info("[wsClient] Connection established");
        this.socket = ws;
        this.attempts = 0; // reset backoff on successful connect
        resolve();
      };

      ws.onmessage = ({ data }) => {
        this._handleMessage(data as string);
      };

      ws.onerror = () => {
        // onerror always fires before onclose — reject the connect() promise here
        reject(new Error("[wsClient] WebSocket handshake failed"));
      };

      ws.onclose = ({ code, reason }) => {
        this.socket = null;
        console.log(`[wsClient] Closed — code: ${code}, reason: "${reason}"`);

        // Only auto-reconnect on abnormal closure (not our own disconnect() call)
        if (!this.intentionalClose && code !== 1000) {
          this._scheduleReconnect();
        }
      };

      this.socket = ws;
    });
  }

  /**
   * Closes the connection cleanly. Does NOT trigger the auto-reconnect path.
   * Call this from alertRepository.teardown() on screen unmount.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this._clearTimer();
    this.socket?.close(1000, "client-disconnect");
    this.socket = null;
    console.info("[wsClient] Disconnected intentionally");
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Parses incoming WebSocket messages and routes them.
   * Django ASGI consumer sends:
   *   { type: "new_alert", alert: { ...Alert fields... } }
   *   { type: "heartbeat" }  ← silently ignored
   */
  private _handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as Record<string, unknown>;

      if (msg.type === "new_alert" && msg.alert) {
        this.callback?.(msg.alert as Alert);
      }
      // heartbeat messages are intentionally ignored — they just keep the
      // connection alive through NAT/proxy idle timeouts
    } catch {
      console.warn("[wsClient] Could not parse message:", raw);
    }
  }

  /**
   * Schedules a reconnect attempt with exponential backoff.
   * Delays: 2s, 4s, 8s, 16s … capped at 30s.
   */
  private _scheduleReconnect(): void {
    this._clearTimer();
    this.attempts += 1;
    const delay = Math.min(1_000 * Math.pow(2, this.attempts), 30_000);

    console.log(
      `[wsClient] Scheduling reconnect in ${delay}ms (attempt ${this.attempts})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      if (this.intentionalClose || !this.callback) return;
      try {
        await this.connect(this.callback);
      } catch {
        // onclose will fire and _scheduleReconnect() will be called again
      }
    }, delay);
  }

  private _clearTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Singleton — one WebSocket connection for the entire app lifetime. */
export const wsClient = new WebSocketClient();
