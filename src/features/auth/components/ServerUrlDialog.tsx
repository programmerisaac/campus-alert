// src/features/auth/components/ServerUrlDialog.tsx
/**
 * Modal dialog for entering a custom LAN server IP address.
 *
 * Shown when the user taps "Change Server URL" on the login screen.
 * Persists the entered URL via setServerUrl() so all future API calls
 * go to the LAN server instead of the internet-facing URL.
 */

import { setServerUrl } from "@core/api/apiClient";
import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface ServerUrlDialogProps {
  visible: boolean;
  currentUrl: string;
  onClose: () => void;
}

export const ServerUrlDialog: React.FC<ServerUrlDialogProps> = ({
  visible,
  currentUrl,
  onClose,
}) => {
  const [url, setUrl] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = url.trim();

    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setError("URL must start with http:// or https://");
      return;
    }

    await setServerUrl(trimmed);
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Server URL</Text>
          <Text style={styles.description}>
            Enter the LAN IP address of the Django server to use campus Wi-Fi
            delivery when internet is unavailable.
          </Text>

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              setError(null);
            }}
            placeholder="http://192.168.1.100:8000/api/v1"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 8 },
  description: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    marginBottom: 8,
  },
  inputError: { borderColor: "#DC2626" },
  errorText: { fontSize: 13, color: "#DC2626", marginBottom: 8 },
  buttons: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButton: { backgroundColor: "#F3F4F6" },
  saveButton: { backgroundColor: "#154bba" },
  cancelText: { color: "#374151", fontWeight: "600" },
  saveText: { color: "#FFFFFF", fontWeight: "700" },
});
