// src/navigation/AdminNavigator.tsx
/**
 * Bottom tab navigator for administrators.
 *
 * Tabs:
 *   Dashboard — AdminHomeScreen (recent alerts, delivery summaries)
 *   Compose   — ComposeAlertScreen
 *   Settings  — profile info and logout
 */

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { Text } from "react-native";

import { AdminHomeScreen } from "@features/admin/screens/AdminHomeScreen";
import { ComposeAlertScreen } from "@features/admin/screens/ComposeAlertScreen";
import { DeliveryStatusScreen } from "@features/admin/screens/DeliveryStatusScreen";
import { SettingsScreen } from "./SettingsScreen";

// ── Type Definitions ───────────────────────────────────────────────────────────
export type AdminStackParamList = {
  AdminHome: undefined;
  Compose: undefined;
  DeliveryStatus: { alertId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();
const Tabs = createBottomTabNavigator();

const DashboardStack: React.FC = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="AdminHome"
      component={AdminHomeScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="DeliveryStatus"
      component={DeliveryStatusScreen}
      options={{ title: "Delivery Status", headerTintColor: "#154bba" }}
    />
  </Stack.Navigator>
);

export const AdminNavigator: React.FC = () => (
  <Tabs.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: "#154bba",
      tabBarStyle: { borderTopColor: "#E5E7EB" },
    }}
  >
    <Tabs.Screen
      name="DashboardTab"
      component={DashboardStack}
      options={{
        title: "Dashboard",
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 22 }}>{focused ? "📊" : "📈"}</Text>
        ),
      }}
    />
    <Tabs.Screen
      name="ComposeTab"
      component={ComposeAlertScreen}
      options={{
        title: "Compose",
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 22 }}>{focused ? "✏️" : "📝"}</Text>
        ),
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
