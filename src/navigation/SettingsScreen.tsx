// src/navigation/SettingsScreen.tsx
/**
 * Settings Screen — shared by both students and admins.
 * Shows user profile info and provides logout.
 */

import { useAuth } from "@hooks/useAuth";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          setIsLoggingOut(true);
          await logout();
          // RootNavigator will re-render automatically after user is null.
        },
      },
    ]);
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <Text style={styles.title}>Settings</Text>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.first_name?.[0]?.toUpperCase() ?? "?"}
          </Text>
        </View>
        <View>
          <Text style={styles.name}>
            {user?.first_name} {user?.last_name}
          </Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {user?.role?.toUpperCase() ?? "USER"}
            </Text>
          </View>
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.infoSection}>
        {user?.cu_id ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Student/Staff ID</Text>
            <Text style={styles.infoValue}>{user.cu_id}</Text>
          </View>
        ) : null}
        {user?.department ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Department</Text>
            <Text style={styles.infoValue}>{user.department}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Account Status</Text>
          <Text
            style={[
              styles.infoValue,
              { color: user?.is_verified ? "#16A34A" : "#D97706" },
            ]}
          >
            {user?.is_verified ? "✅ Verified" : "⏳ Unverified"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? (
          <ActivityIndicator color="#DC2626" />
        ) : (
          <Text style={styles.logoutText}>Log Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 20 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#154bba",
    marginBottom: 24,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#154bba",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  name: { fontSize: 17, fontWeight: "700", color: "#111827" },
  email: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  roleBadge: {
    marginTop: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  roleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#154bba",
    letterSpacing: 0.8,
  },
  infoSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 24,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabel: { fontSize: 14, color: "#6B7280" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#111827" },
  logoutButton: {
    borderWidth: 1.5,
    borderColor: "#DC2626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  logoutText: { color: "#DC2626", fontSize: 16, fontWeight: "700" },
});
