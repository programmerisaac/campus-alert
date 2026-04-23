// src/core/api/apiClient.ts
/**
 * Axios API client — shared singleton used by every repository in CampusAlert.
 *
 * Responsibilities:
 *   1. Attaches the JWT access token to every outgoing request via a request
 *      interceptor.
 *   2. Silently refreshes the access token on a 401 response (one retry per
 *      request). Concurrent 401s are queued so only ONE refresh request is
 *      ever in flight at a time.
 *   3. Calls the registered logout callback when the refresh token is also
 *      expired, forcing the user back to the login screen.
 *   4. Persists and restores a user-chosen server base URL via SecureStore so
 *      the campus LAN address survives app restarts.
 *
 * ── Circular-import prevention ────────────────────────────────────────────────
 * This file MUST NOT import from authStore. Doing so would create a cycle:
 *   authStore → apiClient → authStore
 * Instead, App.tsx calls registerLogoutCallback(useAuthStore.getState().clearAuth)
 * once on startup, and the interceptor invokes that callback when needed.
 */

import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import * as SecureStore from "expo-secure-store";

import { ENDPOINTS } from "./endpoints";

// ─────────────────────────────────────────────────────────────────────────────
// SecureStore keys
// Keep these constants in one place so they never drift out of sync with
// authStore.ts (which uses the same keys for tokens).
// ─────────────────────────────────────────────────────────────────────────────

/** Key under which the JWT access token is stored. */
const SECURE_KEY_ACCESS = "auth_access_token";

/** Key under which the JWT refresh token is stored. */
const SECURE_KEY_REFRESH = "auth_refresh_token";

/**
 * Key under which the user-chosen server base URL is persisted.
 * Written by setServerUrl(); read by restoreServerUrl() on app launch.
 */
const SECURE_KEY_SERVER_URL = "server_base_url";

// ─────────────────────────────────────────────────────────────────────────────
// Default base URL
//
// Expo only exposes variables to the JS bundle when they are prefixed with
// EXPO_PUBLIC_. Both names are checked so the .env file can use either.
// The Android emulator loopback alias (10.0.2.2) is the last-resort fallback
// so developers can run the app against a local Django server without any .env.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.EXPO_PUBLIC_LAN_BASE_URL ??
  "http://10.0.2.2:8000/api/v1";

// ─────────────────────────────────────────────────────────────────────────────
// Logout callback registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Holds the async function that clears all auth state when both tokens expire.
 * Null until App.tsx calls registerLogoutCallback().
 */
let _logoutCallback: (() => Promise<void>) | null = null;

/**
 * Registers the function that will be called when the session is
 * irrecoverably expired (access token renewal fails).
 *
 * Call this once in App.tsx after Zustand stores are ready:
 * ```ts
 * registerLogoutCallback(useAuthStore.getState().clearAuth);
 * ```
 *
 * @param callback - Async function that clears local auth state and
 *                   redirects the user to the login screen.
 */
