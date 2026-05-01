// src/core/db/localDb.ts
/**
 * SQLite offline alert cache using expo-sqlite v14 (async API).
 *
 * Schema: one table `alerts` that stores a flattened version of the Alert object.
 * JSON sub-objects (created_by) are serialised to strings for storage.
 *
 * Exported functions:
 *   initDb()                  — opens/creates DB and runs migrations
 *   upsertAlert(alert)        — insert or update a single alert
 *   upsertAlerts(alerts)      — batch upsert, used by sync service
 *   getAllAlerts()             — returns all alerts ordered by created_at DESC
 *   getLastAlertTimestamp()   — ISO string of newest alert, used by sync service
 *   markAlertAcknowledged(id) — sets acknowledged = 1 for a local row
 *   deleteOlderThan(days)     — prunes alerts older than N days to cap DB size
 *   getUnreadCount()          — count of alerts where acknowledged = 0
 */

import type { Alert } from "@models/Alert";
import * as SQLite from "expo-sqlite";

const DB_NAME = "campusalert.db";

/** Lazily opened database handle — initialised once via initDb(). */
let db: SQLite.SQLiteDatabase | null = null;

/**
 * Opens the SQLite database and creates the alerts table if it doesn't exist.
 * Must be called once during app startup before any other db function.
 */
export async function initDb(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS alerts (
      id                        TEXT PRIMARY KEY NOT NULL,
      title                     TEXT NOT NULL,
      body                      TEXT NOT NULL,
      urgency                   TEXT NOT NULL,
      category                  TEXT NOT NULL,
      status                    TEXT NOT NULL,
      classification_method     TEXT NOT NULL,
      classification_confidence REAL,
      created_by_json           TEXT NOT NULL,
      created_at                TEXT NOT NULL,
      dispatched_at             TEXT,
      recipient_count           INTEGER NOT NULL DEFAULT 0,
      is_active                 INTEGER NOT NULL DEFAULT 1,
      delivery_channel          TEXT,
      acknowledged              INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_urgency    ON alerts(urgency);
    CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
  `);
}

/** Ensures the database is open before use — throws if initDb was not called. */
function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error(
      "localDb: database not initialised. Call initDb() at app startup.",
    );
  }
  return db;
}

/**
 * Converts a full Alert model object into the flat row format for SQLite.
 * Booleans become integers (SQLite has no boolean type).
 */
function alertToRow(alert: Alert): Record<string, unknown> {
  return {
    id: alert.id,
    title: alert.title,
    body: alert.body,
    urgency: alert.urgency,
    category: alert.category,
    status: alert.status,
    classification_method: alert.classification_method,
    classification_confidence: alert.classification_confidence ?? null,
    created_by_json: JSON.stringify(alert.created_by),
    created_at: alert.created_at,
    dispatched_at: alert.dispatched_at ?? null,
    recipient_count: alert.recipient_count,
    is_active: alert.is_active ? 1 : 0,
    delivery_channel: alert.delivery_channel ?? null,
    acknowledged: alert.acknowledged ? 1 : 0,
  };
}

/**
 * Converts a raw SQLite row back into an Alert interface.
 * Deserialises created_by_json and converts integer booleans.
 */
function rowToAlert(row: Record<string, unknown>): Alert {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    urgency: row.urgency as Alert["urgency"],
    category: row.category as Alert["category"],
    status: row.status as Alert["status"],
    classification_method:
      row.classification_method as Alert["classification_method"],
    classification_confidence: row.classification_confidence as number | null,
    created_by: JSON.parse(row.created_by_json as string),
    created_at: row.created_at as string,
    dispatched_at: (row.dispatched_at as string | null) ?? null,
    recipient_count: row.recipient_count as number,
    is_active: (row.is_active as number) === 1,
    delivery_channel:
      (row.delivery_channel as Alert["delivery_channel"]) ?? undefined,
    acknowledged: (row.acknowledged as number) === 1,
  };
}

/**
 * Inserts or replaces a single alert in the local cache.
 * Uses INSERT OR REPLACE so re-receiving the same alert is idempotent.
 */
export async function upsertAlert(alert: Alert): Promise<void> {
  const database = getDb();
  const row = alertToRow(alert);

  await database.runAsync(
    `INSERT OR REPLACE INTO alerts
      (id, title, body, urgency, category, status,
       classification_method, classification_confidence,
       created_by_json, created_at, dispatched_at,
       recipient_count, is_active, delivery_channel, acknowledged)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.title,
      row.body,
      row.urgency,
      row.category,
      row.status,
      row.classification_method,
      row.classification_confidence,
      row.created_by_json,
      row.created_at,
      row.dispatched_at,
      row.recipient_count,
      row.is_active,
      row.delivery_channel,
      row.acknowledged,
    ] as SQLite.SQLiteBindValue[],
  );
}

