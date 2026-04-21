// src/services/syncService.ts
/**
 * Missed-alert sync service (Feature F-09 reconnect delivery).
 *
 * When the device transitions from offline → lanOnly or offline → internet,
 * this service calls GET /api/v1/alerts/missed/?since=<last_cached_timestamp>
 * to retrieve all alerts that arrived while the device was offline.
 *
 * All retrieved alerts are bulk-upserted into the local SQLite cache and
 * returned to the caller (alertRepository) so they can be prepended to the feed.
 *
 * Also runs a 30-day SQLite prune on every sync to bound database growth.
 */

import { apiClient } from "@core/api/apiClient";
import { ENDPOINTS } from "@core/api/endpoints";
import {
    deleteOlderThan,
    getLastAlertTimestamp,
    upsertAlerts,
} from "@core/db/localDb";
import type { Alert, MissedAlertsResponse } from "@models/Alert";

/**
 * Fetches and caches all alerts that arrived since the last cached timestamp.
 *
 * @returns Array of newly synced Alert objects (empty if nothing was missed).
 */
export async function syncMissedAlerts(): Promise<Alert[]> {
  try {
    // Determine the cutoff timestamp from local SQLite.
    const since = await getLastAlertTimestamp();

    const params: Record<string, string> = {};
    if (since) {
      params.since = since;
    }

    const response = await apiClient.get<MissedAlertsResponse>(
      ENDPOINTS.ALERTS.MISSED,
      { params },
    );

    const { results } = response.data;

    if (results.length === 0) {
      return [];
    }

    // Tag each missed alert as delivered via offline storage channel.
    const taggedAlerts: Alert[] = results.map((alert) => ({
      ...alert,
      delivery_channel: "offline_stored",
    }));

    // Bulk-upsert into SQLite before returning to the UI layer.
    await upsertAlerts(taggedAlerts);

    // Prune alerts older than 30 days to keep the local DB from growing unbounded.
    await deleteOlderThan(30);

    console.info(
      `[SyncService] Synced ${taggedAlerts.length} missed alert(s).`,
    );
    return taggedAlerts;
  } catch (err) {
    // Sync failure is non-fatal — the user will just see a slightly stale feed.
    // Log the error for debugging but don't surface it to the UI.
    console.error("[SyncService] Failed to sync missed alerts:", err);
    return [];
  }
}
