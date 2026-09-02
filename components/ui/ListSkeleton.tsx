import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useEffect, useRef , useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";

export default function ListSkeleton({ count = 4 }: { count?: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const animatedValue = useRef(new Animated.Value(0.3)).current;

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
          <View style={styles.headerRow}>
            <Animated.View style={[styles.badge, { opacity: animatedValue }]} />
            <Animated.View style={[styles.time, { opacity: animatedValue }]} />
          </View>
          <Animated.View style={[styles.title, { opacity: animatedValue }]} />
          <Animated.View style={[styles.description, { opacity: animatedValue }]} />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  card: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  badge: {
    width: 80,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.borderStrong,
  },
  time: {
    width: 60,
    height: 12,
    borderRadius: 4,
    backgroundColor: c.surface,
  },
  title: {
    width: "70%",
    height: 16,
    borderRadius: 6,
    backgroundColor: c.borderStrong,
    marginBottom: 8,
  },
  description: {
    width: "90%",
    height: 12,
    borderRadius: 4,
    backgroundColor: c.surface,
  },
});
