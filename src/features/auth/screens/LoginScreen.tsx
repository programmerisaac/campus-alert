// src/features/auth/screens/LoginScreen.tsx
/**
 * Login Screen — entry point for all users.
 *
 * Features:
 *   - Username + password form with inline validation
 *   - "Change Server URL" link that opens ServerUrlDialog for LAN IP entry
 *   - Error banner for invalid credentials, network errors, etc.
 *   - Loading state prevents double submission
 *
 * On successful login, RootNavigator reads the user role from authStore
 * and renders the correct navigator (StudentNavigator or AdminNavigator).
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

import { apiClient } from "@core/api/apiClient";
import { login } from "../authRepository";
import { ServerUrlDialog } from "../components/ServerUrlDialog";

export const LoginScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showServerDialog, setShowServerDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Form submit ────────────────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    setErrorMessage(null);

    // Client-side validation before hitting the network
    if (!username.trim()) {
      setErrorMessage("Please enter your username.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsLoading(true);

    try {
      await login({ username: username.trim(), password });
      // RootNavigator observes authStore.user and will re-render automatically.
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401) {
          setErrorMessage("Invalid username or password.");
        } else if (status === 423) {
          // django-axes lockout response
          setErrorMessage(
            "Your account has been temporarily locked after too many failed attempts. Try again later.",
          );
        } else if (!err.response) {
          setErrorMessage(
            'Could not connect to the server. Check your network or tap "Change Server URL" to use the campus Wi-Fi address.',
          );
        } else {
          setErrorMessage("Something went wrong. Please try again.");
        }
      } else {
        setErrorMessage("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [username, password]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🔔</Text>
          <Text style={styles.appName}>CampusAlert</Text>
          <Text style={styles.subtitle}>Covenant University</Text>
        </View>

        {/* Error banner */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your username"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            editable={!isLoading}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.loginButton,
              isLoading && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* LAN switch link */}
        <TouchableOpacity
          style={styles.serverLink}
          onPress={() => setShowServerDialog(true)}
        >
          <Text style={styles.serverLinkText}>
            🔧 Change Server URL (LAN mode)
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <ServerUrlDialog
        visible={showServerDialog}
        currentUrl={apiClient.defaults.baseURL ?? ""}
        onClose={() => setShowServerDialog(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { paddingHorizontal: 28, flexGrow: 1 },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 60, marginBottom: 12 },
  appName: { fontSize: 32, fontWeight: "800", color: "#154bba" },
  subtitle: { fontSize: 16, color: "#6B7280", marginTop: 4 },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { color: "#991B1B", fontSize: 14, lineHeight: 20 },
  form: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    marginBottom: 16,
  },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: 52 },
  eyeButton: {
    position: "absolute",
    right: 14,
    top: 14,
  },
  eyeIcon: { fontSize: 20 },
  loginButton: {
    backgroundColor: "#154bba",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  serverLink: {
    alignItems: "center",
    marginTop: 32,
    paddingVertical: 8,
  },
  serverLinkText: { color: "#6B7280", fontSize: 14 },
});
