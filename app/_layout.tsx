import ForceUpdateModal from "@/components/ForceUpdateModal";
import NetworkStatusBar from "@/components/NetworkStatusBar";
import OfflineBanner from "@/components/OfflineBanner";
import { ToastProvider } from "@/components/ui/toast";
import { getLatestVersion } from "@/services/version";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import "../lib/i18n";
import { useColorScheme } from "react-native";
import { lightTheme, darkTheme } from "@/lib/theme";
import { getToken, saveToken } from "@/lib/storage";
import API from "@/lib/axios";

import { startOfflineSync, syncQueuedRequests } from "@/lib/offlineQueue";

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

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersionData, setLatestVersionData] = useState<{
    name?: string;
    url?: string;
    description?: string;
  } | null>(null);

  useEffect(() => {
    checkVersion();
    checkTokenExpiry();
    startOfflineSync();
    syncQueuedRequests();
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
        if (__DEV__) console.debug('[TokenRefresh] Token expires soon, refreshing...');
        const refreshRes = await API.post('/auth/refresh');
        const newToken = refreshRes.data?.data?.token || refreshRes.data?.token;
        if (newToken) {
          await saveToken(newToken);
          if (__DEV__) console.debug('[TokenRefresh] Token refreshed successfully');
        }
      }
    } catch {
      // Token check failed
    }
  }

  async function checkVersion() {
    try {
      if (__DEV__) console.debug("[VersionCheck] Fetching latest version...");
      const latest = await getLatestVersion();
      if (__DEV__) console.debug("[VersionCheck] Latest:", JSON.stringify(latest));

      if (!latest?.name) {
        if (__DEV__) console.debug("[VersionCheck] No version name, skipping");
        return;
      }

      const currentNativeVersion = Constants.expoConfig?.version || "1.0.0";
      if (__DEV__) console.debug("[VersionCheck] Current native version:", currentNativeVersion);

      if (latest.name !== currentNativeVersion) {
        if (__DEV__) console.debug("[VersionCheck] New version detected, showing force update overlay");
        setLatestVersionData({
          name: latest.name,
          url: latest.url,
          description: (latest as any)?.description || "",
        });
        setUpdateAvailable(true);
      }
    } catch (err) {
      if (__DEV__) console.error("[VersionCheck] Error:", JSON.stringify(err));
    }
  }

  const currentNativeVersion = Constants.expoConfig?.version || "1.0.0";

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

        <ForceUpdateModal
          visible={updateAvailable}
          latestVersion={latestVersionData?.name}
          currentVersion={currentNativeVersion}
          updateUrl={latestVersionData?.url}
          description={latestVersionData?.description}
        />
      </ToastProvider>

      <StatusBar style={isDark ? "light" : "dark"} />
    </ThemeProvider>
  );
}
