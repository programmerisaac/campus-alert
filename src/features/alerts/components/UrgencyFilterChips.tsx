// src/features/alerts/components/UrgencyFilterChips.tsx
/**
 * Horizontal scrollable row of filter chips for the alert feed.
 *
 * Allows the student to filter the feed by urgency level.
 * "All" resets to the full unfiltered feed.
 *
 * Props:
 *   selected  — currently active urgency filter (null = 'All')
 *   onSelect  — callback invoked when the user taps a chip
 */

import type { AlertUrgency } from "@models/Alert";
import { URGENCY_CONFIG } from "@utils/urgencyConfig";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type FilterValue = AlertUrgency | null;

interface UrgencyFilterChipsProps {
  selected: FilterValue;
  onSelect: (urgency: FilterValue) => void;
}

const ALL_CHIP = { value: null, label: "🔔 All", colour: "#374151" };

const CHIPS = [
  ALL_CHIP,
  ...(["critical", "high", "medium", "low"] as AlertUrgency[]).map((u) => ({
    value: u,
    label: `${URGENCY_CONFIG[u].icon} ${URGENCY_CONFIG[u].label}`,
    colour: URGENCY_CONFIG[u].colour,
  })),
];

export const UrgencyFilterChips: React.FC<UrgencyFilterChipsProps> = ({
  selected,
  onSelect,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {CHIPS.map((chip) => {
          const isActive = chip.value === selected;
          return (
            <TouchableOpacity
              key={chip.label}
              style={[
                styles.chip,
                { borderColor: chip.colour },
                isActive && { backgroundColor: chip.colour },
              ]}
              onPress={() => onSelect(chip.value as FilterValue)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isActive ? "#FFFFFF" : chip.colour },
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
