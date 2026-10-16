import React from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useIsDarkTheme, useThemeColors } from "@/hooks/use-theme-color";

export interface GlassSurfaceProps {
  /** bar: tab bar / toolbar yang melayang di atas konten. */
  variant?: "bar";
  /** Kekuatan blur iOS (1-100). */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Permukaan kaca. iOS memakai blur native lalu lapisan warna tipis dari token
 * tema. Android tidak memakai blur: ia memakai warna token yang lebih pekat
 * (glassBar) supaya teks tetap terbaca di atas konten yang bergulir.
 */
export default function GlassSurface({
  variant = "bar",
  intensity = 60,
  style,
  children,
}: GlassSurfaceProps) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();

  if (Platform.OS !== "ios") {
    return (
      <View
        style={[
          {
            backgroundColor: isDark ? colors.card : "#FFFFFF",
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <BlurView
      tint={isDark ? "dark" : "light"}
      intensity={intensity}
      style={[styles.base, style]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBarBlur }]}
      />
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: { overflow: "hidden" },
});
