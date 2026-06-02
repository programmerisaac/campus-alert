// src/features/alerts/screens/AlertFeedScreen.tsx
/**
 * Student Home — the main alert feed screen.
 *
 * Shows a paginated, filterable list of all received alerts.
 * New alerts arriving via FCM or WebSocket are prepended live.
 * Full-screen takeover is triggered automatically when pendingFullScreenAlert
 * is set in the store by a Critical or High urgency alert.
 *
 * ── Fixes applied ────────────────────────────────────────────────────────────
 * 1. Removed LAN_SERVER_IP constant — alertRepository.initialise() no longer
 *    accepts an IP parameter. The WebSocket client reads EXPO_PUBLIC_WS_BASE_URL
 *    directly at module load time, so the caller cannot pass a wrong IP.
 *
 * 2. Fixed FCM notification type cast — Expo's notification data arrives as
 *    { [key: string]: unknown }. TypeScript correctly rejects a direct cast to
 *    Alert because the shapes don't overlap. We now cast to unknown first, then
 *    extract only the `id` field we actually need with a typeof guard.
 *
 * 3. Fixed infinite pagination loop — the empty catch block in handleLoadMore
 *    meant that a 404 (no page 2) did not set hasNextPage to false. FlatList's
 *    onEndReached kept firing, triggering hundreds of requests per minute until
 *    Django's rate limiter (100/min) kicked in with 429s. The catch block now
 *    always sets hasNextPage(false) to stop retrying.
 */

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

import { useAlerts } from "@hooks/useAlerts";
import { useAuth } from "@hooks/useAuth";
import type { Alert, AlertUrgency } from "@models/Alert";
import type { StudentStackParamList } from "@navigation/StudentNavigator";
import { alertRepository } from "../alertRepository";
import { AlertCard } from "../components/AlertCard";
import { UrgencyFilterChips } from "../components/UrgencyFilterChips";

type Props = NativeStackScreenProps<StudentStackParamList, "AlertFeed">;

