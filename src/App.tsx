// src/App.tsx
/**
 * CampusAlert application root.
 *
 * ── Startup sequence ──────────────────────────────────────────────────────────
 *   1. Initialise the local SQLite database (createTables if not exist).
 *   2. Attempt FCM initialisation — SKIPPED in Expo Go because SDK 53 removed
 *      remote push support from the Expo Go client. A development build is
 *      required for real push notifications.
 *   3. If a user session already exists, register the FCM token with Django.
 *   4. Start the connectivity monitor (LAN WebSocket / offline detection).
 *
 * ── Push notifications in Expo Go ─────────────────────────────────────────────
 * Expo Go SDK 53+ no longer ships the native FCM bindings. Attempting to call
 * getExpoPushTokenAsync() or getFCMToken() inside Expo Go raises an error that
 * would crash the app before it renders. We detect Expo Go via
 * Constants.appOwnership === "expo" and skip push initialisation entirely.
 *
 * To test push notifications use a development build:
 *   npx expo run:android   (or eas build --profile development --platform android)
 */

import { setupNotificationChannels } from "@services/localNotificationService";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initDb, upsertAlert } from "@core/db/localDb";
import { updateFCMToken } from "@features/auth/authRepository";
import type { Alert } from "@models/Alert";
import { RootNavigator } from "@navigation/RootNavigator";
import { connectivityService } from "@services/connectivityService";
import { initialiseFCM } from "@services/fcmService";
import { useAlertStore } from "@store/alertStore";
import { useAuthStore } from "@store/authStore";

// ─────────────────────────────────────────────────────────────────────────────
// Notification display behaviour
//
// Determines how a notification is presented when the app is in the
// FOREGROUND. Without this handler the notification is silently dropped.
// ─────────────────────────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the app is running inside the Expo Go client.
 *
 * Constants.appOwnership is "expo" in Expo Go, "standalone" in a production
 * build, and undefined / "guest" in development builds created with
 * expo-dev-client.
 */
function isRunningInExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  useEffect(() => {
    // ── Main startup effect ─────────────────────────────────────────────────
    const startup = async () => {
      // 1. Ensure local SQLite tables exist before anything reads from them.
      await initDb();

      // Set up 4 urgency-based notification channels (works in Expo Go)
      await setupNotificationChannels();

      // 2. Attempt FCM initialisation — skipped in Expo Go to prevent crash.
      let fcmToken: string | null = null;

      if (isRunningInExpoGo()) {
        console.info(
          "[App] Running in Expo Go — FCM push initialisation skipped.\n" +
            "      Use `npx expo run:android` (development build) for full push support.",
        );
      } else {
        try {
          fcmToken = await initialiseFCM();
        } catch (error) {
          // Non-fatal: the app works without push; only real-time alerts are affected.
          console.warn(
            "[App] FCM initialisation failed — push notifications unavailable.",
            error,
          );
        }
      }

      // 3. If the user is already logged in, sync the FCM token with Django.
      //    This covers the case where the token rotated since the last launch.
      const currentUser = useAuthStore.getState().user;

      if (currentUser && fcmToken) {
        try {
          await updateFCMToken(fcmToken);
          console.info("[App] FCM token registered with backend.");
        } catch (error) {
          // Non-fatal: token will be re-sent on the next successful login.
          console.warn(
            "[App] Failed to register FCM token with backend.",
            error,
          );
        }
      }

      // 4. Begin monitoring network connectivity for LAN/WebSocket switching.
      connectivityService.start();
    };

    // Fire startup and handle any unexpected top-level errors.
    startup().catch((error) => {
      console.error("[App] Critical error during startup:", error);
    });

    // ── Foreground notification listener ────────────────────────────────────
    // Processes FCM data payloads delivered while the app is open.
    // Stores the alert locally and prepends it to the in-memory feed.
    const notificationSubscription =
      Notifications.addNotificationReceivedListener(async (notification) => {
        // expo-notifications types data as Record<string, unknown> — cast safely.
        const data = notification.request.content.data as unknown as
          | Alert
          | undefined;

        if (data?.id) {
          const taggedAlert: Alert = { ...data, delivery_channel: "fcm" };

          try {
            await upsertAlert(taggedAlert);
            useAlertStore.getState().prependAlert(taggedAlert);
          } catch (error) {
            console.warn(
              "[App] Failed to store incoming FCM notification locally.",
              error,
            );
          }
        }
      });

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      notificationSubscription.remove();
      connectivityService.stop();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
