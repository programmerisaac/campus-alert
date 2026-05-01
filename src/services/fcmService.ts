// src/services/fcmService.ts
/**
 * FCM (Firebase Cloud Messaging) Service
 *
 * Handles push notification permission requests and token retrieval.
 *
 * IMPORTANT COMPATIBILITY NOTE:
 * expo-notifications push/remote notification support was REMOVED from
 * Expo Go starting with SDK 53. This service will return null when running
 * inside Expo Go, allowing the app to continue working without push tokens.
 *
 * When you create a development build (npx expo run:android), full FCM
 * support is restored automatically.
 *
 * Flow:
 *  1. Check if running on a real device (emulators can't receive push)
 *  2. Request notification permission from the OS
 *  3. Retrieve the Expo push token (which maps to an FCM token server-side)
 *  4. Return the token string, or null on failure
 */

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Detects whether we are running inside Expo Go.
 *
 * Expo Go sets executionEnvironment to 'storeClient'.
 * Development builds set it to 'standalone' or 'bare'.
 */
function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === "storeClient" ||
    // Fallback for older Expo SDK versions
    (Constants.appOwnership !== undefined && Constants.appOwnership === "expo")
  );
}

/**
 * Creates the Android notification channel required for push notifications.
 * Must be called before presenting any notifications on Android.
 * Safe to call multiple times — Android ignores duplicate channel creation.
 */
async function createAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("campus-alerts", {
    name: "Campus Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#154bba",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    // Allow alerts to appear over other apps (needed for CRITICAL urgency)
    bypassDnd: false,
  });
}

/**
 * Initialises push notifications and retrieves the device's push token.
 *
 * @returns The push token string if successful, or null if:
 *          - Running in Expo Go (SDK 53+)
 *          - Running on an emulator/simulator
 *          - Permission was denied by the user
 *          - Any other error occurs
 */
export async function initialiseFCM(): Promise<string | null> {
  // ── Guard: Expo Go doesn't support remote push in SDK 53+ ─────────────────
  if (isExpoGo()) {
    console.info(
      "[FCM] Running in Expo Go — push notifications are not supported. " +
        "Create a development build for full push support.",
    );
    return null;
  }

  // ── Guard: Physical device required ───────────────────────────────────────
  if (!Device.isDevice) {
    console.warn(
      "[FCM] Push notifications require a physical device. " +
        "Emulators/simulators cannot receive push tokens.",
    );
    return null;
  }

  try {
    // ── Android: Create notification channel ──────────────────────────────
    await createAndroidChannel();

    // ── Request permission ────────────────────────────────────────────────
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn(
        "[FCM] Push notification permission denied by user. " +
          "Token not retrieved.",
      );
      return null;
    }

    // ── Retrieve the Expo push token ──────────────────────────────────────
    // The projectId links this token to your EAS project.
    // It's stored in app.json under extra.eas.projectId.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;

    if (!projectId) {
      console.warn(
        "[FCM] No EAS projectId found in app.json (extra.eas.projectId). " +
          "Token retrieval skipped. Add your EAS project ID to app.json.",
      );
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    console.info(`[FCM] Push token retrieved: ${token.slice(0, 30)}...`);
    return token;
  } catch (error) {
    // Never crash the app over a missing push token —
    // the app works fine without it (alerts come via WebSocket/LAN fallback)
    console.error("[FCM] Failed to initialise push notifications:", error);
    return null;
  }
}
