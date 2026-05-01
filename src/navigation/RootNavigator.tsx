// src/navigation/RootNavigator.tsx
/**
 * Root navigator — the auth gate and role router.
 *
 * On app launch:
 *   1. Shows a splash/loading screen while authStore.restoreSession() runs.
 *   2. If no session → LoginScreen.
 *   3. If user.role === 'admin' → AdminNavigator.
 *   4. Otherwise (student / staff) → StudentNavigator.
 *
 * RootNavigator reacts to authStore.user — when clearAuth() is called
 * after logout, the store change triggers a re-render and the login screen
 * appears automatically.
 */

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { LoginScreen } from "@features/auth/screens/LoginScreen";
import { useAuthStore } from "@store/authStore";
import { AdminNavigator } from "./AdminNavigator";
import { StudentNavigator } from "./StudentNavigator";

const Stack = createNativeStackNavigator();

export const RootNavigator: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isInitialised = useAuthStore((s) => s.isInitialised);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  // Restore server URL and try to re-authenticate on app launch
  useEffect(() => {
    const init = async () => {
      await restoreSession();
    };
    init();
  }, [restoreSession]);

  // Show a full-screen loader while restoring session
  if (!isInitialised) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#154bba" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user === null ? (
          // Not authenticated — show login
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user.role === "admin" ? (
          // Admin role → admin dashboard flow
          <Stack.Screen name="AdminApp" component={AdminNavigator} />
        ) : (
          // Student or staff → alert feed flow
          <Stack.Screen name="StudentApp" component={StudentNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
});
