import NetworkStatusBar from "@/components/NetworkStatusBar";
import OfflineBanner from "@/components/OfflineBanner";
import { ToastProvider } from "@/components/ui/toast";
import { getLatestVersion } from "@/services/version";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Alert, Linking } from "react-native";
import "react-native-reanimated";
import "../lib/i18n";
import { useColorScheme } from "react-native";
import { lightTheme, darkTheme } from "@/lib/theme";
import { getToken, saveToken } from "@/lib/storage";
import API from "@/lib/axios";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const deviceColorScheme = useColorScheme();
  const isDark = deviceColorScheme === "dark";
  const colorScheme = deviceColorScheme || "light";
  const navTheme = {
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      background: isDark ? darkTheme.background : lightTheme.background,
      card: isDark ? darkTheme.card : lightTheme.card,
      text: isDark ? darkTheme.text : lightTheme.text,
      border: isDark ? darkTheme.border : lightTheme.border,
      primary: isDark ? darkTheme.primary : lightTheme.primary,
    },
  };

  useEffect(() => {
    checkVersion();
    checkTokenExpiry();
  }, []);

  // Proactively refresh token on app launch if it expires within 7 days
  async function checkTokenExpiry() {
    try {
      const token = await getToken();
      if (!token) return;

      // Decode JWT payload (without verification — just to read exp)
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return;

      const payload = JSON.parse(
        decodeURIComponent(
          atob(payloadBase64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        )
      );
      const exp = payload?.exp;
      if (!exp) return;

      const expiresInMs = exp * 1000 - Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      if (expiresInMs < sevenDays) {
        console.debug('[TokenRefresh] Token expires soon, refreshing...');
        const refreshRes = await API.post('/auth/refresh');
        const newToken = refreshRes.data?.data?.token || refreshRes.data?.token;
        if (newToken) {
          await saveToken(newToken);
          console.debug('[TokenRefresh] Token refreshed successfully');
        }
      } else {
        console.debug('[TokenRefresh] Token still valid for', Math.round(expiresInMs / 86400000), 'days');
      }
    } catch (err) {
      console.debug('[TokenRefresh] Token check skipped:', err instanceof Error ? err.message : String(err));
    }
  }

  async function checkVersion() {
    try {
      console.debug("[VersionCheck] Fetching latest version...");
      const latest = await getLatestVersion();
      console.debug("[VersionCheck] Latest:", JSON.stringify(latest));

      if (!latest?.name) {
        console.debug("[VersionCheck] No version name, skipping");
        return;
      }

      const currentNativeVersion = Constants.expoConfig?.version || "1.0.0";
      console.debug("[VersionCheck] Current native version:", currentNativeVersion);

      if (latest.name !== currentNativeVersion) {
        console.debug("[VersionCheck] New version detected, showing alert");
        // Small delay to ensure navigation has settled before showing alert
        setTimeout(() => {
          Alert.alert(
            "Update Available",
            `A new version (${latest.name}) is available. Please update to continue using the app.`,
            [
              { text: "Later", style: "cancel" },
              {
                text: "Download",
                onPress: () => {
                  const url = latest.url;
                  if (url) Linking.openURL(url);
                },
              },
            ]
          );
        }, 1000);
      }
    } catch (err) {
      console.error("[VersionCheck] Error:", JSON.stringify(err));
    }
  }

  return (
    <ThemeProvider value={navTheme}>
      <ToastProvider>
        <NetworkStatusBar />
        <OfflineBanner />
        <Stack>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="(no-tabs)" options={{ headerShown: false }} />

          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
      </ToastProvider>

      <StatusBar style={isDark ? "light" : "dark"} />
    </ThemeProvider>
  );
}
