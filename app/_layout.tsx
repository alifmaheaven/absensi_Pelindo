import { ToastProvider } from "@/components/ui/toast";
import { getVersionCode, saveVersionCode } from "@/lib/storage";
import { getLatestVersion } from "@/services/version";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Alert, Linking } from "react-native";
import "react-native-reanimated";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  useEffect(() => {
    checkVersion();
  }, []);

  async function checkVersion() {
    try {
      const latest = await getLatestVersion();
      if (!latest?.code) return;

      const storedCode = await getVersionCode();

      if (!storedCode) {
        // First launch — store current version, no popup
        await saveVersionCode(latest.code);
        return;
      }

      if (latest.code !== storedCode) {
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
      }
    } catch {
      // Silently fail — don't block the user if version check fails
    }
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <ToastProvider>
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

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
