// src/navigation/StudentNavigator.tsx
/**
 * Bottom tab navigator for students.
 *
 * Tabs:
 *   Feed     — AlertFeedScreen with unread badge
 *   Settings — profile info and logout
 *
 * Also declares the full stack that sits inside the student flow,
 * including AlertDetailScreen and FullScreenAlertScreen.
 */

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { AlertDetailScreen } from "@features/alerts/screens/AlertDetailScreen";
import { AlertFeedScreen } from "@features/alerts/screens/AlertFeedScreen";
import { FullScreenAlertScreen } from "@features/alerts/screens/FullScreenAlertScreen";
import { useAlerts } from "@hooks/useAlerts";
import type { Alert } from "@models/Alert";
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

/** Inner stack for the feed tab — contains the feed + detail + full-screen. */
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
      component={FullScreenAlertScreen}
      options={{
        headerShown: false,
        presentation: "fullScreenModal",
        gestureEnabled: false,
        animation: "fade",
      }}
    />
  </Stack.Navigator>
);

/** Badge icon for the Feed tab showing unread count. */
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

export const StudentNavigator: React.FC = () => (
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
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
});
