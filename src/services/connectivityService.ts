// src/services/connectivityService.ts
/**
 * Connectivity service — monitors network state and notifies subscribers.
 *
 * Three possible states:
 *   "internet"  — device has a working internet connection (FCM is active)
 *   "lanOnly"   — device is on Wi-Fi but internet is unreachable (use WebSocket)
 *   "offline"   — no usable network (read from SQLite cache only)
 *
 * Usage:
 *   connectivityService.start();                          // in App.tsx useEffect
 *   const unsub = connectivityService.subscribe(handler); // in alertRepository
 *   connectivityService.state;                            // read current state
 *   connectivityService.stop();                           // on app teardown
 */

import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ConnectivityState = "internet" | "lanOnly" | "offline";

type ConnectivitySubscriber = (state: ConnectivityState) => void;

// ─── Service implementation ────────────────────────────────────────────────────

class ConnectivityService {
  /**
   * The current network state.
   * Starts as "offline" until the first NetInfo event is received.
   * Exposed as a public property so alertRepository can read it synchronously
   * inside fetchAlertFeed without waiting for a subscriber callback.
   */
  public state: ConnectivityState = "offline";

  /** Registered change listeners. Keyed by auto-incremented id for O(1) removal. */
  private _subscribers: Map<number, ConnectivitySubscriber> = new Map();
  private _nextId = 0;

  /** Unsubscribe function returned by NetInfo.addEventListener. */
  private _netInfoUnsub: (() => void) | null = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Begins monitoring network state.
   * Safe to call multiple times — subsequent calls are no-ops.
   * Called once from App.tsx useEffect on startup.
   */
  start(): void {
    if (this._netInfoUnsub) return; // Already started

    this._netInfoUnsub = NetInfo.addEventListener((netState: NetInfoState) => {
      const resolved = this._resolveState(netState);
      if (resolved !== this.state) {
        this.state = resolved;
        this._notifyAll(resolved);
      }
    });

    // Eagerly fetch the current state so `this.state` is accurate immediately
    // rather than waiting for the first change event.
    NetInfo.fetch().then((netState) => {
      const resolved = this._resolveState(netState);
      this.state = resolved;
      // Do NOT notify subscribers here — they haven't been registered yet
      // and this is the initial read, not a change.
    });
  }

  /**
   * Stops monitoring and removes all subscribers.
   * Called from App.tsx cleanup on unmount.
   */
  stop(): void {
    this._netInfoUnsub?.();
    this._netInfoUnsub = null;
    this._subscribers.clear();
  }

  // ─── Subscription ─────────────────────────────────────────────────────────

  /**
   * Registers a listener that is called every time the connectivity state changes.
   * The listener is NOT called immediately with the current state — use
   * `connectivityService.state` to read the current value synchronously.
   *
   * @param callback - Function called with the new ConnectivityState on every change
   * @returns Unsubscribe function — call it to stop receiving updates (e.g., on unmount)
   */
  subscribe(callback: ConnectivitySubscriber): () => void {
    const id = this._nextId++;
    this._subscribers.set(id, callback);

    return () => {
      this._subscribers.delete(id);
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Maps a raw NetInfo state to our three-tier ConnectivityState.
   *
   * Logic:
   *  - Not connected at all → "offline"
   *  - Connected AND internet is reachable → "internet"
   *  - Connected BUT internet is NOT reachable (campus LAN only) → "lanOnly"
   *
   * `isInternetReachable` can be null when NetInfo hasn't checked yet;
   * we treat null as reachable to avoid false "lanOnly" flashes on startup.
   */
  private _resolveState(netState: NetInfoState): ConnectivityState {
    if (!netState.isConnected) {
      return "offline";
    }

    // null means "unknown" — assume internet until proven otherwise
    if (netState.isInternetReachable === false) {
      return "lanOnly";
    }

    return "internet";
  }

  /** Calls all registered subscribers with the new state. */
  private _notifyAll(state: ConnectivityState): void {
    this._subscribers.forEach((callback) => {
      try {
        callback(state);
      } catch (err) {
        // Subscriber errors must not crash the service
        console.warn("[ConnectivityService] Subscriber threw:", err);
      }
    });
  }
}

/** Singleton — import and use directly throughout the app. */
export const connectivityService = new ConnectivityService();