export function registerLogoutCallback(callback: () => Promise<void>): void {
  _logoutCallback = callback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared Axios instance.
 *
 * baseURL starts as the environment/default value but is overridden at runtime
 * by restoreServerUrl() (app launch) or setServerUrl() (user changes server).
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Server URL helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips leading/trailing whitespace and removes any trailing slashes from a
 * URL string so that Axios path concatenation works correctly.
 *
 * Example:
 *   " http://10.89.126.143:8000/api/v1/ " → "http://10.89.126.143:8000/api/v1"
 *
 * @param url - Raw URL string entered by the user or read from storage.
 * @returns   Normalised URL ready to be assigned to apiClient.defaults.baseURL.
 */
function normaliseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Restores the previously saved server base URL from SecureStore and applies
 * it to the Axios instance.
 *
 * ── When to call ──────────────────────────────────────────────────────────────
 * Call this ONCE during app startup, before any API requests are made.
 * RootNavigator.tsx already does this inside its initialisation effect.
 *
 * ── Behaviour ─────────────────────────────────────────────────────────────────
 * • If a URL was previously saved via setServerUrl(), it is restored and
 *   apiClient.defaults.baseURL is updated.
 * • If no URL has ever been saved, the environment/default URL is used and
 *   nothing is written to SecureStore.
 *
 * @returns The active base URL after restoration.
 */
export async function restoreServerUrl(): Promise<string> {
  try {
    const saved = await SecureStore.getItemAsync(SECURE_KEY_SERVER_URL);

    if (saved) {
      const normalised = normaliseUrl(saved);
      apiClient.defaults.baseURL = normalised;
      console.info(`[ApiClient] Restored saved server URL: ${normalised}`);
      return normalised;
    }

    // Nothing saved yet — keep the compile-time default.
    const defaultNormalised = normaliseUrl(DEFAULT_BASE_URL);
    apiClient.defaults.baseURL = defaultNormalised;
    console.info(`[ApiClient] Using default server URL: ${defaultNormalised}`);
    return defaultNormalised;
  } catch (error) {
    // SecureStore can fail on emulators without Play Services. Log and continue
    // so the app does not crash on startup.
    console.warn("[ApiClient] restoreServerUrl failed — using default.", error);
    return normaliseUrl(DEFAULT_BASE_URL);
  }
}

/**
 * Persists a new server base URL and immediately applies it to the Axios
 * instance so subsequent requests use the new address.
 *
 * ── When to call ──────────────────────────────────────────────────────────────
 * Call this from ServerUrlDialog when the user confirms a new server address.
 *
 * @param url - Full API base URL, e.g. "http://10.89.126.143:8000/api/v1".
 *              Must be a valid URL; validation should happen in the dialog
 *              before calling this function.
 */
export async function setServerUrl(url: string): Promise<void> {
  const normalised = normaliseUrl(url);
  await SecureStore.setItemAsync(SECURE_KEY_SERVER_URL, normalised);
  apiClient.defaults.baseURL = normalised;
  console.info(`[ApiClient] Server URL updated to: ${normalised}`);
}

/**
 * Removes the saved custom server URL from SecureStore and resets the Axios
 * instance back to the environment/compile-time default.
 *
 * Useful if you add a "Reset to default" button in Settings.
 */
export async function clearSavedServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEY_SERVER_URL);
  apiClient.defaults.baseURL = normaliseUrl(DEFAULT_BASE_URL);
  console.info(
    `[ApiClient] Custom server URL cleared. Reset to: ${apiClient.defaults.baseURL}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Request interceptor — attach Bearer token
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const accessToken = await SecureStore.getItemAsync(SECURE_KEY_ACCESS);

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ─────────────────────────────────────────────────────────────────────────────
// Response interceptor — silent token refresh on 401
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True while a refresh request is in flight.
 * Prevents multiple concurrent refresh requests when several API calls
 * receive a 401 at the same time.
 */
let _isRefreshing = false;

/**
 * Requests that arrived while a refresh was already in flight.
 * Each entry holds the resolve/reject pair for the queued Promise so we can
 * replay the original request once the new token arrives.
 */
let _refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

/**
 * Resolves or rejects every request that was queued during a token refresh.
 *
 * @param newToken - The newly issued access token, or null if refresh failed.
 * @param error    - The refresh error to forward when newToken is null.
 */
function drainRefreshQueue(newToken: string | null, error: unknown): void {
  _refreshQueue.forEach(({ resolve, reject }) => {
    if (newToken !== null) {
      resolve(newToken);
    } else {
      reject(error);
    }
  });
  _refreshQueue = [];
}

apiClient.interceptors.response.use(
  // ── Success path — pass through unchanged ──────────────────────────────────
  (response) => response,

  // ── Error path — attempt silent token refresh on 401 ──────────────────────
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      /** Prevents infinite retry loops on the same request. */
      _retried?: boolean;
    };

    // Guard: config can be undefined for network-level errors.
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Only intercept 401s that have not already been retried.
    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    // Never refresh on the refresh endpoint itself — that would loop forever.
    if (originalRequest.url?.includes(ENDPOINTS.AUTH.REFRESH)) {
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    // ── Queue this request if a refresh is already in progress ────────────────
    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    _isRefreshing = true;

    try {
      const refreshToken = await SecureStore.getItemAsync(SECURE_KEY_REFRESH);

      if (!refreshToken) {
        throw new Error("[ApiClient] No refresh token found in SecureStore.");
      }

      // Use a plain axios call (not apiClient) to avoid triggering this
      // interceptor recursively.
      const refreshResponse = await axios.post<{ access: string }>(
        `${apiClient.defaults.baseURL}${ENDPOINTS.AUTH.REFRESH}`,
        { refresh: refreshToken },
      );

      const newAccessToken = refreshResponse.data.access;

      // Persist the new access token for future requests.
      await SecureStore.setItemAsync(SECURE_KEY_ACCESS, newAccessToken);

      // Unblock all queued requests with the new token.
      drainRefreshQueue(newAccessToken, null);

      // Replay the original request with the new token.
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Both tokens are dead — force logout.
      drainRefreshQueue(null, refreshError);

      if (_logoutCallback) {
        await _logoutCallback();
      } else {
        // Fallback: wipe tokens directly if callback was never registered.
        console.warn(
          "[ApiClient] Logout callback not registered — clearing tokens directly.",
        );
        await Promise.allSettled([
          SecureStore.deleteItemAsync(SECURE_KEY_ACCESS),
          SecureStore.deleteItemAsync(SECURE_KEY_REFRESH),
        ]);
      }

      return Promise.reject(refreshError);
    } finally {
      _isRefreshing = false;
    }
  },
);
