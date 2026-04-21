// src/features/alerts/components/AlertCard.tsx
/**
 * A single alert row in the student feed list.
 *
 * Displays: urgency badge, title, body preview, relative timestamp, and
 * an unread dot indicator. Tapping navigates to AlertDetailScreen.
 */

import type { Alert } from "@models/Alert";
import { timeAgo } from "@utils/timeago";
import { getUrgencyConfig } from "@utils/urgencyConfig";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { UrgencyBadge } from "./UrgencyBadge";

interface AlertCardProps {
  alert: Alert;
  onPress: (alert: Alert) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onPress }) => {
  const config = getUrgencyConfig(alert.urgency);
  const isUnread = !alert.acknowledged;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isUnread && { borderLeftColor: config.colour, borderLeftWidth: 4 },
      ]}
      onPress={() => onPress(alert)}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <UrgencyBadge urgency={alert.urgency} size="sm" />
        <Text style={styles.timestamp}>{timeAgo(alert.created_at)}</Text>
      </View>

      <View style={styles.titleRow}>
        {isUnread && (
          <View
            style={[styles.unreadDot, { backgroundColor: config.colour }]}
          />
        )}
        <Text
          style={[styles.title, isUnread && styles.titleBold]}
          numberOfLines={2}
        >
          {alert.title}
        </Text>
      </View>

      <Text style={styles.preview} numberOfLines={2}>
        {alert.body}
      </Text>

      {/* Show the delivery channel source so students know how it arrived */}
      {alert.delivery_channel && (
        <Text style={styles.channel}>
          via {CHANNEL_LABELS[alert.delivery_channel]}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const CHANNEL_LABELS: Record<string, string> = {
  fcm: "Push Notification",
  lan_websocket: "Campus Wi-Fi",
  offline_stored: "Offline Sync",
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 0,
    borderLeftColor: "transparent",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 12,
    color: "#6B7280",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  title: {
    fontSize: 15,
    color: "#111827",
    flex: 1,
  },
  titleBold: {
    fontWeight: "700",
  },
  preview: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 6,
  },
  channel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
});
