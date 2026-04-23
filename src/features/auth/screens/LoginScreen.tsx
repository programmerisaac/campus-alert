// src/features/auth/screens/LoginScreen.tsx
/**
 * Login Screen — entry point for ALL users (students and staff).
 *
 * What this screen does:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Collects the user's Covenant University email and password.
 * 2. Validates the email format on the client side before sending to the server.
 *    This saves a network round-trip for obviously wrong input.
 * 3. Sends { email, password } to the Django backend via authRepository.login().
 * 4. On success: authStore saves the JWT tokens + user profile → RootNavigator
 *    reads `user.role` from the store and automatically switches to either
 *    StudentNavigator or AdminNavigator.
 *
 * What we REMOVED vs the original:
 * ─────────────────────────────────────────────────────────────────────────────
 * ✂️  "Change Server URL" button — removed per PRD.
 *    The PRD states the app and Django backend must always run on the same
 *    campus Wi-Fi network. The server URL is fixed at compile time via the
 *    EXPO_PUBLIC_API_BASE_URL environment variable in the .env file.
 *    Users must not need to (and should not) change the server address.
 *
 * ✂️  ServerUrlDialog component — removed because the button is gone.
 *
 * How email domains work:
 * ─────────────────────────────────────────────────────────────────────────────
 * Covenant University has TWO email domains:
 *   • @stu.cu.edu.ng              → student accounts
 *   • @covenantuniversity.edu.ng  → staff/faculty accounts
 *
 * The Django backend auto-detects the role from the email domain during login.
 * The client-side check here gives instant feedback before hitting the network.
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

import { login } from "../authRepository";

export const LoginScreen: React.FC = () => {
  // ── Safe area insets ────────────────────────────────────────────────────────
  // On phones with notches or gesture bars, we add extra padding so the form
  // doesn't sit behind the status bar or system navigation bar.
  const insets = useSafeAreaInsets();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  // isLoading: true while the login API call is in flight.
  // We disable the button and show a spinner during this period to prevent
  // double-submission if the user taps repeatedly on slow Wi-Fi.
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // errorMessage: null when there is no error.
  // Set to a human-readable string on validation failure or API error.
  // Cleared automatically when the user starts typing again.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // showPassword: toggles between secureTextEntry on/off.
  // Default false so the password is hidden by default.
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // ── Client-side email validation ─────────────────────────────────────────────
  /**
   * Returns true only if the email ends with a recognised Covenant University
   * domain. This is a SOFT check — the Django backend performs authoritative
   * validation. This function just gives the user instant feedback before
   * we even hit the network.
   *
   * @param value - The raw email string typed by the user
   */
  const isValidCUEmail = (value: string): boolean => {
    const lower = value.toLowerCase().trim();
    return (
      lower.endsWith("@stu.cu.edu.ng") ||
      lower.endsWith("@covenantuniversity.edu.ng")
    );
  };

  // ── Form submission ───────────────────────────────────────────────────────────
  /**
   * Called when the user taps "Log In" or presses Enter on the password field.
   *
   * Flow:
   * 1. Clear any existing error message
   * 2. Validate email is not empty
   * 3. Validate email is a Covenant University domain
   * 4. Validate password is not empty
   * 5. Call login() from authRepository — this hits POST /api/v1/accounts/login/
   * 6. On success: authStore updates automatically → RootNavigator re-renders
   * 7. On error: parse the error and show a user-friendly message
   *
   * useCallback with [email, password] deps ensures we always capture the
   * latest input values without creating a new function reference on every render.
   */
  const handleLogin = useCallback(async () => {
    // Clear stale error so the UI doesn't show old messages during the new attempt
    setErrorMessage(null);

    // ── Client-side validation (avoids unnecessary API calls) ─────────────────

    if (!email.trim()) {
      setErrorMessage("Please enter your university email address.");
      return;
    }

    if (!isValidCUEmail(email)) {
      // Show both domain formats so users know exactly what to use
      setErrorMessage(
        "Please use your Covenant University email.\n\n" +
          "• Students:  name@stu.cu.edu.ng\n" +
          "• Staff:     name@covenantuniversity.edu.ng",
      );
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    // ── API call ──────────────────────────────────────────────────────────────
    setIsLoading(true);

    try {
      // authRepository.login() sends { email, password } to Django,
      // stores the returned JWT tokens in SecureStore, and updates authStore.
      // Once authStore.user is non-null, RootNavigator automatically renders
      // the correct navigator for the user's role.
      await login({ email: email.trim().toLowerCase(), password });

      // No need to navigate manually — RootNavigator observes authStore
    } catch (err) {
      // ── Error mapping ────────────────────────────────────────────────────────
      // We map HTTP status codes and error shapes to friendly messages.
      // We never show raw Django error objects to users — those are logged
      // to the console for developers only.

      if (isAxiosError(err)) {
        const status = err.response?.status;

        if (!err.response) {
          // No response at all — the request never reached Django.
          // Most common cause: phone and server are not on the same Wi-Fi,
          // or the Django server is not running.
          setErrorMessage(
            "Could not connect to the server.\n\n" +
              "Please check:\n" +
              "• You are connected to the campus Wi-Fi\n" +
              "• The CampusAlert server is running",
          );
        } else if (status === 400) {
          // EmailLoginSerializer returns 400 for wrong email/password.
          // The error comes back as { non_field_errors: ["..."] } or { detail: "..." }
          const detail =
            (err.response.data as Record<string, string[]>)
              ?.non_field_errors?.[0] ??
            (err.response.data as { detail?: string })?.detail ??
            "Invalid email or password.";
          setErrorMessage(detail);
        } else if (status === 401) {
          setErrorMessage("Invalid email or password.");
        } else if (status === 403) {
          // django-axes returns 403 (or 429) when an account is locked
          // after too many failed attempts. AXES_FAILURE_LIMIT is 5 in settings.py.
          setErrorMessage(
            "Your account has been temporarily locked after too many\n" +
              "failed login attempts. Please try again in 15 minutes.",
          );
        } else if (status === 429) {
          // Rate limit hit (REST_FRAMEWORK throttle: anon 20/minute)
          setErrorMessage(
            "Too many login attempts. Please wait a moment and try again.",
          );
        } else {
          // Catch-all for unexpected server errors (500, 502, etc.)
          setErrorMessage(
            `Unexpected server error (${status ?? "unknown"}). Please try again.`,
          );
        }
      } else {
        // Non-Axios error — extremely rare, but log it for debugging
        console.error("[LoginScreen] Unexpected non-Axios error:", err);
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    } finally {
      // Always re-enable the form, whether login succeeded or failed.
      // On success this runs just before the navigator unmounts this screen,
      // which is harmless.
      setIsLoading(false);
    }
  }, [email, password]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    /**
     * KeyboardAvoidingView shifts the content up when the keyboard appears
     * so the focused input is never hidden behind it.
     *
     * iOS: "padding" mode — adds paddingBottom equal to keyboard height
     * Android: undefined — Android handles this natively (windowSoftInputMode)
     */
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            // Dynamic top padding accounts for the status bar height (notch, etc.)
            // We add 40px extra so the logo doesn't sit flush against the bar.
            paddingTop: insets.top + 40,
            // Dynamic bottom padding so the login button is above the gesture bar
            paddingBottom: insets.bottom + 24,
          },
        ]}
        // Tapping anywhere on the scroll view dismisses the keyboard
        // AND registers taps on buttons (both, not just one)
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          {/* Bell emoji: placeholder icon — replace with an <Image> for production */}
          <Text style={styles.logo}>🔔</Text>
          <Text style={styles.appName}>CampusAlert</Text>
          <Text style={styles.subtitle}>Covenant University</Text>
        </View>

        {/* ── Error banner ────────────────────────────────────────────────────── */}
        {/*
         * Only rendered when errorMessage is non-null.
         * Using a conditional render (not opacity/visibility) so the banner
         * takes up zero space when there is no error, keeping the layout compact.
         */}
        {errorMessage !== null && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        {/* ── Form ────────────────────────────────────────────────────────────── */}
        <View style={styles.form}>
          {/* ── Email field ─────────────────────────────────────────────────── */}
          <Text style={styles.label}>University Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              // Clear the error as soon as the user starts correcting their input.
              // This avoids the error banner lingering after the problem is fixed.
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="you@stu.cu.edu.ng"
            placeholderTextColor="#9CA3AF"
            // Prevents iOS from capitalising the first letter of an email
            autoCapitalize="none"
            // Prevents iOS from suggesting misspellings for email text
            autoCorrect={false}
            // Shows the "@" key prominently on the soft keyboard
            keyboardType="email-address"
            // "next" label on the keyboard's return key guides the user to password
            returnKeyType="next"
            // Disabled while loading so the user can't edit during a submission
            editable={!isLoading}
            // Enables iOS password manager to recognise this as an email field
            textContentType="emailAddress"
            // Accessibility label for screen readers
            accessibilityLabel="University email address"
          />

          {/* Domain hint — appears below the email field to remind users */}
          <Text style={styles.hint}>
            Students: @stu.cu.edu.ng · Staff: @covenantuniversity.edu.ng
          </Text>

          {/* ── Password field ──────────────────────────────────────────────── */}
          <Text style={[styles.label, styles.labelSpacing]}>Password</Text>

          {/*
           * The password row is a relative-positioned container so the
           * eye toggle button can be absolutely positioned at the right edge
           * of the input without affecting layout flow.
           */}
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Enter your password"
              placeholderTextColor="#9CA3AF"
              // secureTextEntry hides the characters; toggled by the eye button
              secureTextEntry={!showPassword}
              // "done" closes the keyboard and triggers the login
              returnKeyType="done"
              // Pressing Enter on the password field is the same as tapping Log In
              onSubmitEditing={handleLogin}
              editable={!isLoading}
              textContentType="password"
              accessibilityLabel="Password"
            />

            {/*
             * Eye toggle button — lets the user reveal their password to verify
             * they typed it correctly. Common UX pattern for login forms.
             */}
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((prev) => !prev)}
              // Increase tap target beyond the visible emoji size for accessibility
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={
                showPassword ? "Hide password" : "Show password"
              }
            >
              <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Submit button ────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              // Visually dim the button while loading to signal it's disabled
              isLoading && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
            accessibilityLabel="Log in to CampusAlert"
            accessibilityRole="button"
          >
            {isLoading ? (
              // Spinner replaces button text during the API call
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Footer note ─────────────────────────────────────────────────────── */}
        {/*
         * Simple informational footer.
         * Removed the "Change Server URL" link per PRD — users must not change
         * the server address. The server is fixed to the campus Wi-Fi IP.
         */}

        <Text style={styles.footerNote}>
          Connect to the campus Wi-Fi before logging in.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  container: {
    paddingHorizontal: 28,
    flexGrow: 1, // Allows ScrollView to fill the screen even when content is short
  },

  // ── Brand header ──────────────────────────────────────────────────────────

  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: {
    fontSize: 64,
    marginBottom: 12,
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: "#154bba", // OneHux/CampusAlert primary blue
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 4,
  },

  // ── Error banner ──────────────────────────────────────────────────────────

  errorBanner: {
    backgroundColor: "#FEF2F2", // Light red background
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FECACA", // Slightly darker red border
  },
  errorText: {
    color: "#991B1B", // Dark red text for contrast
    fontSize: 14,
    lineHeight: 22, // Extra line height for multi-line error messages
  },

  // ── Form ──────────────────────────────────────────────────────────────────

  form: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  labelSpacing: {
    // Extra top margin to separate the password section from email section
    marginTop: 14,
  },
  hint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: -8,
    marginBottom: 4,
  },

  // ── Input ─────────────────────────────────────────────────────────────────

  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    marginBottom: 6,
  },

  // ── Password row ──────────────────────────────────────────────────────────

  passwordRow: {
    position: "relative", // Parent for absolute-positioned eye button
  },
  passwordInput: {
    paddingRight: 52, // Reserve space for the eye toggle on the right
    marginBottom: 6,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    top: 14, // Vertically centres with the 14px input padding
  },
  eyeIcon: {
    fontSize: 20,
  },

  // ── Submit button ─────────────────────────────────────────────────────────

  loginButton: {
    backgroundColor: "#154bba",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  loginButtonDisabled: {
    opacity: 0.6, // Visual feedback that the button is inactive
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // ── Footer ────────────────────────────────────────────────────────────────

  footerNote: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 32,
  },
});