export const AlertFeedScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { alerts, isLoading, pendingFullScreenAlert } = useAlerts();

  const [urgencyFilter, setUrgencyFilter] = useState<AlertUrgency | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Ref guards against the initialise() call firing twice in React Strict Mode.
  const isInitialised = useRef(false);

  // ── Initialise delivery pipeline on mount ──────────────────────────────────
  //
  // alertRepository.initialise() does three things:
  //   1. Loads the first page of alerts from the API
  //   2. Subscribes to connectivity changes (online → sync missed alerts)
  //   3. Opens a WebSocket when connectivity is "lanOnly"
  //
  // No IP parameter needed — the WebSocket client reads EXPO_PUBLIC_WS_BASE_URL
  // at module load time. This eliminates the class of bug where a stale or
  // wrong IP was passed in (e.g. the old hardcoded "192.168.1.100:8000").
  useEffect(() => {
    if (isInitialised.current) return;
    isInitialised.current = true;

    alertRepository.initialise();

    return () => {
      alertRepository.teardown();
    };
  }, []);

  // ── FCM notification tap handler ───────────────────────────────────────────
  //
  // FIX: Expo's notification data arrives as { [key: string]: unknown }.
  // TypeScript rejects a direct `as Alert` cast because neither type
  // sufficiently overlaps with the other (ts2352). The correct approach is:
  //   1. Cast to `unknown` first (removes the type constraint)
  //   2. Cast to a minimal interface only containing what we actually use
  //   3. Guard with typeof before using the value
  //
  // We only need `id` to navigate — we do NOT need to reconstruct the full
  // Alert object from FCM data (the detail screen fetches it fresh from the API).
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        // Step 1: The raw FCM data payload is typed as { [key: string]: unknown }
        const rawData = response.notification.request.content.data as unknown;

        // Step 2: Cast to a minimal shape — only the field we need
        const data = rawData as { id?: unknown } | null | undefined;

        // Step 3: Runtime guard — confirm `id` is actually a non-empty string
        // before using it. Malformed payloads are safely ignored.
        const alertId =
          typeof data?.id === "string" && data.id ? data.id : null;

        if (alertId) {
          navigation.navigate("AlertDetail", { alertId });
        }
      },
    );

    return () => subscription.remove();
  }, [navigation]);

  // ── Pull-to-refresh ────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Reset pagination so we start from page 1 again after a refresh
    setPage(1);
    setHasNextPage(true);

    try {
      const data = await alertRepository.fetchAlertFeed(
        1,
        urgencyFilter ?? undefined,
      );
      const { useAlertStore } = await import("@store/alertStore");
      useAlertStore.getState().setAlerts(data.results);
      // Use the API's own `next` pointer to determine if more pages exist.
      // This is the canonical source of truth — never guess based on count.
      setHasNextPage(data.next !== null);
    } catch (err) {
      console.error("[AlertFeedScreen] Refresh failed:", err);
      // On failure, assume no more pages to prevent retry loops
      setHasNextPage(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [urgencyFilter]);

  // ── Pagination: load next page when end of list is reached ────────────────
  //
  // FIX: The previous empty catch block was the root cause of the infinite
  // request storm visible in the Django logs:
  //
  //   GET /api/v1/alerts/?page=2  → 404  (only 1 page of data exists)
  //   catch {}                           (hasNextPage stays true!)
  //   onEndReached fires again           (immediately, because list is at end)
  //   GET /api/v1/alerts/?page=2  → 404  (again...)
  //   ... repeated 100+ times until Django rate-limits with 429
  //
  // Fix: ALWAYS set hasNextPage(false) in the catch block. If the request
  // failed, we have no evidence that a next page exists, so we stop retrying.
  // The pull-to-refresh gesture resets hasNextPage(true) so the user can
  // try again manually.
  const handleLoadMore = useCallback(async () => {
    // Guard: only fetch if we know there's more data AND we're not already fetching
    if (isFetchingMore || !hasNextPage) return;

    setIsFetchingMore(true);
    const nextPage = page + 1;

    try {
      const data = await alertRepository.fetchAlertFeed(
        nextPage,
        urgencyFilter ?? undefined,
      );

      const { useAlertStore } = await import("@store/alertStore");

      // Append the new page results to the existing list (don't replace)
      useAlertStore.getState().setAlerts([...alerts, ...data.results]);
      setPage(nextPage);

      // Use the API's `next` pointer — if null, there are no more pages
      setHasNextPage(data.next !== null);
    } catch (err) {
      // ── CRITICAL FIX ────────────────────────────────────────────────────────
      // ALWAYS set hasNextPage to false on any error (404, 429, network, etc.)
      // Without this, onEndReached keeps firing in a tight loop, hammering the
      // Django backend hundreds of times per minute.
      //
      // The user can pull-to-refresh to try again — that resets hasNextPage(true).
      console.warn("[AlertFeedScreen] Load more failed:", err);
      setHasNextPage(false);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasNextPage, page, urgencyFilter, alerts]);

  // ── Urgency filter chip selection ─────────────────────────────────────────
  //
  // When the user selects a filter chip, we reset pagination and reload the
  // feed with the new urgency filter applied.
  const handleFilterChange = useCallback(
    async (urgency: AlertUrgency | null) => {
      setUrgencyFilter(urgency);
      // Reset pagination — the filter changes the dataset entirely
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
        // If filter fetch fails, keep showing current feed rather than showing nothing.
        console.warn("[AlertFeedScreen] Filter fetch failed:", err);
        setHasNextPage(false);
      }
    },
    [],
  );

  // ── Client-side filter (for when data is already loaded) ──────────────────
  // When the store already has all alerts, we can filter in memory.
  // The urgencyFilter state also drives the API query via handleFilterChange.
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

  // ── Loading state — only show full-screen spinner on initial load ──────────
  if (isLoading && alerts.length === 0) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#154bba" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header bar */}
      <View style={styles.titleBar}>
        <Text style={styles.screenTitle}>Alert Feed</Text>
        <Text style={styles.greeting}>
          {user?.first_name ? `Hi, ${user.first_name}` : ""}
        </Text>
      </View>

      {/* Urgency filter chips */}
      <UrgencyFilterChips
        selected={urgencyFilter}
        onSelect={handleFilterChange}
      />

      {/* Alert list */}
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
        // onEndReached fires when the user scrolls within 30% of the bottom.
        // handleLoadMore is guarded by isFetchingMore and hasNextPage so it
        // will not fire multiple times for the same position.
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
