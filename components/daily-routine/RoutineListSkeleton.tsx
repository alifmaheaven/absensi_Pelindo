import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";

export default function RoutineListSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const animatedValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 0.7,
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
    <View style={styles.skeletonContainer}>
      {/* Skeleton Ringkasan Progress */}
      <View style={[styles.skeletonCard, { marginBottom: 4 }]}>
        <View style={styles.skeletonHeaderRow}>
          <Animated.View
            style={[
              styles.skeletonTitleBar,
              { width: "55%", opacity: animatedValue },
            ]}
          />
          <Animated.View
            style={[
              styles.skeletonTextSmall,
              { width: 50, opacity: animatedValue },
            ]}
          />
        </View>
        <Animated.View
          style={[
            styles.skeletonTitleBar,
            { width: "40%", height: 14, marginBottom: 10, opacity: animatedValue },
          ]}
        />
        <Animated.View
          style={[
            styles.skeletonDescBar,
            { height: 8, borderRadius: 4, marginBottom: 12, opacity: animatedValue },
          ]}
        />
        <View style={styles.skeletonInfoRow}>
          <Animated.View
            style={[styles.skeletonTextSmall, { opacity: animatedValue }]}
          />
          <Animated.View
            style={[styles.skeletonTextSmall, { opacity: animatedValue }]}
          />
        </View>
      </View>

      {[1, 2].map((k) => (
        <View key={k} style={styles.skeletonCard}>
          <View style={styles.skeletonHeaderRow}>
            <Animated.View
              style={[styles.skeletonTitleBar, { opacity: animatedValue }]}
            />
            <Animated.View
              style={[styles.skeletonBadge, { opacity: animatedValue }]}
            />
          </View>
          <Animated.View
            style={[styles.skeletonDescBar, { opacity: animatedValue }]}
          />
          <Animated.View
            style={[styles.skeletonDescBarShort, { opacity: animatedValue }]}
          />
          <View style={styles.skeletonDivider} />
          <View style={styles.skeletonInfoRow}>
            <Animated.View
              style={[styles.skeletonTextSmall, { opacity: animatedValue }]}
            />
            <Animated.View
              style={[styles.skeletonTextSmall, { opacity: animatedValue }]}
            />
          </View>
          <Animated.View
            style={[styles.skeletonButton, { opacity: animatedValue }]}
          />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    skeletonContainer: {
      gap: 12,
    },
    skeletonCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    skeletonHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    skeletonTitleBar: {
      height: 16,
      width: "50%",
      backgroundColor: c.borderStrong,
      borderRadius: 4,
    },
    skeletonBadge: {
      height: 20,
      width: 60,
      backgroundColor: c.borderStrong,
      borderRadius: 6,
    },
    skeletonDescBar: {
      height: 12,
      width: "80%",
      backgroundColor: c.surface,
      borderRadius: 4,
      marginBottom: 6,
    },
    skeletonDescBarShort: {
      height: 12,
      width: "45%",
      backgroundColor: c.surface,
      borderRadius: 4,
      marginBottom: 12,
    },
    skeletonDivider: {
      height: 1,
      backgroundColor: c.border,
      marginBottom: 12,
    },
    skeletonInfoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    skeletonTextSmall: {
      height: 10,
      width: 70,
      backgroundColor: c.surface,
      borderRadius: 3,
    },
    skeletonButton: {
      height: 38,
      backgroundColor: c.borderStrong,
      borderRadius: 10,
      marginTop: 12,
    },
  });
