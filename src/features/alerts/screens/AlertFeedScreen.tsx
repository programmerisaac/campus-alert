// src/features/alerts/screens/AlertFeedScreen.tsx
/**
 * Student Home — the main alert feed screen.
 *
 * Shows a paginated, filterable list of all received alerts.
 * New alerts arriving via WebSocket are prepended live.
 * Full-screen takeover is triggered automatically when pendingFullScreenAlert
 * is set in the store by a Critical or High urgency alert.
 */

import { apiClient } from "@core/api/apiClient";
import { ENDPOINTS } from "@core/api/endpoints";
import { upsertAlert } from "@core/db/localDb";
import { useAlerts } from "@hooks/useAlerts";
import { useAuth } from "@hooks/useAuth";
import type { Alert, AlertUrgency } from "@models/Alert";
import type { StudentStackParamList } from "@navigation/StudentNavigator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alertRepository } from "../alertRepository";
import { AlertCard } from "../components/AlertCard";
import { UrgencyFilterChips } from "../components/UrgencyFilterChips";

type Props = NativeStackScreenProps<StudentStackParamList, "AlertFeed">;

export const AlertFeedScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { alerts, isLoading } = useAlerts();

  const [urgencyFilter, setUrgencyFilter] = useState<AlertUrgency | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const isInitialised = useRef(false);

  // ── Initialise delivery pipeline on mount ─────────────────────────────────
  useEffect(() => {
    if (isInitialised.current) return;
    isInitialised.current = true;
    alertRepository.initialise();
    return () => {
      alertRepository.teardown();
    };
  }, []);

  // ── Notification tap handler ───────────────────────────────────────────────
  // When user taps a local notification:
  //   - critical/high → fetch full alert, show the full-screen modal
  //   - medium/low    → open AlertDetail screen
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const rawData = response.notification.request.content.data as unknown;
        const data = rawData as
          | { id?: unknown; urgency?: unknown }
          | null
          | undefined;

        const alertId =
          typeof data?.id === "string" && data.id ? data.id : null;
        const urgency = typeof data?.urgency === "string" ? data.urgency : null;

        if (!alertId) return;

        if (urgency === "critical" || urgency === "high") {
          // Fetch the full alert so created_by is populated, then set it as
          // pendingFullScreenAlert — the Modal in StudentNavigator appears.
          try {
            const res = await apiClient.get<Alert>(
              ENDPOINTS.ALERTS.DETAIL(alertId),
            );
            const fullAlert: Alert = {
              ...res.data,
              delivery_channel: "lan_websocket",
            };
            await upsertAlert(fullAlert);
            const { useAlertStore } = await import("@store/alertStore");
            useAlertStore.getState().setFullScreenAlert(fullAlert);
          } catch {
            // Fallback: open the detail screen
            navigation.navigate("AlertDetail", { alertId });
          }
        } else {
          navigation.navigate("AlertDetail", { alertId });
        }
      },
    );

    return () => subscription.remove();
  }, [navigation]);

  // ── Pull-to-refresh ────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPage(1);
    setHasNextPage(true);

    try {
      const data = await alertRepository.fetchAlertFeed(
        1,
        urgencyFilter ?? undefined,
      );
      const { useAlertStore } = await import("@store/alertStore");
      useAlertStore.getState().setAlerts(data.results);
      setHasNextPage(data.next !== null);
    } catch (err) {
      console.error("[AlertFeedScreen] Refresh failed:", err);
      setHasNextPage(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [urgencyFilter]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (isFetchingMore || !hasNextPage) return;

    setIsFetchingMore(true);
    const nextPage = page + 1;

    try {
      const data = await alertRepository.fetchAlertFeed(
        nextPage,
        urgencyFilter ?? undefined,
      );
      const { useAlertStore } = await import("@store/alertStore");
      useAlertStore.getState().setAlerts([...alerts, ...data.results]);
      setPage(nextPage);
      setHasNextPage(data.next !== null);
    } catch (err) {
      console.warn("[AlertFeedScreen] Load more failed:", err);
      setHasNextPage(false);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasNextPage, page, urgencyFilter, alerts]);

  // ── Urgency filter ────────────────────────────────────────────────────────
  const handleFilterChange = useCallback(
    async (urgency: AlertUrgency | null) => {
      setUrgencyFilter(urgency);
      setPage(1);
      setHasNextPage(true);

      try {
        const data = await alertRepository.fetchAlertFeed(
          1,
          urgency ?? undefined,
        );
        const { useAlertStore } = await import("@store/alertStore");
        useAlertStore.getState().setAlerts(data.results);
        setHasNextPage(data.next !== null);
      } catch (err) {
        console.warn("[AlertFeedScreen] Filter fetch failed:", err);
        setHasNextPage(false);
      }
    },
    [],
  );

  const filteredAlerts = urgencyFilter
    ? alerts.filter((a) => a.urgency === urgencyFilter)
    : alerts;

  const renderItem = useCallback(
    ({ item }: { item: Alert }) => (
      <AlertCard
        alert={item}
        onPress={(alert) =>
          navigation.navigate("AlertDetail", { alertId: alert.id })
        }
      />
    ),
    [navigation],
  );

  if (isLoading && alerts.length === 0) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#154bba" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.titleBar}>
        <Text style={styles.screenTitle}>Alert Feed</Text>
        <Text style={styles.greeting}>
          {user?.first_name ? `Hi, ${user.first_name}` : ""}
        </Text>
      </View>

      <UrgencyFilterChips
        selected={urgencyFilter}
        onSelect={handleFilterChange}
      />

      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#154bba"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingMore ? (
            <ActivityIndicator style={styles.footerLoader} color="#154bba" />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>No alerts yet</Text>
            <Text style={styles.emptySubtext}>
              You'll see alerts from your university here.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centred: { flex: 1, justifyContent: "center", alignItems: "center" },
  titleBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  screenTitle: { fontSize: 20, fontWeight: "700", color: "#154bba" },
  greeting: { fontSize: 14, color: "#6B7280" },
  listContent: { paddingVertical: 8, paddingBottom: 24 },
  footerLoader: { paddingVertical: 20 },
  emptyState: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#374151" },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
