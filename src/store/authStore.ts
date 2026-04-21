// src/store/authStore.ts
/**
 * Global authentication state managed with Zustand.
 *
 * This is the single source of truth for:
 *   - Whether the user is logged in
 *   - The full User profile object
 *   - The JWT access + refresh token pair
 *   - The app's initialisation state (restoring session on launch)
 *
 * Actions:
 *   setAuth()   — called after login/register with tokens + user
 *   clearAuth() — called on logout or when refresh fails
 *   setUser()   — updates the user profile (e.g. after PATCH /accounts/me/)
 */

import { SECURE_KEYS, registerLogoutCallback } from "@core/api/apiClient";
import type { AuthTokens, User } from "@models/User";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

interface AuthState {
  /** null = not yet determined (app is loading); false = logged out; User = logged in */
  user: User | null;
  isInitialised: boolean;

  // ─── Actions ──────────────────────────────────────────────────────────────
  /**
   * Persists tokens to SecureStore and sets the user profile in memory.
   * Call this after a successful login or registration API response.
   */
  setAuth: (tokens: AuthTokens, user: User) => Promise<void>;

  /**
   * Wipes all stored credentials from SecureStore and resets in-memory state.
   * Call this on logout or when a token refresh permanently fails.
   */
  clearAuth: () => Promise<void>;

  /**
   * Replaces the in-memory user profile without touching stored tokens.
   */
  setUser: (user: User) => void;

  /**
   * Attempts to restore a previous session by reading stored tokens from SecureStore.
   * Called once during app startup. Sets isInitialised = true when done.
   */
  restoreSession: () => Promise<User | null>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Register the clearAuth callback with the API client so it can call logout
  // when a token refresh fails mid-request. This wires the interceptor to the store.
  // We call it inside the factory function so it runs once at module load time.
  registerLogoutCallback(() => get().clearAuth());

  return {
    user: null,
    isInitialised: false,

    setAuth: async (tokens, user) => {
      await SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, tokens.access);
      await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, tokens.refresh);
      set({ user });
    },

    clearAuth: async () => {
      await SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN);
      await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN);
      set({ user: null });
    },

    setUser: (user) => set({ user }),

    restoreSession: async () => {
      try {
        const accessToken = await SecureStore.getItemAsync(
          SECURE_KEYS.ACCESS_TOKEN,
        );
        const refreshToken = await SecureStore.getItemAsync(
          SECURE_KEYS.REFRESH_TOKEN,
        );

        if (!accessToken || !refreshToken) {
          // No stored session — user needs to log in.
          set({ isInitialised: true });
          return null;
        }

        // We have tokens — attempt to fetch the user profile to validate them.
        // If the access token has expired, the apiClient interceptor will use
        // the refresh token automatically.
        const { apiClient } = await import("@core/api/apiClient");
        const { ENDPOINTS } = await import("@core/api/endpoints");
        const response = await apiClient.get<User>(ENDPOINTS.AUTH.ME);

        set({ user: response.data, isInitialised: true });
        return response.data;
      } catch {
        // Session restoration failed (tokens expired, network error, etc.)
        // Clear the stale tokens so the user sees the login screen.
        await SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN);
        await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN);
        set({ user: null, isInitialised: true });
        return null;
      }
    },
  };
});
