// src/features/admin/screens/AdminHomeScreen.tsx
/**
 * Admin Dashboard — overview of all sent alerts with status chips.
 * Shows the most recent alerts and navigates to DeliveryStatusScreen on tap.
 */

import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UrgencyBadge } from "@features/alerts/components/UrgencyBadge";
import { useAuth } from "@hooks/useAuth";
import type { Alert } from "@models/Alert";
import type { AdminStackParamList } from "@navigation/AdminNavigator";
import { timeAgo } from "@utils/timeago";
import { getAdminAlertList } from "../adminRepository";

type Props = NativeStackScreenProps<AdminStackParamList, "AdminHome">;

export const AdminHomeScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const data = await getAdminAlertList(1);
      setAlerts(data.results);
      setError(null);
    } catch {
      setError("Could not load alerts. Pull down to retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const renderItem = useCallback(
    ({ item }: { item: Alert }) => (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate("DeliveryStatus", { alertId: item.id })
        }
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <UrgencyBadge urgency={item.urgency} size="sm" />
          <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.cardFooter}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: STATUS_COLOURS[item.status] ?? "#9CA3AF" },
            ]}
          />
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          <Text style={styles.recipients}>
            · {item.recipient_count} recipient(s)
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [navigation],
  );

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#154bba" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>
            Welcome, {user?.first_name ?? "Admin"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.composeButton}
          onPress={() => navigation.navigate("Compose")}
        >
          <Text style={styles.composeButtonText}>+ Compose</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadAlerts(true)}
            tintColor="#154bba"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No alerts sent yet</Text>
          </View>
        }
      />
    </View>
  );
};

const STATUS_COLOURS: Record<string, string> = {
  dispatched: "#16A34A",
  classified: "#D97706",
  failed: "#DC2626",
  draft: "#9CA3AF",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centred: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 20, fontWeight: "800", color: "#154bba" },
  subtitle: { fontSize: 13, color: "#6B7280" },
  composeButton: {
    backgroundColor: "#154bba",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  composeButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    margin: 16,
    borderRadius: 10,
  },
  errorText: { color: "#991B1B", fontSize: 14 },
  listContent: { padding: 12, gap: 10 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  timestamp: { fontSize: 12, color: "#6B7280" },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  cardFooter: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: "700", color: "#374151" },
  recipients: { fontSize: 12, color: "#9CA3AF", marginLeft: 4 },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#6B7280" },
});
