// src/features/auth/authRepository.ts
/**
 * Auth repository — all API calls related to authentication.
 * Reads/writes auth state via authStore after each API call.
 */

import { apiClient } from "@core/api/apiClient";
import { ENDPOINTS } from "@core/api/endpoints";
import type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
} from "@models/User";
import { useAuthStore } from "@store/authStore";

/**
 * Authenticates the user and persists the session.
 *
 * @param payload - username + password
 * @returns The full AuthResponse including user profile and tokens
 */
export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>(
    ENDPOINTS.AUTH.LOGIN,
    payload,
  );
  const { access, refresh, user } = response.data;
  await useAuthStore.getState().setAuth({ access, refresh }, user);
  return response.data;
}

/**
 * Registers a new user and immediately logs them in.
 *
 * @param payload - Registration form fields
 * @returns The full AuthResponse including user profile and tokens
 */
export async function register(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>(
    ENDPOINTS.AUTH.REGISTER,
    payload,
  );
  const { access, refresh, user } = response.data;
  await useAuthStore.getState().setAuth({ access, refresh }, user);
  return response.data;
}

/**
 * Logs out the current user.
 * Calls the backend to blacklist the refresh token, then clears local state.
 * Non-fatal if the API call fails — local state is always cleared.
 */
export async function logout(): Promise<void> {
  try {
    // Inform the backend so it can blacklist the refresh token
    await apiClient.post(ENDPOINTS.AUTH.LOGOUT);
  } catch {
    // Ignore network errors on logout — we clear local state regardless
    console.warn(
      "[AuthRepository] Backend logout failed — clearing local state anyway.",
    );
  } finally {
    await useAuthStore.getState().clearAuth();
  }
}

/**
 * Fetches the current user's profile from the backend.
 *
 * @returns The authenticated user's profile
 */
export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>(ENDPOINTS.AUTH.ME);
  useAuthStore.getState().setUser(response.data);
  return response.data;
}

/**
 * Registers or updates the FCM device push token on the backend.
 * Called after login and on app startup (if a session exists).
 *
 * @param token - Raw FCM registration token from expo-notifications
 */
export async function updateFCMToken(token: string): Promise<void> {
  await apiClient.post(ENDPOINTS.AUTH.DEVICE, {
    registration_id: token,
    type: "android",
  });
}

/**
 * Changes the authenticated user's password.
 *
 * @param oldPassword - Current password for verification
 * @param newPassword - Replacement password
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await apiClient.post(ENDPOINTS.AUTH.PASSWORD_CHANGE, {
    old_password: oldPassword,
    new_password: newPassword,
  });
}
