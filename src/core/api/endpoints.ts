// src/core/api/endpoints.ts
/**
 * Centralised API endpoint registry.
 *
 * ── IMPORTANT: Path format ────────────────────────────────────────────────────
 * Paths here do NOT include /api/v1. That prefix lives in the base URL
 * (EXPO_PUBLIC_API_BASE_URL in .env). Keeping it in the base URL means:
 *
 *   1. Every path here is shorter and easier to read.
 *   2. There is ONE place to change the API version prefix (the .env file).
 *   3. You can never accidentally have /api/v1/api/v1/... double-prefix bugs.
 *
 * ── How Axios joins baseURL + path ───────────────────────────────────────────
 * Axios concatenates baseURL + the path you pass to .get() / .post() etc.
 *
 * Example with this setup:
 *   baseURL  = "http://10.89.126.143:8000/api/v1"   ← from .env
 *   endpoint = "/accounts/login/"                   ← from this file
 *   result   = "http://10.89.126.143:8000/api/v1/accounts/login/"  ✅
 *
 * ── Other rules ───────────────────────────────────────────────────────────────
 * - Trailing slash on every path (Django requires it by default).
 * - Always start with a leading slash so the join is unambiguous.
 * - Dynamic segments (IDs) are functions, not template strings in the object,
 *   so TypeScript enforces you pass an argument.
 */

export const ENDPOINTS = {
  // ── Authentication ──────────────────────────────────────────────────────────
  AUTH: {
    /** POST — { email, password } → { access, refresh, user } */
    LOGIN: "/accounts/login/",

    /** POST — registration payload → { access, refresh, user } */
    REGISTER: "/accounts/register/",

    /** POST — { refresh } → blacklists the token, user is logged out */
    LOGOUT: "/accounts/logout/",

    /**
     * POST — { refresh } → { access }
     * Called automatically by the Axios response interceptor on 401 errors.
     * Uses plain `axios` (not apiClient) to avoid infinite retry loops.
     */
    REFRESH: "/accounts/token/refresh/",

    /**
     * GET — returns the authenticated user's profile.
     * Called after a token refresh to ensure local user state is current.
     */
    ME: "/accounts/me/",

    /**
     * POST — { registration_id, type } → saves FCM push token on the user.
     * Called after every login because FCM tokens can rotate at any time.
     * Stale tokens = silent push delivery failures.
     */
    DEVICE: "/accounts/device/",

    /** POST — { current_password, new_password, new_password_confirm } */
    PASSWORD_CHANGE: "/accounts/password/change/",
  },

  // ── Alerts ──────────────────────────────────────────────────────────────────
  ALERTS: {
    /**
     * GET — paginated alert feed for students and staff.
     * Query params:
     *   ?page=N              — page number (default 1)
     *   ?urgency=critical    — filter by urgency level
     *
     * Named FEED (not LIST) to distinguish it from the admin-only list below.
     * Students and staff both call this; admins call ADMIN_LIST for full access.
     */
    FEED: "/alerts/",

    /**
     * GET — admin-only list that includes draft and failed alerts.
     * Students must NEVER call this endpoint — the backend returns 403.
     */
    ADMIN_LIST: "/alerts/admin/",

    /**
     * GET — alerts the device missed while it was offline.
     * Query params:
     *   ?since=<ISO8601>    — only return alerts newer than this timestamp.
     *                         Pass the created_at of the most recent locally
     *                         cached alert (from getLastAlertTimestamp()).
     *                         Omit to get all alerts (first run after install).
     *
     * Called by syncService.ts whenever the device reconnects to the network.
     */
    MISSED: "/alerts/missed/",

    /**
     * POST — compose and dispatch a new campus alert.
     * Admin only. Payload: { title, body, category }
     * Django auto-classifies urgency via the ML pipeline.
     */
    COMPOSE: "/alerts/compose/",

    /**
     * GET — full alert detail including classification metadata.
     * @param id — UUID string of the alert
     * @returns  Alert object with all fields populated
     */
    DETAIL: (id: string): string => `/alerts/${id}/`,

    /**
     * POST — acknowledge receipt of a Critical or High urgency alert.
     * Called when the student taps "I Understand" on the full-screen overlay.
     * @param id — UUID string of the alert being acknowledged
     */
    ACKNOWLEDGE: (id: string): string => `/alerts/${id}/acknowledge/`,

    /**
     * GET — per-user delivery log for a specific alert.
     * Admin only. Shows which users received the alert and via which channel.
     * @param id — UUID string of the alert
     */
    DELIVERY_STATUS: (id: string): string => `/alerts/${id}/delivery-status/`,
  },
} as const;
