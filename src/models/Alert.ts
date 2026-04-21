// src/models/Alert.ts
/**
 * TypeScript interfaces for all alert-related data objects.
 * These mirror the Django Alert and DeliveryLog models.
 */

/** The four urgency levels assigned by the classification pipeline. */
export type AlertUrgency = "critical" | "high" | "medium" | "low";

/** Alert lifecycle status driven by the Django Celery task. */
export type AlertStatus = "draft" | "classified" | "dispatched" | "failed";

/** How the urgency level was determined. */
export type ClassificationMethod = "keyword_override" | "xgboost";

/** Which delivery channel reached the device. */
export type DeliveryChannel = "fcm" | "lan_websocket" | "offline_stored";

/** Alert category tags set by the admin. */
export type AlertCategory = "security" | "health" | "academic" | "general";

/**
 * Full alert object as returned by GET /api/v1/alerts/<id>/
 * and embedded in the feed, missed-alerts, and admin list responses.
 */
export interface Alert {
  id: string; // UUID7 string
  title: string;
  body: string;
  urgency: AlertUrgency;
  category: AlertCategory;
  status: AlertStatus;
  classification_method: ClassificationMethod;
  classification_confidence: number | null; // 0–1 for XGBoost; null for keyword override
  created_by: {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
  };
  created_at: string; // ISO 8601
  dispatched_at: string | null;
  recipient_count: number;
  is_active: boolean;
  // Set client-side to track how this device received the alert
  delivery_channel?: DeliveryChannel;
  // Whether the current user has acknowledged this alert (populated client-side)
  acknowledged?: boolean;
}

/**
 * Per-user delivery log record for a single alert.
 * Returned by GET /api/v1/alerts/<id>/delivery-status/
 */
export interface DeliveryLogEntry {
  id: string;
  user: {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
  };
  channel: DeliveryChannel;
  delivered_at: string | null;
  acknowledged_at: string | null;
  fcm_message_id: string;
  created_at: string;
}

/**
 * Delivery status summary for an alert.
 * Used by the AdminDeliveryStatusScreen.
 */
export interface AlertDeliveryStatus {
  id: string;
  title: string;
  urgency: AlertUrgency;
  recipient_count: number;
  dispatched_at: string | null;
  delivery_logs: DeliveryLogEntry[];
}

/**
 * Payload shape for POST /api/v1/alerts/compose/
 */
export interface ComposeAlertPayload {
  title: string;
  body: string;
  category: AlertCategory;
}

/**
 * Payload for POST /api/v1/alerts/<id>/acknowledge/
 */
export interface AcknowledgePayload {
  channel: DeliveryChannel;
}

/**
 * Response from GET /api/v1/alerts/missed/?since=<timestamp>
 */
export interface MissedAlertsResponse {
  count: number;
  since: string | null;
  results: Alert[];
}

/**
 * Paginated list response wrapping an array of alerts.
 */
export interface PaginatedAlerts {
  count: number;
  next: string | null;
  previous: string | null;
  results: Alert[];
}

/**
 * Local SQLite row shape — a flattened version of Alert for offline storage.
 * JSON fields are stored as serialised strings.
 */
export interface LocalAlertRow {
  id: string;
  title: string;
  body: string;
  urgency: AlertUrgency;
  category: AlertCategory;
  status: AlertStatus;
  classification_method: ClassificationMethod;
  classification_confidence: number | null;
  created_by_json: string; // JSON.stringify of created_by object
  created_at: string;
  dispatched_at: string | null;
  recipient_count: number;
  is_active: number; // SQLite stores booleans as 0/1
  delivery_channel: DeliveryChannel | null;
  acknowledged: number; // 0 or 1
}
