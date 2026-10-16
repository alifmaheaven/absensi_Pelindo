import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useEffect, useMemo } from "react";
import { useAnimatedValue } from "@/hooks/use-animated-value";
import { Animated, StyleSheet, View } from "react-native";

export default function ScheduleSkeleton({ count = 5 }: { count?: number }) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const animatedValue = useAnimatedValue(0.3);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Animated.View style={[styles.dateBox, { opacity: animatedValue }]} />
          <View style={styles.infoBox}>
            <Animated.View style={[styles.line1, { opacity: animatedValue }]} />
            <Animated.View style={[styles.line2, { opacity: animatedValue }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors, isDark: boolean = false) => StyleSheet.create({
  container: {
    paddingVertical: 0,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.glassCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.glassBorder,
    padding: 16,
    marginBottom: 12,
    shadowColor: c.shadowGlass,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.25 : 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  dateBox: {
    width: 55,
    height: 55,
    borderRadius: 14,
    backgroundColor: c.borderStrong,
  },
  infoBox: {
    flex: 1,
    marginLeft: 14,
  },
  line1: {
    width: "50%",
    height: 16,
    borderRadius: 8,
    backgroundColor: c.borderStrong,
    marginBottom: 8,
  },
  line2: {
    width: "75%",
    height: 12,
    borderRadius: 4,
    backgroundColor: c.surface,
  },
});
