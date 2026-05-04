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
      console.log("[VersionCheck] Fetching latest version...");
      const latest = await getLatestVersion();
      console.log("[VersionCheck] Latest:", JSON.stringify(latest));

      if (!latest?.code) {
        console.log("[VersionCheck] No version code, skipping");
        return;
      }

      const storedCode = await getVersionCode();
      console.log("[VersionCheck] Stored code:", storedCode);

      if (!storedCode) {
        console.log("[VersionCheck] First launch, saving code:", latest.code);
        await saveVersionCode(latest.code);
        return;
      }

      console.log("[VersionCheck] Comparing:", latest.code, "vs", storedCode);

      if (latest.code !== storedCode) {
        console.log("[VersionCheck] New version detected, showing alert");
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
