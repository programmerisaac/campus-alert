// src/store/authStore.ts  ← REPLACE your existing file with this
/**
 * Auth store — single source of truth for authentication state.
 *
 * Persists JWT tokens to Expo SecureStore so sessions survive app restarts.
 * All token reads/writes go through this store — never access SecureStore directly.
 *
 * State shape:
 *   user          — the authenticated User object (null = logged out)
 *   tokens        — the JWT access/refresh pair (null = logged out)
 *   isInitialised — true once restoreSession() has completed (success or fail)
 *
 * RootNavigator observes `isInitialised` to know when to stop showing the
 * splash loader, and `user` to know which navigator to render.
 */

import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import type { AuthTokens, User } from "@models/User";

// ─── SecureStore keys ──────────────────────────────────────────────────────────
const SECURE_KEY_ACCESS = "auth_access_token";
const SECURE_KEY_REFRESH = "auth_refresh_token";

// ─── State interface ───────────────────────────────────────────────────────────

/**
 * Full shape of the auth slice — state + actions.
 *
 * Every field used by any component or repository MUST be declared here,
 * otherwise TypeScript cannot see it (causing the ts(2339) errors).
 */
export interface AuthState {
  /** Currently authenticated user. Null when logged out. */
  user: User | null;

  /**
   * JWT token pair stored in memory (mirrored from SecureStore).
   * Null when logged out or before hydration completes.
   * MUST be declared here so authRepository.logout() can read tokens?.refresh.
   */
  tokens: AuthTokens | null;

  /**
   * True once restoreSession() has completed (whether it found a session or not).
   * RootNavigator shows a full-screen spinner while this is false.
   */
  isInitialised: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Reads tokens from SecureStore, validates them by calling GET /accounts/me/,
   * and populates the user field if the session is still valid.
   *
   * Sets isInitialised = true when done regardless of outcome.
   * Called once from RootNavigator's useEffect on app launch.
   */
  restoreSession: () => Promise<void>;

  /**
   * Persists tokens to SecureStore and updates in-memory state.
   * Called immediately after a successful login or register response.
   *
   * @param tokens - JWT access + refresh pair from the backend
   * @param user   - Authenticated user profile from the backend
   */
  setAuth: (tokens: AuthTokens, user: User) => Promise<void>;

  /**
   * Replaces the in-memory user object without touching tokens.
   * Used after a profile update or when the token refresh returns new user data.
   *
   * @param user - Updated user profile
   */
  setUser: (user: User) => void;

  /**
   * Updates only the access token in memory and SecureStore.
   * Called by the Axios interceptor after a silent token refresh.
   *
   * @param accessToken - New access JWT string
   */
  setAccessToken: (accessToken: string) => Promise<void>;

  /**
   * Clears all auth state and wipes tokens from SecureStore.
   * The RootNavigator reacts to user becoming null and shows the login screen.
   */
  clearAuth: () => Promise<void>;
}

// ─── Store implementation ──────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isInitialised: false,

  // ── restoreSession ───────────────────────────────────────────────────────────
  restoreSession: async () => {
    try {
      const [access, refresh] = await Promise.all([
        SecureStore.getItemAsync(SECURE_KEY_ACCESS),
        SecureStore.getItemAsync(SECURE_KEY_REFRESH),
      ]);

      if (!access || !refresh) {
        // No stored tokens — user needs to log in
        return;
      }

      // Load tokens into memory before calling the API so the request
      // interceptor can attach the Authorization header.
      set({ tokens: { access, refresh } });

      // Validate the session by fetching the user profile.
      // Import is done inline to avoid a circular dependency with authRepository.
      const { getMe } = await import("@features/auth/authRepository");
      await getMe();

      // getMe() calls setUser() internally on success, so user is now populated.
    } catch (err) {
      // Tokens were expired or the network was unreachable.
      // Clear the invalid tokens so the user sees the login screen.
      console.warn("[AuthStore] Session restore failed:", err);
      await get().clearAuth();
    } finally {
      // Always mark as initialised so the splash screen is dismissed.
      set({ isInitialised: true });
    }
  },

  // ── setAuth ─────────────────────────────────────────────────────────────────
  setAuth: async (tokens: AuthTokens, user: User) => {
    await Promise.all([
      SecureStore.setItemAsync(SECURE_KEY_ACCESS, tokens.access),
      SecureStore.setItemAsync(SECURE_KEY_REFRESH, tokens.refresh),
    ]);
    set({ tokens, user });
  },

  // ── setUser ─────────────────────────────────────────────────────────────────
  setUser: (user: User) => {
    set({ user });
  },

  // ── setAccessToken ───────────────────────────────────────────────────────────
  setAccessToken: async (accessToken: string) => {
    const currentTokens = get().tokens;
    if (!currentTokens) return;

    const updatedTokens: AuthTokens = { ...currentTokens, access: accessToken };
    await SecureStore.setItemAsync(SECURE_KEY_ACCESS, accessToken);
    set({ tokens: updatedTokens });
  },

  // ── clearAuth ────────────────────────────────────────────────────────────────
  clearAuth: async () => {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(SECURE_KEY_ACCESS),
      SecureStore.deleteItemAsync(SECURE_KEY_REFRESH),
    ]);
    set({ user: null, tokens: null });
  },
}));

