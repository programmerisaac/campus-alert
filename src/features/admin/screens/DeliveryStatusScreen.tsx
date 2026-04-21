// src/features/admin/screens/DeliveryStatusScreen.tsx
/**
 * Delivery Status Screen — per-alert channel breakdown for admins (Feature F-12).
 *
 * Shows: total recipients, per-channel delivery counts, progress bars,
 * acknowledgement rate for Critical/High alerts, and per-user delivery logs.
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

import { UrgencyBadge } from "@features/alerts/components/UrgencyBadge";
import type { AlertDeliveryStatus, DeliveryChannel } from "@models/Alert";
import type { AdminStackParamList } from "@navigation/AdminNavigator";
import { formatAbsoluteDate } from "@utils/timeago";
import { getDeliveryStatus } from "../adminRepository";

type Props = NativeStackScreenProps<AdminStackParamList, "DeliveryStatus">;

const CHANNEL_META: Record<
  DeliveryChannel,
  { label: string; icon: string; colour: string }
> = {
  fcm: { label: "Push (FCM)", icon: "📡", colour: "#2563EB" },
  lan_websocket: { label: "Campus Wi-Fi", icon: "🔗", colour: "#059669" },
  offline_stored: { label: "Offline Sync", icon: "💾", colour: "#D97706" },
};

export const DeliveryStatusScreen: React.FC<Props> = ({ route }) => {
  const insets = useSafeAreaInsets();
  const { alertId } = route.params;

  const [status, setStatus] = useState<AlertDeliveryStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getDeliveryStatus(alertId);
        setStatus(data);
      } catch {
        setError("Could not load delivery status.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [alertId]);

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#154bba" />
      </View>
    );
  }

  if (error || !status) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // Compute per-channel counts from delivery logs
  const channelCounts: Record<string, number> = {};
  let acknowledgedCount = 0;

  status.delivery_logs.forEach((log) => {
    channelCounts[log.channel] = (channelCounts[log.channel] ?? 0) + 1;
    if (log.acknowledged_at) acknowledgedCount++;
  });

  const total = status.delivery_logs.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      {/* Alert header */}
      <View style={styles.alertHeader}>
        <UrgencyBadge urgency={status.urgency} />
        <Text style={styles.alertTitle}>{status.title}</Text>
        {status.dispatched_at && (
          <Text style={styles.dispatchedAt}>
            Sent {formatAbsoluteDate(status.dispatched_at)}
          </Text>
        )}
      </View>

      {/* Summary stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{status.recipient_count}</Text>
          <Text style={styles.statLabel}>Targeted</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{total}</Text>
          <Text style={styles.statLabel}>Delivered</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{acknowledgedCount}</Text>
          <Text style={styles.statLabel}>Acknowledged</Text>
        </View>
      </View>

      {/* Per-channel breakdown */}
      <Text style={styles.sectionTitle}>Delivery Channels</Text>
      {(["fcm", "lan_websocket", "offline_stored"] as DeliveryChannel[]).map(
        (channel) => {
          const count = channelCounts[channel] ?? 0;
          const percent = total > 0 ? (count / total) * 100 : 0;
          const meta = CHANNEL_META[channel];

          return (
            <View key={channel} style={styles.channelRow}>
              <View style={styles.channelLabel}>
                <Text style={styles.channelIcon}>{meta.icon}</Text>
                <Text style={styles.channelName}>{meta.label}</Text>
                <Text style={styles.channelCount}>{count}</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${percent}%` as `${number}%`,
                      backgroundColor: meta.colour,
                    },
                  ]}
                />
              </View>
            </View>
          );
        },
      )}

      {/* Individual delivery logs */}
      {status.delivery_logs.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Delivery Log
          </Text>
          {status.delivery_logs.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.logUser}>
                {log.user.first_name} {log.user.last_name}
              </Text>
              <Text style={styles.logChannel}>
                {CHANNEL_META[log.channel]?.icon ?? "?"}{" "}
                {CHANNEL_META[log.channel]?.label ?? log.channel}
              </Text>
              <Text style={styles.logAck}>
                {log.acknowledged_at ? "✅ Acknowledged" : "⏳ Pending"}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centred: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16 },
  alertHeader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 10,
    marginBottom: 4,
  },
  dispatchedAt: { fontSize: 13, color: "#6B7280" },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  stat: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  statValue: { fontSize: 26, fontWeight: "800", color: "#154bba" },
  statLabel: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  channelRow: { marginBottom: 14 },
  channelLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 6,
  },
  channelIcon: { fontSize: 16 },
  channelName: { flex: 1, fontSize: 14, color: "#374151", fontWeight: "600" },
  channelCount: { fontSize: 14, color: "#6B7280" },
  progressBar: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  logRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logUser: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111827" },
  logChannel: { fontSize: 12, color: "#6B7280" },
  logAck: { fontSize: 12, color: "#374151" },
  errorText: {
    fontSize: 16,
    color: "#DC2626",
    padding: 24,
    textAlign: "center",
  },
});