/**
 * Batch upsert for syncing multiple alerts at once.
 * Wraps all inserts in a single transaction for performance.
 *
 * @param alerts - Array of Alert objects to cache locally
 */
export async function upsertAlerts(alerts: Alert[]): Promise<void> {
  if (alerts.length === 0) return;

  const database = getDb();

  // Run all inserts inside one transaction — significantly faster than N separate writes.
  await database.withTransactionAsync(async () => {
    for (const alert of alerts) {
      const row = alertToRow(alert);
      await database.runAsync(
        `INSERT OR REPLACE INTO alerts
          (id, title, body, urgency, category, status,
           classification_method, classification_confidence,
           created_by_json, created_at, dispatched_at,
           recipient_count, is_active, delivery_channel, acknowledged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.body,
          row.urgency,
          row.category,
          row.status,
          row.classification_method,
          row.classification_confidence,
          row.created_by_json,
          row.created_at,
          row.dispatched_at,
          row.recipient_count,
          row.is_active,
          row.delivery_channel,
          row.acknowledged,
        ] as SQLite.SQLiteBindValue[],
      );
    }
  });
}

/**
 * Returns all locally cached alerts sorted by created_at descending.
 * Used as the offline fallback when the device has no connectivity.
 */
export async function getAllAlerts(): Promise<Alert[]> {
  const database = getDb();
  const rows = await database.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM alerts WHERE is_active = 1 ORDER BY created_at DESC",
  );
  return rows.map(rowToAlert);
}

/**
 * Returns the ISO 8601 timestamp of the most recently cached alert.
 * The sync service uses this as the `since` parameter when calling /api/v1/alerts/missed/
 * to fetch only new alerts rather than the full history.
 *
 * Returns null if the local cache is empty (first run after install).
 */
export async function getLastAlertTimestamp(): Promise<string | null> {
  const database = getDb();
  const row = await database.getFirstAsync<{ created_at: string }>(
    "SELECT created_at FROM alerts ORDER BY created_at DESC LIMIT 1",
  );
  return row?.created_at ?? null;
}

/**
 * Marks a single alert as acknowledged in local storage.
 * Called after the user taps "Acknowledge" on a Critical/High full-screen alert.
 *
 * @param alertId - UUID string of the alert to mark
 */
export async function markAlertAcknowledged(alertId: string): Promise<void> {
  const database = getDb();
  await database.runAsync("UPDATE alerts SET acknowledged = 1 WHERE id = ?", [
    alertId,
  ]);
}

/**
 * Deletes all alerts older than the specified number of days.
 * Run on app startup to prevent unbounded SQLite growth.
 *
 * @param days - Retain alerts newer than this many days (default 30)
 */
export async function deleteOlderThan(days: number = 30): Promise<void> {
  const database = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  await database.runAsync("DELETE FROM alerts WHERE created_at < ?", [
    cutoffIso,
  ]);
}

/**
 * Returns the count of locally cached alerts that have not been acknowledged.
 * Used to display the unread badge on the navigation tab.
 */
export async function getUnreadCount(): Promise<number> {
  const database = getDb();
  const row = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM alerts WHERE acknowledged = 0 AND is_active = 1",
  );
  return row?.cnt ?? 0;
}
