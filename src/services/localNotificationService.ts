/**
 * Local notification service — urgency-based device notifications.
 *
 * In Expo Go (SDK 53+), FCM remote push is unavailable.
 * We trigger LOCAL notifications when a WebSocket alert arrives instead.
 *
 * Local notifications work in Expo Go and appear in the notification tray
 * with sound/vibration — even when the app is backgrounded, as long as the
 * WebSocket connection is still alive.
 *
 * When app is completely CLOSED: WebSocket is disconnected, so notifications
 * cannot arrive. Build an APK with `npx expo run:android` and FCM kicks in
 * automatically — all the FCM code is already wired up in the codebase.
 */

import type { Alert } from "@models/Alert";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// One channel per urgency tier for independent importance/sound settings.
// Android channel importance cannot be overridden per-notification —
// it must be set at the channel level.
const CHANNELS = {
  critical: "campus-alerts-critical",
  high: "campus-alerts-high",
  medium: "campus-alerts-medium",
  low: "campus-alerts-low",
} as const;

/**
 * Creates all four urgency-based Android notification channels.
 *
 * Safe to call multiple times — Android silently ignores duplicate creation.
 * Must run before any alert notification can be shown.
 * Call once from App.tsx startup.
 *
 * ⚠️ Custom sound files ('alert.mp3') are NOT bundled in Expo Go.
 *    Channels use the default system sound. After building an APK the
 *    sound declared in app.json ("assets/sounds/alert.mp3") activates.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  // Critical: MAX importance, bypasses DND, strong triple-pulse vibration
  await Notifications.setNotificationChannelAsync(CHANNELS.critical, {
    name: "🚨 Critical Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: "#DC2626",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });

  // High: MAX importance, double-pulse vibration
  await Notifications.setNotificationChannelAsync(CHANNELS.high, {
    name: "⚠️ High Priority Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: "#D97706",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });

  // Medium: HIGH importance → Android shows as a heads-up peek banner with sound
  await Notifications.setNotificationChannelAsync(CHANNELS.medium, {
    name: "📢 Medium Priority Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#2563EB",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: false,
  });

  // Low: DEFAULT importance → silent entry in notification tray, no peek, no sound
  await Notifications.setNotificationChannelAsync(CHANNELS.low, {
    name: "ℹ️ Low Priority Alerts",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#16A34A",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    enableVibrate: false,
  });
}

/**
 * Fires an immediate local notification for an incoming WebSocket alert.
 * Called by alertRepository._onWebSocketAlert() on every received alert.
 *
 * Urgency → behaviour:
 *   critical — MAX priority, vibration, bypasses DND, shows on lock screen
 *   high     — MAX priority, vibration, shows on lock screen
 *   medium   — HIGH priority, sound, heads-up banner (no vibration)
 *   low      — DEFAULT priority, no sound, silent entry in notification tray
 *
 * Tapping the notification navigates to AlertDetail via the
 * addNotificationResponseReceivedListener in AlertFeedScreen.tsx.
 */
export async function showAlertNotification(alert: Alert): Promise<void> {
  try {
    const channelId =
      (CHANNELS as Record<string, string>)[alert.urgency] ?? CHANNELS.low;
    const isHighUrgency =
      alert.urgency === "critical" || alert.urgency === "high";
    const isMedium = alert.urgency === "medium";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.title,
        body:
          alert.body.length > 200 ? `${alert.body.slice(0, 197)}…` : alert.body,

        // `true` uses the default system notification sound.
        // After building an APK, change to 'alert.mp3' for the custom sound.
        sound: isHighUrgency || isMedium ? true : false,

        vibrate:
          alert.urgency === "critical"
            ? [0, 500, 200, 500, 200, 500]
            : alert.urgency === "high"
              ? [0, 400, 200, 400]
              : alert.urgency === "medium"
                ? [0, 150]
                : undefined,

        priority: isHighUrgency
          ? Notifications.AndroidNotificationPriority.MAX
          : isMedium
            ? Notifications.AndroidNotificationPriority.HIGH
            : Notifications.AndroidNotificationPriority.DEFAULT,

        color:
          alert.urgency === "critical"
            ? "#DC2626"
            : alert.urgency === "high"
              ? "#D97706"
              : alert.urgency === "medium"
                ? "#2563EB"
                : "#16A34A",

        // Used by the notification tap handler to navigate to AlertDetail
        data: { id: alert.id, urgency: alert.urgency },

        // channelId is not in the public TS type but IS read by Expo's Android
        // native module to route the notification to the correct importance tier.
        ...(Platform.OS === "android" && { channelId }),
      } as Notifications.NotificationContentInput & { channelId?: string },

      trigger: null, // present immediately
    });
  } catch (err) {
    // Notification failure must never block the alert delivery flow
    console.warn(
      "[LocalNotificationService] Failed to show notification:",
      err,
    );
  }
}
