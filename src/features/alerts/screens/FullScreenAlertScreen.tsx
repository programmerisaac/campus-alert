// src/features/alerts/screens/FullScreenAlertScreen.tsx
/**
 * Full-Screen Alert Takeover (Features F-05).
 *
 * Triggered automatically when a Critical or High urgency alert arrives.
 * Takes over the entire screen and CANNOT be dismissed without tapping
 * "Acknowledge" — the back button is disabled via usePreventRemove.
 *
 * Visual design:
 *   - Background matches urgency colour (red for Critical, orange for High)
 *   - Pulsing urgency icon animation
 *   - Alert title and body
 *   - "Acknowledge" button that calls the backend before releasing the screen
 */

import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useRef } from "react";
import {
    Animated,
    BackHandler,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StudentStackParamList } from "@navigation/StudentNavigator";
import { getUrgencyConfig } from "@utils/urgencyConfig";
import { alertRepository } from "../alertRepository";

type Props = NativeStackScreenProps<StudentStackParamList, "FullScreenAlert">;

export const FullScreenAlertScreen: React.FC<Props> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { alert } = route.params;
  const config = getUrgencyConfig(alert.urgency);

  // ── Pulsing animation for the urgency icon ─────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // ── Block hardware back button on Android ──────────────────────────────────
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true, // returning true prevents default back behaviour
    );
    return () => backHandler.remove();
  }, []);

  // ── Prevent swipe-back gesture on iOS ─────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);

  // ── Acknowledge handler ────────────────────────────────────────────────────
  const handleAcknowledge = useCallback(async () => {
    // Determine which channel delivered this alert.
    // delivery_channel is set client-side when the alert arrives.
    const channel = alert.delivery_channel ?? "fcm";

    await alertRepository.acknowledgeAlert(alert.id, channel);

    // Navigate back to the feed — acknowledgement clears pendingFullScreenAlert
    // in the store, which removes the trigger for this screen.
    navigation.goBack();
  }, [alert, navigation]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: config.colour },
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={config.colour}
        translucent={false}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* Pulsing icon */}
        <Animated.Text
          style={[styles.icon, { transform: [{ scale: pulseAnim }] }]}
        >
          {config.icon}
        </Animated.Text>

        {/* Urgency label */}
        <View style={styles.urgencyLabel}>
          <Text style={styles.urgencyText}>{config.label} ALERT</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{alert.title}</Text>

        {/* Body */}
        <Text style={styles.body}>{alert.body}</Text>

        {/* Sender info */}
        <Text style={styles.sender}>
          Sent by {alert.created_by.first_name} {alert.created_by.last_name}
        </Text>
      </ScrollView>

      {/* Acknowledge button — fixed at bottom, always visible */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.acknowledgeButton}
          onPress={handleAcknowledge}
          activeOpacity={0.85}
        >
          <Text style={[styles.acknowledgeText, { color: config.colour }]}>
            ✓ Acknowledge
          </Text>
        </TouchableOpacity>
        <Text style={styles.footerHint}>
          You must acknowledge this alert to dismiss it.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 20,
  },
  icon: { fontSize: 72, marginBottom: 20 },
  urgencyLabel: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  urgencyText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 34,
  },
  body: {
    fontSize: 17,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 32,
  },
  sender: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 40,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: "center",
  },
  acknowledgeButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    marginBottom: 10,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  acknowledgeText: { fontSize: 18, fontWeight: "800" },
  footerHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginBottom: 8,
  },
});
