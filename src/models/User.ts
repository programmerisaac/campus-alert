// src/models/User.ts
/**
 * TypeScript interfaces for all user-related data objects.
 * These mirror the Django User model fields returned by /api/v1/accounts/me/
 */

/** Roles that control which UI the user sees after login. */
export type UserRole = "admin" | "student" | "staff";

/**
 * Full user profile as returned by GET /api/v1/accounts/me/
 * and embedded in login / register responses.
 */
export interface User {
  id: string; // UUID7 string
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  cu_id: string; // Covenant University matric / staff ID
  department: string;
  is_verified: boolean;
  created_at: string; // ISO 8601
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

/** Payload shape sent to POST /api/v1/accounts/login/ */
export interface LoginPayload {
  username: string;
  password: string;
}

/** Payload shape sent to POST /api/v1/accounts/register/ */
export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role?: UserRole;
  cu_id?: string;
  department?: string;
}
