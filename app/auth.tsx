import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/components/ui/toast";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useRequest } from "@/hooks/use-request";
import { saveToken } from "@/lib/storage";
import { login, getCaptcha } from "@/services/auth";
import { SvgXml } from "react-native-svg";
import { THttpErrorResult } from "@/types";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
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

      if (err?.code === 403) {
        showToast("Email atau password salah", "error");
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
        colors={["#1e90ff", "#ffffff"]}
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
            <Text style={styles.title}>Login to Continue</Text>
            <Text style={styles.subtitle}>
              Enter your email and password to continue
            </Text>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Masukkan email"
                placeholderTextColor="#999"
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
              <Text style={styles.inputLabel}>Password</Text>
              <View style={{ justifyContent: "center" }}>
                <TextInput
                  style={[styles.input, { paddingRight: 50 }]}
                  placeholder="Masukkan password"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  maxLength={128}
                />
                <TouchableOpacity
                  style={{ position: "absolute", right: 16 }}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? "eye" : "eye-off"}
                    size={22}
                    color="#999"
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
                    <ActivityIndicator color="#1e90ff" />
                  ) : captchaSvg ? (
                    <SvgXml xml={captchaSvg} width="100%" height="100%" />
                  ) : (
                    <Text style={{ color: "#999" }}>Gagal memuat</Text>
                  )}
                </View>
                <TouchableOpacity onPress={fetchCaptcha} style={styles.refreshBtn}>
                  <Ionicons name="refresh" size={24} color="#1e90ff" />
                </TouchableOpacity>
              </View>
              <View style={{ justifyContent: "center", marginTop: 10 }}>
                <TextInput
                  style={[styles.input, { paddingLeft: 40 }]}
                  placeholder="Masukkan teks captcha"
                  placeholderTextColor="#999"
                  value={captchaAnswer}
                  onChangeText={setCaptchaAnswer}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color="#999"
                  style={{ position: "absolute", left: 12 }}
                />
              </View>
            </View>

            {/* Remember Me & Forgot Password */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setRememberMe(!rememberMe)}
              >
                <View
                  style={[
                    styles.checkbox,
                    rememberMe && styles.checkboxChecked,
                  ]}
                >
                  {rememberMe && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Remember Me</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={comingSoon}>
                <Text style={styles.forgotPassword}>Forgot password</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonLoading]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? "Loading..." : "Masuk"}
              </Text>
            </TouchableOpacity>

            {/* Register Link */}
            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={comingSoon}>
                <Text style={styles.registerLink}>register here</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Text style={styles.versionText}>Versi {APP_VERSION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
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
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#333",
    backgroundColor: "#fafafa",
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
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
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
    borderColor: "#e0e0e0",
    backgroundColor: "#fafafa",
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
    borderColor: "#ccc",
    borderRadius: 4,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: "#1e90ff",
    borderColor: "#1e90ff",
  },
  checkmark: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#333",
  },
  forgotPassword: {
    fontSize: 14,
    color: "#1e90ff",
  },
  loginButton: {
    backgroundColor: "#1e90ff",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  loginButtonLoading: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerText: {
    fontSize: 14,
    color: "#666",
  },
  registerLink: {
    fontSize: 14,
    color: "#1e90ff",
    fontWeight: "500",
  },
  versionText: {
    textAlign: "center",
    color: "#999",
    marginBottom: 12,
  },
});
