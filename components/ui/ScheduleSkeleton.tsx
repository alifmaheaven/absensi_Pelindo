import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useEffect, useRef , useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";

export default function ScheduleSkeleton({ count = 5 }: { count?: number }) {
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  dateBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: c.borderStrong,
  },
  infoBox: {
    flex: 1,
    marginLeft: 14,
  },
  line1: {
    width: "50%",
    height: 16,
    borderRadius: 6,
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
