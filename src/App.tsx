// src/App.tsx
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

export default function App(): React.ReactElement {
  useEffect(() => {
    const startup = async () => {
      await initDb();
      const fcmToken = await initialiseFCM();

      const user = useAuthStore.getState().user;
      if (user && fcmToken) {
        try {
          await updateFCMToken(fcmToken);
        } catch {
          console.warn("[App] FCM token registration failed on startup.");
        }
      }

      connectivityService.start();
    };

    startup();

    const notificationListener = Notifications.addNotificationReceivedListener(
      async (notification) => {
        // Cast via unknown — expo-notifications types data as Record<string, unknown>
        const data = notification.request.content.data as unknown as
          | Alert
          | undefined;

          
        if (data?.id) {
          const taggedAlert: Alert = { ...data, delivery_channel: "fcm" };
          await upsertAlert(taggedAlert);
          useAlertStore.getState().prependAlert(taggedAlert);
        }
      },
    );

    return () => {
      notificationListener.remove();
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