// // src/store/authStore.ts
// /**
//  * Auth store — single source of truth for authentication state.
//  *
//  * Persists JWT tokens to Expo SecureStore so sessions survive app restarts.
//  * All token reads/writes go through this store — never access SecureStore directly.
//  *
//  * State shape:
//  *   user   — the authenticated User object (null = logged out)
//  *   tokens — the JWT access/refresh pair (null = logged out)
//  *
//  * The `tokens` field MUST be declared in AuthState so that
//  * authRepository.logout() can read `tokens?.refresh` without a TS error.
//  */

// import * as SecureStore from "expo-secure-store";
// import { create } from "zustand";

// import type { AuthTokens, User } from "@models/User";

// // ─── SecureStore keys ──────────────────────────────────────────────────────────
// const SECURE_KEY_ACCESS = "auth_access_token";
// const SECURE_KEY_REFRESH = "auth_refresh_token";

// // ─── State interface ───────────────────────────────────────────────────────────

// /**
//  * Full shape of the auth slice — state + actions.
//  *
//  * IMPORTANT: `tokens` must be declared here so TypeScript knows it exists
//  * when other files call `useAuthStore.getState().tokens`.
//  */
// export interface AuthState {
//   /** Currently authenticated user. Null when logged out. */
//   user: User | null;

//   /**
//    * JWT token pair stored in memory (mirrored from SecureStore).
//    * Null when logged out or before hydration completes.
//    */
//   tokens: AuthTokens | null;

//   /** True while the initial SecureStore hydration is running on app launch. */
//   isHydrating: boolean;

//   // ── Actions ────────────────────────────────────────────────────────────────

//   /**
//    * Persists tokens to SecureStore and updates in-memory state.
//    * Called immediately after a successful login or register.
//    *
//    * @param tokens - JWT access + refresh pair
//    * @param user   - Authenticated user profile
//    */
//   setAuth: (tokens: AuthTokens, user: User) => Promise<void>;

//   /**
//    * Replaces the in-memory user object without touching tokens.
//    * Used after a profile update or token refresh that returns new user data.
//    *
//    * @param user - Updated user profile
//    */
//   setUser: (user: User) => void;

//   /**
//    * Updates only the access token in memory and SecureStore.
//    * Called by the Axios interceptor after a silent token refresh.
//    *
//    * @param accessToken - New access JWT
//    */
//   setAccessToken: (accessToken: string) => Promise<void>;

//   /**
//    * Clears all auth state and wipes tokens from SecureStore.
//    * Triggers the RootNavigator to show the login screen.
//    */
//   clearAuth: () => Promise<void>;

//   /**
//    * Reads persisted tokens from SecureStore on app launch.
//    * Sets `isHydrating` to false when complete.
//    * If tokens exist, they are loaded into memory but the caller is responsible
//    * for validating them (e.g., calling getMe() to verify the session).
//    */
//   hydrateFromStorage: () => Promise<void>;
// }

// // ─── Store implementation ──────────────────────────────────────────────────────

// export const useAuthStore = create<AuthState>((set, get) => ({
//   // Initial state — nothing loaded yet
//   user: null,
//   tokens: null,
//   isHydrating: true,

//   // ── setAuth ─────────────────────────────────────────────────────────────────
//   setAuth: async (tokens: AuthTokens, user: User) => {
//     // Persist to secure storage first so tokens survive crashes
//     await Promise.all([
//       SecureStore.setItemAsync(SECURE_KEY_ACCESS, tokens.access),
//       SecureStore.setItemAsync(SECURE_KEY_REFRESH, tokens.refresh),
//     ]);

//     set({ tokens, user });
//   },

//   // ── setUser ─────────────────────────────────────────────────────────────────
//   setUser: (user: User) => {
//     set({ user });
//   },

//   // ── setAccessToken ───────────────────────────────────────────────────────────
//   setAccessToken: async (accessToken: string) => {
//     const currentTokens = get().tokens;
//     if (!currentTokens) return; // Nothing to update if not authenticated

//     const updatedTokens: AuthTokens = {
//       ...currentTokens,
//       access: accessToken,
//     };

//     await SecureStore.setItemAsync(SECURE_KEY_ACCESS, accessToken);
//     set({ tokens: updatedTokens });
//   },

//   // ── clearAuth ────────────────────────────────────────────────────────────────
//   clearAuth: async () => {
//     // Delete from SecureStore — failures are non-fatal since we clear memory anyway
//     await Promise.allSettled([
//       SecureStore.deleteItemAsync(SECURE_KEY_ACCESS),
//       SecureStore.deleteItemAsync(SECURE_KEY_REFRESH),
//     ]);

//     set({ user: null, tokens: null });
//   },

//   // ── hydrateFromStorage ───────────────────────────────────────────────────────
//   hydrateFromStorage: async () => {
//     try {
//       const [access, refresh] = await Promise.all([
//         SecureStore.getItemAsync(SECURE_KEY_ACCESS),
//         SecureStore.getItemAsync(SECURE_KEY_REFRESH),
//       ]);

//       if (access && refresh) {
//         // Load tokens into memory — the caller must validate them with getMe()
//         set({ tokens: { access, refresh } });
//       }
//     } catch (err) {
//       // SecureStore read failure — treat as logged out
//       console.warn("[AuthStore] SecureStore hydration failed:", err);
//     } finally {
//       set({ isHydrating: false });
//     }
//   },
// }));
