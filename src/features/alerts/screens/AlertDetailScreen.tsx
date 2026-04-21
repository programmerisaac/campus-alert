// src/features/alerts/screens/AlertDetailScreen.tsx
/**
 * Alert Detail Screen — full text and metadata for a single alert.
 *
 * Loaded when the student taps an AlertCard in the feed.
 * Displays: urgency badge, title, full body, delivery channel badge,
 * classification metadata, and the absolute send timestamp.
 */

import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiClient } from "@core/api/apiClient";
import { ENDPOINTS } from "@core/api/endpoints";
import type { Alert } from "@models/Alert";
import type { StudentStackParamList } from "@navigation/StudentNavigator";
import { formatAbsoluteDate } from "@utils/timeago";
import { getUrgencyConfig } from "@utils/urgencyConfig";
import { UrgencyBadge } from "../components/UrgencyBadge";

type Props = NativeStackScreenProps<StudentStackParamList, "AlertDetail">;

const CHANNEL_LABELS: Record<string, string> = {
  fcm: "📡 Push Notification (Internet)",
  lan_websocket: "🔗 Campus Wi-Fi (LAN)",
  offline_stored: "💾 Offline Sync",
};

export const AlertDetailScreen: React.FC<Props> = ({ route }) => {
  const insets = useSafeAreaInsets();
  const { alertId } = route.params;

  const [alert, setAlert] = useState<Alert | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAlert = async () => {
      try {
        const response = await apiClient.get<Alert>(
          ENDPOINTS.ALERTS.DETAIL(alertId),
        );
        setAlert(response.data);
      } catch {
        setError("Could not load this alert. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    loadAlert();
  }, [alertId]);

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#154bba" />
      </View>
    );
  }

  if (error || !alert) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>{error ?? "Alert not found."}</Text>
      </View>
    );
  }

  const config = getUrgencyConfig(alert.urgency);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      {/* Urgency tint header band */}
      <View style={[styles.tintBand, { backgroundColor: config.tintColour }]}>
        <UrgencyBadge urgency={alert.urgency} size="md" />
      </View>

      {/* Title */}
      <Text style={styles.title}>{alert.title}</Text>

      {/* Metadata row */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {formatAbsoluteDate(alert.created_at)}
        </Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>
          By {alert.created_by.first_name} {alert.created_by.last_name}
        </Text>
      </View>

      {/* Body */}
      <Text style={styles.body}>{alert.body}</Text>

      {/* Delivery channel badge */}
      {alert.delivery_channel && (
        <View style={styles.channelBadge}>
          <Text style={styles.channelText}>
            {CHANNEL_LABELS[alert.delivery_channel] ?? alert.delivery_channel}
          </Text>
        </View>
      )}

      {/* Classification info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Classification</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Method</Text>
          <Text style={styles.infoValue}>
            {alert.classification_method === "keyword_override"
              ? "🔑 Keyword Override"
              : "🤖 XGBoost AI"}
          </Text>
        </View>
        {alert.classification_confidence !== null && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Confidence</Text>
            <Text style={styles.infoValue}>
              {(alert.classification_confidence * 100).toFixed(1)}%
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Category</Text>
          <Text style={styles.infoValue}>
            {alert.category.charAt(0).toUpperCase() + alert.category.slice(1)}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  centred: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { paddingTop: 0 },
  tintBand: { padding: 20, paddingTop: 24 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 20,
    paddingTop: 16,
    lineHeight: 30,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 6,
  },
  metaDot: { color: "#9CA3AF", fontSize: 14 },
  metaText: { fontSize: 13, color: "#6B7280" },
  body: {
    fontSize: 16,
    color: "#374151",
    lineHeight: 26,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  channelBadge: {
    marginHorizontal: 20,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  channelText: { fontSize: 13, color: "#374151" },
  section: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  infoLabel: { fontSize: 14, color: "#6B7280" },
  infoValue: { fontSize: 14, color: "#111827", fontWeight: "600" },
  errorText: {
    fontSize: 16,
    color: "#DC2626",
    textAlign: "center",
    padding: 32,
  },
});
