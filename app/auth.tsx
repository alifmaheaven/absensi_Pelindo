import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/components/ui/toast";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useRequest } from "@/hooks/use-request";
import { saveToken } from "@/lib/storage";
import { login } from "@/services/auth";
import { THttpErrorResult } from "@/types";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState, useRef, useEffect } from "react";
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
import { WebView } from "react-native-webview";

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [mcaptchaToken, setMcaptchaToken] = useState("");
  const webViewRef = useRef<WebView>(null);
  const { showToast } = useToast();
  const router = useRouter();
  const { checking } = useAuthGuard("guest");

  useEffect(() => {
    if (Platform.OS === "web") {
      const handleMessage = (e: MessageEvent) => {
        if (e.origin !== "https://captcha.vps.prakhya.id") return;
        if (e.data && e.data.token) {
          setMcaptchaToken(e.data.token);
        }
      };

      window.addEventListener("message", handleMessage as EventListener);
      return () => {
        window.removeEventListener("message", handleMessage as EventListener);
      };
    }
  }, []);

  const { run: loginReq, loading } = useRequest(() =>
    login({ email, password, mcaptcha_token: mcaptchaToken }),
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

    if (!mcaptchaToken) {
      showToast("Mohon selesaikan CAPTCHA", "error");
      return;
    }

    try {
      const res = await loginReq();

      if (res.data?.token) {
        saveToken(res.data.token);
      }

      showToast(`Login berhasil! Email: ${email}`, "success");
      router.push("/(tabs)");
    } catch (error) {
      console.log("Login failed:", error);

      // Reset mCaptcha
      setMcaptchaToken("");
      if (Platform.OS !== "web") {
        webViewRef.current?.reload();
      } else {
        // For web, we can force reload by altering state or just let the user click again as iframe handles its own state.
        // Or we could attach a ref to the iframe. For simplicity, we can ignore reloading the iframe directly here 
        // because mCaptcha handles its own refresh button inside the widget.
      }

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

            {/* mCaptcha Widget */}
            <View style={{ height: 80, width: "100%", marginBottom: 15, overflow: "hidden" }}>
              {Platform.OS === "web" ? (
                <iframe
                  src="https://captcha.vps.prakhya.id/widget/?sitekey=xDpgSpCZJQVamuVnJDfmn1mi6rG2BQeR"
                  title="mCaptcha"
                  frameBorder="0"
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              ) : (
                <WebView
                  ref={webViewRef}
                  source={{
                    html: `
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <meta name="viewport" content="width=device-width, initial-scale=1.0">
                          <style>
                            body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
                            iframe { width: 100%; height: 100%; border: none; }
                          </style>
                        </head>
                        <body>
                          <iframe 
                            src="https://captcha.vps.prakhya.id/widget/?sitekey=xDpgSpCZJQVamuVnJDfmn1mi6rG2BQeR"
                            title="mCaptcha"
                            frameborder="0"
                          ></iframe>
                           <script>
                             window.addEventListener("message", function(e) {
                               if (e.data && e.data.token) {
                                 window.ReactNativeWebView.postMessage(e.data.token);
                               }
                             });
                           </script>
                        </body>
                      </html>
                    `
                  }}
                  onMessage={(event) => {
                    setMcaptchaToken(event.nativeEvent.data);
                  }}
                  scrollEnabled={false}
                  style={{ backgroundColor: "transparent" }}
                  showsVerticalScrollIndicator={false}
                  showsHorizontalScrollIndicator={false}
                />
              )}
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
