// src/core/api/apiClient.ts
/**
 * Axios API client — shared singleton used by every repository in CampusAlert.
 *
 * ── Base URL design ───────────────────────────────────────────────────────────
 * The base URL includes the /api/v1 prefix:
 *   EXPO_PUBLIC_API_BASE_URL = "http://10.89.126.143:8000/api/v1"
 *
 * Endpoints in endpoints.ts are therefore SHORT and contain NO /api/v1:
 *   LOGIN = "/accounts/login/"
 *
 * Axios concatenates them correctly:
 *   "http://10.89.126.143:8000/api/v1" + "/accounts/login/"
 *   = "http://10.89.126.143:8000/api/v1/accounts/login/"  ✅
 *
 * ── Responsibilities ──────────────────────────────────────────────────────────
 *   1. Attaches the JWT access token to every outgoing request.
 *   2. Silently refreshes the access token on a 401 response.
 *   3. Queues concurrent 401s so only ONE refresh request fires.
 *   4. Calls the logout callback when both tokens are expired.
 *
 * ── Circular-import prevention ────────────────────────────────────────────────
 * This file MUST NOT import from authStore — that would create a circular
 * dependency (apiClient → authStore → apiClient).
 * Instead, App.tsx registers the logout callback via registerLogoutCallback()
 * after the stores are initialised.
 */

import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import * as SecureStore from "expo-secure-store";

import { ENDPOINTS } from "./endpoints";

// ─────────────────────────────────────────────────────────────────────────────
// SecureStore key constants
//
// These string keys name the encrypted "slots" on the device.
// Every file that reads/writes auth tokens must use these exact strings.
// Exporting them prevents silent bugs from duplicated string literals.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypted storage key names shared across the app.
 *
 * Import in any file that needs to read SecureStore directly:
 *   import { SECURE_KEYS } from '@core/api/apiClient';
 */
