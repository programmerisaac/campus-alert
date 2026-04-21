// src/core/api/apiClient.ts
/**
 * Axios instance that serves as the single HTTP transport for the entire app.
 *
 * Responsibilities:
 *  - Attaches Bearer JWT access token to every outgoing request.
 *  - On 401, silently attempts one token refresh using the stored refresh token.
 *  - If refresh fails (token expired/blacklisted), calls onLogout() to clear auth state.
 *  - setServerUrl() switches the base URL at runtime for the LAN/hotspot mode.
 *
 * Usage:
 *   import { apiClient } from '@core/api/apiClient';
 *   const response = await apiClient.get(ENDPOINTS.ALERTS.FEED);
 */

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";
import * as SecureStore from "expo-secure-store";
import { ENDPOINTS } from "./endpoints";

// ─── Secure Storage Keys ───────────────────────────────────────────────────────
export const SECURE_KEYS = {
  ACCESS_TOKEN: "campusalert_access_token",
  REFRESH_TOKEN: "campusalert_refresh_token",
  SERVER_URL: "campusalert_server_url",
} as const;

/** Default internet-mode base URL, read from Expo Constants at build time. */
const DEFAULT_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** Track ongoing refresh to prevent simultaneous refresh calls. */
let isRefreshing = false;
/** Queue of requests that arrived while a refresh was in progress. */
let failedQueue: {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}[] = [];

/** Callback registered by the auth store — called when refresh fails. */
let onLogoutCallback: (() => void) | null = null;

/**
 * Registers a function to be called when all token refresh attempts fail.
 * Call this once during app initialisation from the auth store.
 */
export function registerLogoutCallback(cb: () => void): void {
  onLogoutCallback = cb;
}

/** Flush the queue of waiting requests after a successful refresh. */
function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

// ─── Create Axios Instance ─────────────────────────────────────────────────────
export const apiClient: AxiosInstance = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─── Request Interceptor: attach access token ──────────────────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response Interceptor: silent 401 refresh ──────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh on 401 and only once per request.
    // Skip the refresh endpoint itself to avoid an infinite loop.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes(ENDPOINTS.AUTH.TOKEN_REFRESH)
    ) {
      if (isRefreshing) {
        // Another request is already refreshing — queue this one until done.
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync(
          SECURE_KEYS.REFRESH_TOKEN,
        );

        if (!refreshToken) {
          throw new Error("No refresh token stored.");
        }

        const { data } = await apiClient.post(ENDPOINTS.AUTH.TOKEN_REFRESH, {
          refresh: refreshToken,
        });

        const newAccessToken: string = data.access;

        // Persist the new access token.
        await SecureStore.setItemAsync(
          SECURE_KEYS.ACCESS_TOKEN,
          newAccessToken,
        );

        // Update the default Authorization header for future requests.
        apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;

        processQueue(null, newAccessToken);

        // Retry the original request with the new token.
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Refresh failed — clear all stored credentials and call logout.
        await SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN);
        await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN);

        if (onLogoutCallback) {
          onLogoutCallback();
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Switches the API base URL at runtime.
 * Used when the user enters a LAN IP address via the ServerUrlDialog.
 *
 * @param url - Full base URL, e.g. "http://192.168.1.5:8000/api/v1"
 */
export async function setServerUrl(url: string): Promise<void> {
  apiClient.defaults.baseURL = url;
  await SecureStore.setItemAsync(SECURE_KEYS.SERVER_URL, url);
}

/**
 * Restores the server URL from secure storage on app startup.
 * Falls back to DEFAULT_BASE_URL if nothing was saved.
 */
export async function restoreServerUrl(): Promise<void> {
  const saved = await SecureStore.getItemAsync(SECURE_KEYS.SERVER_URL);
  if (saved) {
    apiClient.defaults.baseURL = saved;
  }
}
