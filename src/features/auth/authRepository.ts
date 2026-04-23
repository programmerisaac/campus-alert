// src/features/auth/authRepository.ts
/**
 * Auth Repository — all API calls related to authentication.
 *
 * Changes from original:
 * - login() now sends { email, password } instead of { username, password }
 * - All types updated to use EmailLoginPayload
 *
 * Each function maps directly to one backend endpoint.
 * After a successful API call, the relevant authStore action is called
 * to keep the local state in sync.
 */

import { apiClient } from "@core/api/apiClient";
import { ENDPOINTS } from "@core/api/endpoints";
import type { AuthResponse, User } from "@models/User";
import { useAuthStore } from "@store/authStore";

/** Payload for POST /api/v1/accounts/login/ */
export interface EmailLoginPayload {
  email: string;
  password: string;
}

/** Payload for POST /api/v1/accounts/register/ */
export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  last_name: string;
  cu_id?: string;
  department?: string;
}

/**
 * Authenticates the user with email + password.
 *
 * On success:
 * - Stores JWT tokens in SecureStore via authStore.setAuth()
 * - Stores user profile in authStore
 * - RootNavigator re-renders the correct screen based on user.role
 *
 * @param payload - { email, password }
 * @returns Full AuthResponse with tokens and user profile
 * @throws AxiosError on network failure or bad credentials (400/401/423)
 */
export async function login(payload: EmailLoginPayload): Promise<AuthResponse> {
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
 * The backend:
 * 1. Validates the email domain
 * 2. Auto-detects role from domain (@stu.cu.edu.ng → student)
 * 3. Returns JWT tokens so the user is immediately authenticated
 *
 * @param payload - Registration form fields
 * @returns Full AuthResponse with tokens and user profile
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
 *
 * Sends the refresh token to the backend to blacklist it, then clears
 * all local auth state. The RootNavigator automatically shows the
 * LoginScreen once user becomes null in the store.
 *
 * Non-fatal if the API call fails — local state is always cleared.
 */
export async function logout(): Promise<void> {
  try {
    const refreshToken = useAuthStore.getState().tokens?.refresh;
    if (refreshToken) {
      await apiClient.post(ENDPOINTS.AUTH.LOGOUT, { refresh: refreshToken });
    }
  } catch {
    console.warn(
      "[AuthRepository] Backend logout failed — clearing local state anyway.",
    );
  } finally {
    await useAuthStore.getState().clearAuth();
  }
}

/**
 * Fetches the current user's profile from the backend.
 * Used to refresh user data after a token renewal.
 *
 * @returns The authenticated user's profile
 */
export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>(ENDPOINTS.AUTH.ME);
  useAuthStore.getState().setUser(response.data);
  return response.data;
}

/**
 * Registers or updates the FCM device push token on the Django backend.
 *
 * Called:
 * - After login (in App.tsx startup effect)
 * - On app launch if a session already exists
 *
 * The backend stores this token on the User model and uses it to send
 * FCM push notifications when an alert is dispatched.
 *
 * @param token - Raw Expo push token string
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
 * @param currentPassword - Must match the user's stored password
 * @param newPassword     - The replacement password
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiClient.post(ENDPOINTS.AUTH.PASSWORD_CHANGE, {
    current_password: currentPassword,
    new_password: newPassword,
    new_password_confirm: newPassword,
  });
}
