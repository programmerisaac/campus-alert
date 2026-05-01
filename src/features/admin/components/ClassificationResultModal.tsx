// src/features/admin/components/ClassificationResultModal.tsx
/**
 * Modal dialog shown after an admin submits an alert.
 * Displays the AI classification result: urgency level, method, confidence.
 */

import { UrgencyBadge } from "@features/alerts/components/UrgencyBadge";
import type { Alert } from "@models/Alert";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  alert: Alert | null;
  onClose: () => void;
}

export const ClassificationResultModal: React.FC<Props> = ({
  alert,
  onClose,
}) => {
  if (!alert) return null;

  const isKeyword = alert.classification_method === "keyword_override";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>✅ Alert Sent</Text>
          <Text style={styles.subtitle}>Classification Result</Text>

          <View style={styles.badgeRow}>
            <UrgencyBadge urgency={alert.urgency} size="md" />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Method</Text>
            <Text style={styles.value}>
              {isKeyword ? "🔑 Keyword Override" : "🤖 XGBoost AI"}
            </Text>
          </View>

          {alert.classification_confidence !== null && (
            <View style={styles.row}>
              <Text style={styles.label}>Confidence</Text>
              <Text style={styles.value}>
                {(alert.classification_confidence * 100).toFixed(1)}%
              </Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Category</Text>
            <Text style={styles.value}>
              {alert.category.charAt(0).toUpperCase() + alert.category.slice(1)}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Recipients</Text>
            <Text style={styles.value}>{alert.recipient_count} user(s)</Text>
          </View>

          {isKeyword && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                ⚡ This alert was classified instantly via keyword match — no AI
                inference was needed.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6B7280", marginBottom: 20 },
  badgeRow: { marginBottom: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  label: { fontSize: 14, color: "#6B7280" },
  value: { fontSize: 14, fontWeight: "700", color: "#111827" },
  infoBox: {
    marginTop: 16,
    backgroundColor: "#FFFBEB",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FEF3C7",
  },
  infoText: { fontSize: 13, color: "#92400E", lineHeight: 18 },
  closeButton: {
    marginTop: 24,
    backgroundColor: "#154bba",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  closeText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
