// src/features/admin/adminRepository.ts
/**
 * Admin repository — API calls for the administrator dashboard.
 *
 * Functions:
 *   composeAlert()       — POST /alerts/compose/
 *   getAdminAlertList()  — GET  /alerts/admin/
 *   getDeliveryStatus()  — GET  /alerts/<id>/delivery-status/
 */

import { apiClient } from "@core/api/apiClient";
import { ENDPOINTS } from "@core/api/endpoints";
import type {
    Alert,
    AlertDeliveryStatus,
    ComposeAlertPayload,
    PaginatedAlerts,
} from "@models/Alert";

/**
 * Submits a new alert for AI classification and delivery.
 *
 * The backend runs the keyword-override check and then XGBoost classification
 * synchronously (< 500ms) and returns the classified alert in the response.
 * Actual FCM/LAN delivery happens asynchronously via Celery.
 *
 * @param payload - Title, body, and category for the new alert
 * @returns The classified Alert object with urgency, method, and confidence
 */
export async function composeAlert(
  payload: ComposeAlertPayload,
): Promise<Alert> {
  const response = await apiClient.post<Alert>(
    ENDPOINTS.ALERTS.COMPOSE,
    payload,
  );
  return response.data;
}

/**
 * Fetches the paginated list of all alerts sent by the current admin.
 * Superusers see all alerts from all admins.
 *
 * @param page - Page number (1-based, default 1)
 * @returns Paginated alert list
 */
export async function getAdminAlertList(
  page: number = 1,
): Promise<PaginatedAlerts> {
  const response = await apiClient.get<PaginatedAlerts>(
    ENDPOINTS.ALERTS.ADMIN_LIST,
    { params: { page } },
  );
  return response.data;
}

/**
 * Fetches the delivery status breakdown for a single alert.
 * Shows which users received the alert, via which channel, and who acknowledged.
 *
 * @param alertId - UUID of the alert
 * @returns Delivery status with per-user channel logs
 */
export async function getDeliveryStatus(
  alertId: string,
): Promise<AlertDeliveryStatus> {
  const response = await apiClient.get<AlertDeliveryStatus>(
    ENDPOINTS.ALERTS.DELIVERY_STATUS(alertId),
  );
  return response.data;
}
