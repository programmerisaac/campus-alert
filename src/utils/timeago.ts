// src/utils/timeago.ts
/**
 * Relative timestamp formatter.
 *
 * Converts an ISO 8601 string into a human-readable relative label
 * such as "just now", "5 minutes ago", "3 hours ago", "2 days ago".
 *
 * Using date-fns/formatDistanceToNow for accurate, locale-aware formatting
 * instead of a hand-rolled implementation.
 */

import { formatDistanceToNow, parseISO } from "date-fns";

/**
 * Returns a human-readable relative time string for the given ISO timestamp.
 *
 * @param isoString - ISO 8601 date string from the API (e.g. "2024-11-01T14:30:00Z")
 * @returns Relative string, e.g. "3 minutes ago", "about 2 hours ago"
 */
export function timeAgo(isoString: string): string {
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
  } catch {
    // If the date string is malformed, show a safe fallback rather than crashing.
    return "some time ago";
  }
}

/**
 * Formats an ISO string as a short absolute date for detail views.
 * Example: "Nov 1, 2024, 2:30 PM"
 *
 * @param isoString - ISO 8601 date string
 * @returns Formatted absolute date string
 */
export function formatAbsoluteDate(isoString: string): string {
  try {
    const date = parseISO(isoString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
