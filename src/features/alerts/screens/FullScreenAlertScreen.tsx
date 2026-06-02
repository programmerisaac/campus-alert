// src/features/alerts/screens/FullScreenAlertScreen.tsx
/**
 * Full-screen alert takeover screen.
 *
 * Two entry points:
 *  1. Automatic — StudentNavigator shows this via a Modal when a Critical/High
 *     alert arrives via WebSocket (pendingFullScreenAlert in alertStore).
 *  2. Manual    — Student taps a Critical/High alert card in the feed
 *     → navigates here with { alert } route params.
 *
 * Visual design:
 *   Background, header, and button colours are all driven by urgency level.
 *   Critical = deep red. High = deep amber. Consistent with urgencyConfig.ts.
 *
 * Props (from React Navigation route params):
 *   alert — the Alert object to display
 *   onAcknowledge — optional callback for the modal use case
 *                   (navigation use case calls alertRepository directly)
 */

import { alertRepository } from "@features/alerts/alertRepository";
import type { Alert } from "@models/Alert";
import type { StudentStackParamList } from "@navigation/StudentNavigator";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getUrgencyConfig } from "@utils/urgencyConfig";
import React, { useEffect } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface FullScreenAlertScreenProps {
  /**
   * When used as a navigation screen, the alert comes from route.params.
   * When used inside the StudentNavigator Modal, it comes from props directly.
   */
  alert: Alert;
  /**
   * Optional override for the acknowledge action.
   * Navigation screen: not provided — uses alertRepository.acknowledgeAlert().
   * Modal: provided — caller handles dismiss.
   */
  onAcknowledge?: () => void;
}

export const FullScreenAlertScreen: React.FC<FullScreenAlertScreenProps> = ({
  alert,
  onAcknowledge,
}) => {
  const insets = useSafeAreaInsets();
  const config = getUrgencyConfig(alert.urgency);

  // ✅ Fix: Call the hook unconditionally at top level and provide explicit stack parameters
  const navigation = useNavigation<NavigationProp<StudentStackParamList>>();

  // Haptic feedback on mount — tells the user something urgent arrived
  useEffect(() => {
    if (config.vibrationPattern.length > 0) {
      Vibration.vibrate(config.vibrationPattern);
    }
  }, [config.vibrationPattern]);

  const handleAcknowledge = async () => {
    if (onAcknowledge) {
      // Modal mode — parent handles dismiss and store update
      onAcknowledge();
    } else {
      // Navigation mode — call repository and go back
      await alertRepository.acknowledgeAlert(alert.id, "lan_websocket");

      // ✅ Safely try calling goBack if available on the navigation tree
      if (navigation && typeof navigation.goBack === "function") {
        navigation.goBack();
      }
    }
  };

  const formattedTime = new Date(alert.created_at).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const formattedDate = new Date(alert.created_at).toLocaleDateString("en-NG", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={[styles.root, { backgroundColor: config.modalBg }]}>
      {/* Make the status bar text white to contrast against the dark modal bg */}
      <StatusBar barStyle="light-content" backgroundColor={config.modalBg} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 16,
            backgroundColor: config.colour,
          },
        ]}
      >
        <Text style={styles.headerIcon}>{config.icon}</Text>
        <Text style={styles.headerUrgency}>{config.label.toUpperCase()}</Text>
        <Text style={styles.headerTime}>
          {formattedDate} · {formattedTime}
        </Text>
      </View>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: config.modalText }]}>
          {alert.title}
        </Text>

        <View
          style={[
            styles.divider,
            { backgroundColor: config.colour, opacity: 0.4 },
          ]}
        />

        <Text style={[styles.body, { color: config.modalText }]}>
          {alert.body}
        </Text>

        {/* Metadata row */}
        <View style={styles.metaRow}>
          <Text
            style={[styles.metaText, { color: config.modalText, opacity: 0.6 }]}
          >
            From: {alert.created_by.first_name} {alert.created_by.last_name}
          </Text>
          <Text
            style={[styles.metaText, { color: config.modalText, opacity: 0.6 }]}
          >
            Category: {alert.category}
          </Text>
        </View>
      </ScrollView>

      {/* ── Acknowledge button ───────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.ackButton, { backgroundColor: config.colour }]}
          onPress={handleAcknowledge}
          activeOpacity={0.85}
          accessibilityLabel="Acknowledge this alert"
          accessibilityRole="button"
        >
          <Text style={styles.ackButtonText}>✓ Acknowledge</Text>
        </TouchableOpacity>

        {/* Safety info footer */}
        <Text
          style={[styles.footerNote, { color: config.modalText, opacity: 0.5 }]}
        >
          Tap acknowledge to confirm you have seen this alert.
        </Text>
      </View>
    </View>
  );
};

// ─── Navigation screen wrapper ─────────────────────────────────────────────────
type NavigationScreenProps = NativeStackScreenProps<
  StudentStackParamList,
  "FullScreenAlert"
>;

export const FullScreenAlertNavigationScreen: React.FC<
  NavigationScreenProps
> = ({ route }) => {
  return <FullScreenAlertScreen alert={route.params.alert} />;
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
  },
  headerIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  headerUrgency: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 4,
  },
  headerTime: {
    color: "#FFFFFF",
    fontSize: 13,
    opacity: 0.85,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  body: {
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 24,
  },
  metaRow: {
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 10,
  },
  ackButton: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  ackButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  footerNote: {
    textAlign: "center",
    fontSize: 12,
  },
});
