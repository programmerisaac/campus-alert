// src/features/admin/screens/ComposeAlertScreen.tsx
/**
 * Compose Alert Screen — admin sends a new alert.
 *
 * Admin enters a title, body, and optional category.
 * On submit, the backend classifies the message synchronously and returns
 * the urgency level. ClassificationResultModal shows the result.
 */

import { isAxiosError } from "axios";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Alert, AlertCategory } from "@models/Alert";
import { composeAlert } from "../adminRepository";
import { ClassificationResultModal } from "../components/ClassificationResultModal";

const CATEGORIES: { value: AlertCategory; label: string; icon: string }[] = [
  { value: "general", label: "General", icon: "📢" },
  { value: "security", label: "Security", icon: "🛡️" },
  { value: "health", label: "Health", icon: "🏥" },
  { value: "academic", label: "Academic", icon: "🎓" },
];

export const ComposeAlertScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AlertCategory>("general");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultAlert, setResultAlert] = useState<Alert | null>(null);

  const handleSubmit = useCallback(async () => {
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage("Please enter an alert title.");
      return;
    }
    if (body.trim().length < 10) {
      setErrorMessage("Alert body must be at least 10 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const alert = await composeAlert({
        title: title.trim(),
        body: body.trim(),
        category,
      });

      setResultAlert(alert);
      // Reset form after successful submission
      setTitle("");
      setBody("");
      setCategory("general");
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setErrorMessage(detail ?? "Failed to send alert. Please try again.");
      } else {
        setErrorMessage("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [title, body, category]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle}>Compose Alert</Text>
        <Text style={styles.screenSubtitle}>
          Your message will be automatically classified by the AI engine.
        </Text>

        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        {/* Title */}
        <Text style={styles.label}>Alert Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Short title shown in the notification header"
          maxLength={200}
          returnKeyType="next"
          editable={!isLoading}
        />
        <Text style={styles.charCount}>{title.length}/200</Text>

        {/* Body */}
        <Text style={styles.label}>Message Body *</Text>
        <TextInput
          style={[styles.input, styles.bodyInput]}
          value={body}
          onChangeText={setBody}
          placeholder="Full alert message that students will read..."
          multiline
          textAlignVertical="top"
          editable={!isLoading}
        />

        {/* Category chips */}
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => {
            const isSelected = category === cat.value;
            return (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipSelected,
                ]}
                onPress={() => setCategory(cat.value)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextSelected,
                  ]}
                >
                  {cat.icon} {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* AI info banner */}
        <View style={styles.aiInfo}>
          <Text style={styles.aiInfoText}>
            🤖 The XGBoost AI will classify your message as Critical / High /
            Medium / Low. Messages containing keywords like "fire", "evacuate",
            or "lockdown" are instantly classified as Critical.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            isLoading && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitText}>🚀 Send Alert</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ClassificationResultModal
        alert={resultAlert}
        onClose={() => setResultAlert(null)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { padding: 20 },
  screenTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#154bba",
    marginBottom: 4,
  },
  screenSubtitle: { fontSize: 14, color: "#6B7280", marginBottom: 24 },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { color: "#991B1B", fontSize: 14 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6 },
  charCount: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "right",
    marginTop: -10,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  bodyInput: { minHeight: 120 },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  categoryChipSelected: { borderColor: "#154bba", backgroundColor: "#EEF2FF" },
  categoryChipText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  categoryChipTextSelected: { color: "#154bba", fontWeight: "700" },
  aiInfo: {
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  aiInfoText: { fontSize: 13, color: "#3730A3", lineHeight: 19 },
  submitButton: {
    backgroundColor: "#154bba",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
