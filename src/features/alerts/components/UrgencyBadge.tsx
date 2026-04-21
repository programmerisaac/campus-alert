// src/features/alerts/components/UrgencyBadge.tsx
/**
 * Coloured pill badge that displays the urgency level of an alert.
 *
 * Props:
 *   urgency — AlertUrgency value ('critical' | 'high' | 'medium' | 'low')
 *   size    — 'sm' | 'md' (default 'md')
 */

import type { AlertUrgency } from "@models/Alert";
import { getUrgencyConfig } from "@utils/urgencyConfig";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface UrgencyBadgeProps {
  urgency: AlertUrgency;
  size?: "sm" | "md";
}

export const UrgencyBadge: React.FC<UrgencyBadgeProps> = ({
  urgency,
  size = "md",
}) => {
  const config = getUrgencyConfig(urgency);
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.colour },
        isSmall && styles.badgeSmall,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: config.textColour },
          isSmall && styles.textSmall,
        ]}
      >
        {config.icon} {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  badgeSmall: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  textSmall: {
    fontSize: 10,
  },
});
