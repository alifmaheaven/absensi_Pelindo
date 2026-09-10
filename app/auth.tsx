import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/components/ui/toast";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useRequest } from "@/hooks/use-request";
import { saveToken } from "@/lib/storage";
import { clearCache } from "@/lib/cache";
import { login, getCaptcha } from "@/services/auth";
import { SvgXml } from "react-native-svg";
import { THttpErrorResult } from "@/types";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState, useEffect , useMemo } from "react";
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

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";

export default function LoginScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);

  const { showToast } = useToast();
  const router = useRouter();
  const { checking } = useAuthGuard("guest");

  const fetchCaptcha = async () => {
    try {
      setLoadingCaptcha(true);
      const res = await getCaptcha();
      if (res?.data) {
        setCaptchaSvg(res.data.svg);
        setCaptchaToken(res.data.token);
      }
    } catch (error) {
      console.error("Failed to fetch captcha", error);
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    // Clear app HTTP cache on entering the login screen so a stale (expired)
    // captcha token can never be reused. Runs only on mount — NOT after login.
    clearCache().catch(() => {});
    fetchCaptcha();
  }, []);

  const { run: loginReq, loading } = useRequest(() =>
    login({ email, password, captcha_token: captchaToken, captcha_answer: captchaAnswer }),
  );

  const handleLogin = async () => {
    // Validasi sederhana
    if (!email || !password) {
      showToast("Mohon isi email dan password", "error");
      return;
    }

    if (!isValidEmail(email)) {
      showToast("Format email tidak valid", "error");
      return;
    }

    if (!captchaAnswer.trim() || !captchaToken) {
      showToast("Silakan isi jawaban captcha terlebih dahulu", "error");
      return;
    }

    try {
      const res = await loginReq();

      if (res.data?.token) {
        await saveToken(res.data.token);
      }

      showToast(`Login berhasil!`, "success");
      router.replace("/(tabs)");
    } catch (error) {
      console.debug("Login failed:", error);

      // Reset captcha
      setCaptchaAnswer("");
      fetchCaptcha();

      const err = error as THttpErrorResult;

      if (err?.code === 403 || err?.code === 400) {
        showToast(
          err?.message || "Email atau password salah",
          "error",
        );
      } else {
        showToast(
          "Terjadi kesalahan pada server. Mohon hubungi Admin dan coba lagi.",
          "error",
        );
      }
    }
  };

  const comingSoon = () => {
    showToast("Fitur lupa password akan segera hadir", "info");
  };

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Gradient */}
      <LinearGradient
        colors={[colors.primary, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGradient}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Login Form Container */}
          <View style={styles.formContainer}>
            <Text style={styles.title}>Masuk ke Akun</Text>
            <Text style={styles.subtitle}>
              Masukkan email dan kata sandi untuk melanjutkan
            </Text>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Masukkan email"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={254}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Kata Sandi</Text>
              <View style={{ justifyContent: "center" }}>
                <TextInput
                  style={[styles.input, { paddingRight: 50 }]}
                  placeholder="Masukkan kata sandi"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  maxLength={128}
                />
                <TouchableOpacity
                  style={{
                    position: "absolute",
                    right: 4,
                    minWidth: 44,
                    minHeight: 44,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  <Ionicons
                    name={showPassword ? "eye" : "eye-off"}
                    size={22}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* SVG Captcha */}
            <View style={styles.captchaContainer}>
              <Text style={styles.inputLabel}>Verifikasi Keamanan</Text>
              <View style={styles.svgRow}>
                <View style={styles.svgBox}>
                  {loadingCaptcha ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : captchaSvg ? (
                    <SvgXml xml={captchaSvg} width="100%" height="100%" />
                  ) : (
                    <Text style={{ color: colors.textMuted }}>Gagal memuat</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={fetchCaptcha}
                  style={styles.refreshBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Muat ulang captcha"
                >
                  <Ionicons name="refresh" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={{ justifyContent: "center", marginTop: 10 }}>
                <TextInput
                  style={[styles.input, { paddingLeft: 40 }]}
                  placeholder="Masukkan teks captcha"
                  placeholderTextColor={colors.textMuted}
                  value={captchaAnswer}
                  onChangeText={setCaptchaAnswer}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={colors.textMuted}
                  style={{ position: "absolute", left: 12 }}
                />
              </View>
            </View>

            {/* Remember Me & Forgot Password */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setRememberMe(!rememberMe)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View
                  style={[
                    styles.checkbox,
                    rememberMe && styles.checkboxChecked,
                  ]}
                >
                  {rememberMe && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                </View>
                <Text style={styles.checkboxLabel}>Ingat Saya</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={comingSoon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.forgotPassword}>Lupa kata sandi</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <InteractiveButton
              title="Masuk"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.loginButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Text style={styles.versionText}>Versi {APP_VERSION}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },

  headerGradient: {
    height: 180,
    width: "100%",
    position: "absolute",
    top: 0,
    left: 0,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 120,
  },
  formContainer: {
    flex: 1,
    backgroundColor: c.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: c.textStrong,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: c.text,
    marginBottom: 8,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.inputBg,
  },
  captchaContainer: {
    marginBottom: 20,
  },
  svgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  svgBox: {
    flex: 1,
    height: 60,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  refreshBtn: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.inputBg,
    justifyContent: "center",
    alignItems: "center",
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 4,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.card,
  },
  checkboxChecked: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  checkmark: {
    color: c.onGradient,
    fontSize: 12,
    fontWeight: "bold",
  },
  checkboxLabel: {
    fontSize: 14,
    color: c.text,
  },
  forgotPassword: {
    fontSize: 14,
    color: c.primary,
  },
  loginButton: {
    marginBottom: 24,
  },
  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerText: {
    fontSize: 14,
    color: c.textSecondary,
  },
  registerLink: {
    fontSize: 14,
    color: c.primary,
    fontWeight: "500",
  },
  versionText: {
    textAlign: "center",
    color: c.textMuted,
    marginBottom: 12,
  },
});
