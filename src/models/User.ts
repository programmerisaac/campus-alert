// src/models/User.ts
/**
 * TypeScript interfaces for all user-related data objects.
 * Mirrors the Django User model fields returned by /api/v1/accounts/me/
 *
 * Changes:
 * - LoginPayload now uses email instead of username
 * - Added EmailLoginPayload as the primary login type
 */

export type UserRole = "admin" | "student" | "staff";

/**
 * Full user profile as returned by GET /api/v1/accounts/me/
 * and embedded in login / register responses.
 */
export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: UserRole;
  cu_id: string;
  department: string;
  is_verified: boolean;
  created_at: string;
}

/** JWT token pair stored securely after login / register. */
export interface AuthTokens {
  access: string;
  refresh: string;
}

/** Full auth response from POST /api/v1/accounts/login/ and /register/ */
export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

/**
 * Login payload — uses EMAIL not username.
 * Matches POST /api/v1/accounts/login/ expected body.
 */
export interface LoginPayload {
  email: string; // Changed from username
  password: string;
}

/** Payload shape sent to POST /api/v1/accounts/register/ */
export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  last_name: string;
  role?: UserRole;
  cu_id?: string;
  department?: string;
}
