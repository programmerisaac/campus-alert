// src/utils/urgencyConfig.ts
/**
 * Visual configuration for each alert urgency level.
 *
 * Single source of truth — all components (badge, card, modal, filter chips)
 * read from this so colours and icons are always consistent.
 *
 * Urgency levels (set by the Django ML pipeline):
 *   critical — life-safety emergencies. Red. Full-screen takeover. Vibrates.
 *   high     — serious incidents requiring immediate attention. Amber.
 *   medium   — important notices that can wait a moment. Blue.
 *   low      — general information. Green.
 */

import type { AlertUrgency } from "@models/Alert";

export interface UrgencyConfig {
  /** Human-readable label shown in badges and chips. */
  label: string;

  /** Emoji icon used in badges, chips, and modal headers. */
  icon: string;

  /** Primary accent colour — badge background, card left border, modal accent. */
  colour: string;

  /** Text colour on top of `colour` background (always white for accessibility). */
  textColour: string;

  /** Slightly darker border colour for card outlines. */
  borderColour: string;

  /** Tint colour for subtle UI elements. */
  tintColour: string;

  /** Full-screen modal background — dark, saturated version of the urgency colour. */
  modalBg: string;

  /** Body text colour on the modal background. */
  modalText: string;

  /**
   * Whether arriving alerts at this urgency should trigger the full-screen
   * modal takeover. Critical and High do. Medium and Low do not.
   */
  triggersFullScreen: boolean;

  /**
   * Vibration pattern for physical haptic feedback on arrival.
   * Format: [pause, vibrate, pause, vibrate, ...]
   * Empty array = no vibration.
   */
  vibrationPattern: number[];
}

export const URGENCY_CONFIG: Record<AlertUrgency, UrgencyConfig> = {
  critical: {
    label: "Critical",
    icon: "🚨",
    colour: "#DC2626",
    textColour: "#FFFFFF",
    borderColour: "#B91C1C",
    tintColour: "#FECACA",
    modalBg: "#450A0A",
    modalText: "#FEE2E2",
    triggersFullScreen: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500], // three strong pulses
  },
  high: {
    label: "High",
    icon: "⚠️",
    colour: "#D97706",
    textColour: "#FFFFFF",
    borderColour: "#B45309",
    tintColour: "#FDE68A",
    modalBg: "#451A03",
    modalText: "#FEF3C7",
    triggersFullScreen: true,
    vibrationPattern: [0, 400, 200, 400], // two pulses
  },
  medium: {
    label: "Medium",
    icon: "📢",
    colour: "#2563EB",
    textColour: "#FFFFFF",
    borderColour: "#1D4ED8",
    tintColour: "#BFDBFE",
    modalBg: "#1E3A8A",
    modalText: "#DBEAFE",
    triggersFullScreen: false,
    vibrationPattern: [0, 200], // single short pulse
  },
  low: {
    label: "Low",
    icon: "ℹ️",
    colour: "#16A34A",
    textColour: "#FFFFFF",
    borderColour: "#15803D",
    tintColour: "#DCFCE7",
    modalBg: "#052E16",
    modalText: "#DCFCE7",
    triggersFullScreen: false,
    vibrationPattern: [],
  },
};

export function getUrgencyConfig(urgency: AlertUrgency): UrgencyConfig {
  return URGENCY_CONFIG[urgency] ?? URGENCY_CONFIG.low;
}
