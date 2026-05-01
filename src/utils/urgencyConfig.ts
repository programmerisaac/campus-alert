// src/utils/urgencyConfig.ts
/**
 * Per-urgency visual configuration — colour, icon name, label, and display behaviour.
 *
 * Centralising these here means changing a colour or label is a one-line edit
 * and every component that renders urgency stays consistent automatically.
 */

import type { AlertUrgency } from "@models/Alert";

export interface UrgencyConfig {
  /** Display label shown in badges and headers. */
  label: string;
  /** Tailwind-style hex colour used as the badge background. */
  colour: string;
  /** Lighter tint used for card backgrounds and row highlights. */
  tintColour: string;
  /** Text colour that maintains contrast on the badge background. */
  textColour: string;
  /** Emoji or character shown alongside the urgency label. */
  icon: string;
  /** Whether this urgency level triggers the full-screen takeover. */
  isFullScreen: boolean;
}

export const URGENCY_CONFIG: Record<AlertUrgency, UrgencyConfig> = {
  critical: {
    label: "CRITICAL",
    colour: "#DC2626", // Red-600
    tintColour: "#FEE2E2", // Red-100
    textColour: "#FFFFFF",
    icon: "🚨",
    isFullScreen: true,
  },
  high: {
    label: "HIGH",
    colour: "#EA580C", // Orange-600
    tintColour: "#FFEDD5", // Orange-100
    textColour: "#FFFFFF",
    icon: "⚠️",
    isFullScreen: true,
  },
  medium: {
    label: "MEDIUM",
    colour: "#D97706", // Amber-600
    tintColour: "#FEF3C7", // Amber-100
    textColour: "#FFFFFF",
    icon: "📢",
    isFullScreen: false,
  },
  low: {
    label: "LOW",
    colour: "#2563EB", // Blue-600 (brand primary)
    tintColour: "#DBEAFE", // Blue-100
    textColour: "#FFFFFF",
    icon: "ℹ️",
    isFullScreen: false,
  },
};

/**
 * Returns the config object for a given urgency level.
 * Falls back to LOW config if an unexpected value arrives from the API.
 */
export function getUrgencyConfig(urgency: AlertUrgency): UrgencyConfig {
  return URGENCY_CONFIG[urgency] ?? URGENCY_CONFIG.low;
}
