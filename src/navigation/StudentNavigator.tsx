// src/navigation/StudentNavigator.tsx
/**
 * Bottom tab navigator for students.
 *
 * Key addition: watches alertStore.pendingFullScreenAlert.
 * When a Critical or High alert arrives via WebSocket, a full-screen
 * React Native Modal appears immediately — above the tab bar, above any
 * current screen, above the keyboard. No navigation required.
 *
 * Works in both Expo Go (no FCM) and production builds.
 * The WebSocket is the delivery channel; the Modal is the UI mechanism.
 */

import { alertRepository } from "@features/alerts/alertRepository";
import { AlertDetailScreen } from "@features/alerts/screens/AlertDetailScreen";
import { AlertFeedScreen } from "@features/alerts/screens/AlertFeedScreen";
import {
    FullScreenAlertNavigationScreen,
    FullScreenAlertScreen,
} from "@features/alerts/screens/FullScreenAlertScreen";
import { useAlerts } from "@hooks/useAlerts";
import type { Alert } from "@models/Alert";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getUrgencyConfig } from "@utils/urgencyConfig";
import React, { useCallback } from "react";
import { Modal, Platform, StyleSheet, Text, View } from "react-native";
import { SettingsScreen } from "./SettingsScreen";

// ── Type Definitions ───────────────────────────────────────────────────────────

export type StudentStackParamList = {
  AlertFeed: undefined;
  AlertDetail: { alertId: string };
  FullScreenAlert: { alert: Alert };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<StudentStackParamList>();
const Tabs = createBottomTabNavigator();

// ── Feed Stack ─────────────────────────────────────────────────────────────────

/** Inner stack for the Feed tab. */
const FeedStack: React.FC = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="AlertFeed"
      component={AlertFeedScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="AlertDetail"
      component={AlertDetailScreen}
      options={{ title: "Alert Detail", headerTintColor: "#154bba" }}
    />
    <Stack.Screen
      name="FullScreenAlert"
      component={FullScreenAlertNavigationScreen}
      options={{
        headerShown: false,
        presentation: "fullScreenModal",
        gestureEnabled: false,
        animation: "fade",
      }}
    />
  </Stack.Navigator>
);

// ── Feed Tab Icon ──────────────────────────────────────────────────────────────

const FeedTabIcon: React.FC<{ focused: boolean }> = ({ focused }) => {
  const { unreadCount } = useAlerts();
  return (
    <View>
      <Text style={{ fontSize: 22 }}>{focused ? "🔔" : "🔕"}</Text>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? "99+" : String(unreadCount)}
          </Text>
        </View>
      )}
    </View>
  );
};

// ── Real-Time Alert Modal ──────────────────────────────────────────────────────

/**
 * Full-screen modal that appears immediately when a Critical/High alert
 * arrives via WebSocket. Driven entirely by alertStore.pendingFullScreenAlert.
 *
 * Uses React Native's built-in Modal so it renders above everything —
 * the tab bar, keyboard, any current screen — without navigation.
 */
const RealTimeAlertModal: React.FC = () => {
  const { pendingFullScreenAlert, dismissFullScreen } = useAlerts();
  const isVisible = pendingFullScreenAlert !== null;

  const handleAcknowledge = useCallback(async () => {
    if (!pendingFullScreenAlert) return;

    // Post acknowledgement to backend + update local SQLite + dismiss modal
    await alertRepository.acknowledgeAlert(
      pendingFullScreenAlert.id,
      "lan_websocket",
    );
    // alertRepository.acknowledgeAlert() calls dismissFullScreenAlert() internally,
    // which sets pendingFullScreenAlert = null → Modal visible = false
  }, [pendingFullScreenAlert]);

  // Nothing to render when there is no pending alert
  if (!pendingFullScreenAlert) return null;

  const config = getUrgencyConfig(pendingFullScreenAlert.urgency);

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      // transparent: false gives a true full-screen takeover — the dark
      // urgency-coloured background completely covers the app behind it
      transparent={false}
      // Android: show above the status bar for maximum visual impact
      statusBarTranslucent={Platform.OS === "android"}
      // Prevent back-button dismissal — user MUST tap Acknowledge
      onRequestClose={() => {
        // On Android, the hardware back button fires this.
        // We deliberately do nothing — critical alerts cannot be swiped away.
      }}
    >
      {/*
       * FullScreenAlertScreen handles its own safe area insets, status bar
       * colour, vibration, and urgency-based styling.
       * We pass onAcknowledge so it calls our handleAcknowledge (which
       * calls alertRepository) instead of trying to navigate back.
       */}
      <FullScreenAlertScreen
        alert={pendingFullScreenAlert}
        onAcknowledge={handleAcknowledge}
      />
    </Modal>
  );
};

// ── Student Navigator ──────────────────────────────────────────────────────────

export const StudentNavigator: React.FC = () => (
  <>
    {/*
     * The tab navigator is the main student UI.
     * It sits BEHIND the modal — the modal renders above it in the fragment.
     */}
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#154bba",
        tabBarStyle: { borderTopColor: "#E5E7EB" },
      }}
    >
      <Tabs.Screen
        name="FeedTab"
        component={FeedStack}
        options={{
          title: "Alerts",
          tabBarIcon: ({ focused }) => <FeedTabIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 22 }}>{focused ? "⚙️" : "🔧"}</Text>
          ),
        }}
      />
    </Tabs.Navigator>

    {/*
     * Real-time alert modal — lives outside the navigator so it can
     * cover the entire screen including the tab bar.
     * Becomes visible automatically when alertStore.pendingFullScreenAlert
     * is set by alertRepository._onWebSocketAlert().
     */}
    <RealTimeAlertModal />
  </>
);

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#DC2626",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
});