export const SECURE_KEYS = {
  /** Short-lived JWT access token (default: 60 minutes). */
  ACCESS_TOKEN: "auth_access_token",

  /** Long-lived JWT refresh token (default: 7 days). */
  REFRESH_TOKEN: "auth_refresh_token",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Base URL
//
// The base URL comes from the compile-time .env file.
// It includes the /api/v1 prefix so endpoints.ts stays clean.
//
// Priority:
//   1. EXPO_PUBLIC_API_BASE_URL  — primary env var (set in .env)
//   2. EXPO_PUBLIC_LAN_BASE_URL  — fallback env var name
//   3. http://10.0.2.2:8000/api/v1 — Android emulator → host machine fallback
//
// EXPO_PUBLIC_ prefix is mandatory — Expo strips all other env vars from the
// JavaScript bundle at build time.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.EXPO_PUBLIC_LAN_BASE_URL ??
  "http://10.0.2.2:8000/api/v1"; // Android emulator: 10.0.2.2 = host machine

// ─────────────────────────────────────────────────────────────────────────────
// URL normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cleans a URL string for use as an Axios baseURL.
 *
 * Removes trailing slashes to prevent double-slash when Axios concatenates:
 *   "http://host:8000/api/v1/"  + "/accounts/login/"
 *   = "http://host:8000/api/v1//accounts/login/"  ← broken ❌
 *
 *   "http://host:8000/api/v1"   + "/accounts/login/"
 *   = "http://host:8000/api/v1/accounts/login/"   ← correct ✅
 *
 * @param url - Raw URL string
 * @returns   URL with trailing slashes and whitespace removed
 */
function normaliseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Logout callback
//
// We can't import authStore directly (circular import), so App.tsx registers
// the logout function here after both are initialised.
// ─────────────────────────────────────────────────────────────────────────────

/** The function to call when both JWT tokens are expired. Null until registered. */
let _logoutCallback: (() => Promise<void>) | null = null;

/**
 * Registers the auth-clearing function invoked on irrecoverable 401 errors.
 *
 * Call once in App.tsx after Zustand stores are ready:
 *   registerLogoutCallback(useAuthStore.getState().clearAuth);
 *
 * @param callback - Clears SecureStore tokens and sets user to null in authStore.
 *                   RootNavigator automatically shows LoginScreen once user is null.
 */
export function registerLogoutCallback(callback: () => Promise<void>): void {
  _logoutCallback = callback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single Axios instance shared by ALL API calls in the app.
 *
 * Never create additional Axios instances — always import and use this one.
 * This ensures the JWT interceptors apply to every request automatically.
 *
 * Timeout is 15 seconds to handle slow campus Wi-Fi without frustrating users.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: normaliseUrl(DEFAULT_BASE_URL),
  timeout: 15_000, // 15 seconds — generous for LAN requests
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST INTERCEPTOR — attach JWT Bearer token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs before EVERY outgoing Axios request.
 *
 * What it does:
 * 1. Reads the current access token from SecureStore (encrypted on-device storage).
 * 2. Attaches it as an Authorization header: "Bearer <token>".
 * 3. If no token exists (user is not logged in), sends the request without auth.
 *    This is correct for public endpoints like /accounts/login/ and /accounts/register/.
 *
 * The token is read fresh on every request so that if the response interceptor
 * below refreshes the token and saves a new one, the next request picks it up
 * automatically without any extra wiring.
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Read the access token fresh from encrypted device storage
    const accessToken = await SecureStore.getItemAsync(
      SECURE_KEYS.ACCESS_TOKEN,
    );

    if (accessToken) {
      // Standard HTTP Bearer authentication — Django's JWTAuthentication reads this
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    // If no token: send request unauthenticated (valid for login/register)

    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE INTERCEPTOR — silent token refresh on 401 Unauthorized
//
// ── Why we need this ──────────────────────────────────────────────────────────
// JWT access tokens expire quickly (60 minutes by default). Without this
// interceptor, the app would show a login error 60 minutes after login, which
// is terrible UX.
//
// ── What we do instead ────────────────────────────────────────────────────────
// When Django returns 401 (access token expired):
// 1. We use the long-lived refresh token to obtain a new access token silently.
// 2. We save the new access token to SecureStore.
// 3. We retry the original failed request with the new token.
// The user sees nothing — the request just completes as if nothing happened.
//
// ── Concurrency handling ──────────────────────────────────────────────────────
// If multiple requests fire simultaneously and all get 401, only ONE refresh
// call should go out. The others queue up and wait for the refresh to complete,
// then retry. Without this queue, you'd get N simultaneous refresh requests,
// all but one of which would fail because the refresh token can only be used once.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True while a token refresh API call is in flight.
 * Prevents more than one refresh call from running at the same time.
 */
let _isRefreshing = false;

/**
 * Requests that arrived with a 401 while a refresh was already in progress.
 * Each entry holds resolve/reject for a Promise that wraps the original request.
 * When the refresh completes, we drain this queue to replay all waiting requests.
 */
let _refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

/**
 * Unblocks all requests queued during a token refresh.
 *
 * Called exactly once per refresh attempt:
 * - On success: resolve each queued request with the new access token.
 * - On failure: reject each queued request so callers see the error.
 *
 * @param newToken - New access token string on success, null on failure
 * @param error    - Error to propagate to waiting requests on failure
 */
function drainRefreshQueue(newToken: string | null, error: unknown): void {
  _refreshQueue.forEach(({ resolve, reject }) => {
    if (newToken !== null) {
      resolve(newToken); // Each queued request will retry with this token
    } else {
      reject(error); // Propagate the refresh failure to each caller
    }
  });
  _refreshQueue = []; // Reset for the next refresh cycle
}

apiClient.interceptors.response.use(
  // ── Success path: pass the response through unchanged ───────────────────────
  (response) => response,

  // ── Error path: attempt silent token refresh on 401 ─────────────────────────
  async (error: AxiosError) => {
    // Attach our custom _retried flag to the original request config
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      /**
       * True after we've already retried this request once.
       * Prevents an infinite loop: if the retry itself gets a 401
       * (e.g., the new token is immediately rejected), we give up.
       */
      _retried?: boolean;
    };

    // Guard: network errors before the request was sent have no config
    if (!originalRequest) {
      return Promise.reject(error);
    }

    const is401 = error.response?.status === 401;
    const alreadyRetried = originalRequest._retried === true;

    // Only intercept first-time 401 errors
    if (!is401 || alreadyRetried) {
      return Promise.reject(error); // Let the caller handle this normally
    }

    // Never try to refresh when the refresh endpoint itself returns 401 —
    // that would create: refresh → 401 → refresh → 401 → (infinite loop)
    const isRefreshCall = originalRequest.url?.includes(ENDPOINTS.AUTH.REFRESH);
    if (isRefreshCall) {
      return Promise.reject(error);
    }

    // Mark as retried so the retry doesn't trigger another refresh cycle
    originalRequest._retried = true;

    // ── Queue this request if a refresh is already running ───────────────────
    // Another request beat us to the refresh. We add ourselves to the queue
    // and wait for the ongoing refresh to complete.
    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({
          resolve: (token: string) => {
            // Refresh succeeded — attach new token and replay original request
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject, // Refresh failed — propagate error to this caller
        });
      });
    }

    // ── We are the first — start the refresh ────────────────────────────────
    _isRefreshing = true;

    try {
      // Read the refresh token from encrypted device storage
      const refreshToken = await SecureStore.getItemAsync(
        SECURE_KEYS.REFRESH_TOKEN,
      );

      if (!refreshToken) {
        // No refresh token at all — user was never logged in, or storage was cleared
        throw new Error("[ApiClient] No refresh token found — cannot refresh.");
      }

      // ── Call the token refresh endpoint ─────────────────────────────────────
      // CRITICAL: Use plain `axios` here, NOT `apiClient`.
      // If we used `apiClient`, this refresh call's potential 401 would
      // trigger THIS interceptor recursively → infinite loop.
      //
      // We build the full URL manually because we're not using apiClient's baseURL.
      const refreshResponse = await axios.post<{ access: string }>(
        `${apiClient.defaults.baseURL}${ENDPOINTS.AUTH.REFRESH}`,
        { refresh: refreshToken },
      );

      const newAccessToken = refreshResponse.data.access;

      // ── Save the new access token ─────────────────────────────────────────
      // The request interceptor above will pick this up on the very next request.
      await SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, newAccessToken);

      // ── Unblock all queued requests ────────────────────────────────────────
      drainRefreshQueue(newAccessToken, null);

      // ── Replay the original failed request ────────────────────────────────
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // ── Refresh failed — session is completely dead ───────────────────────
      // Both tokens are invalid/expired. The user must log in again.

      // Reject all queued requests so their callers receive the error
      drainRefreshQueue(null, refreshError);

      // Clear auth state — RootNavigator will render LoginScreen automatically
      if (_logoutCallback) {
        await _logoutCallback();
      } else {
        // Safety fallback if App.tsx hasn't registered the callback yet
        console.warn(
          "[ApiClient] No logout callback — clearing tokens directly.",
        );
        await Promise.allSettled([
          SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN),
          SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN),
        ]);
      }

      return Promise.reject(refreshError);
    } finally {
      // Always reset, so the NEXT 401 can start a fresh refresh cycle
      _isRefreshing = false;
    }
  },
);
