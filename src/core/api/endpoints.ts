// src/core/api/endpoints.ts
/**
 * All Django REST API endpoint paths in one place.
 * Import from here instead of hardcoding strings in repositories.
 *
 * Base URL is injected by apiClient.ts — these are relative paths only.
 */

export const ENDPOINTS = {
  // ─── Accounts ─────────────────────────────────────────────────────────
  AUTH: {
    REGISTER: "/accounts/register/",
    LOGIN: "/accounts/login/",
    TOKEN_REFRESH: "/accounts/token/refresh/",
    LOGOUT: "/accounts/logout/",
    ME: "/accounts/me/",
    DEVICE: "/accounts/device/",
    PASSWORD_CHANGE: "/accounts/password/change/",
  },

  // ─── Alerts ───────────────────────────────────────────────────────────
  ALERTS: {
    FEED: "/alerts/",
    MISSED: "/alerts/missed/",
    COMPOSE: "/alerts/compose/",
    ADMIN_LIST: "/alerts/admin/",
    DETAIL: (id: string) => `/alerts/${id}/`,
    ACKNOWLEDGE: (id: string) => `/alerts/${id}/acknowledge/`,
    DELIVERY_STATUS: (id: string) => `/alerts/${id}/delivery-status/`,
  },
} as const;
