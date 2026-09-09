import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";

export interface StandardSkeletonProps {
  type?: "card-list" | "form" | "profile-summary";
  count?: number;
  style?: StyleProp<ViewStyle>;
}

export default function StandardSkeleton({
  type = "card-list",
  count = 4,
  style,
}: StandardSkeletonProps) {
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

  if (type === "form") {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.card}>
          <Animated.View
            style={[styles.labelSkeleton, { opacity: animatedValue }]}
          />
          <Animated.View
            style={[styles.inputSkeleton, { opacity: animatedValue }]}
          />

          <Animated.View
            style={[styles.labelSkeleton, { opacity: animatedValue }]}
          />
          <Animated.View
            style={[styles.inputSkeleton, { opacity: animatedValue }]}
          />

          <Animated.View
            style={[styles.labelSkeleton, { opacity: animatedValue }]}
          />
          <Animated.View
            style={[
              styles.inputSkeleton,
              { height: 80, opacity: animatedValue },
            ]}
          />

          <Animated.View
            style={[styles.buttonSkeleton, { opacity: animatedValue }]}
          />
        </View>
      </View>
    );
  }

  if (type === "profile-summary") {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.card}>
          <View style={styles.profileHeaderRow}>
            <Animated.View
              style={[styles.avatarSkeleton, { opacity: animatedValue }]}
            />
            <View style={{ flex: 1, gap: 8 }}>
              <Animated.View
                style={[styles.titleBar, { opacity: animatedValue }]}
              />
              <Animated.View
                style={[
                  styles.descBar,
                  { width: "50%", opacity: animatedValue },
                ]}
              />
            </View>
          </View>
          <View style={styles.chipGridSkeleton}>
            {[1, 2, 3, 4].map((i) => (
              <Animated.View
                key={i}
                style={[styles.chipSkeleton, { opacity: animatedValue }]}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  // default: card-list
  return (
    <View style={[styles.container, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.headerRow}>
            <Animated.View
              style={[styles.badgeSkeleton, { opacity: animatedValue }]}
            />
            <Animated.View
              style={[styles.timeSkeleton, { opacity: animatedValue }]}
            />
          </View>
          <Animated.View
            style={[styles.titleBar, { opacity: animatedValue }]}
          />
          <Animated.View
            style={[styles.descBar, { opacity: animatedValue }]}
          />
          <View style={styles.footerRow}>
            <Animated.View
              style={[styles.metaBar, { opacity: animatedValue }]}
            />
            <Animated.View
              style={[styles.actionSkeleton, { opacity: animatedValue }]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingVertical: 12,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
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
    badgeSkeleton: {
      width: 84,
      height: 22,
      borderRadius: 6,
      backgroundColor: c.borderStrong,
    },
    timeSkeleton: {
      width: 64,
      height: 14,
      borderRadius: 4,
      backgroundColor: c.surface,
    },
    titleBar: {
      width: "72%",
      height: 16,
      borderRadius: 6,
      backgroundColor: c.borderStrong,
      marginBottom: 8,
    },
    descBar: {
      width: "90%",
      height: 12,
      borderRadius: 4,
      backgroundColor: c.surface,
      marginBottom: 12,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 4,
    },
    metaBar: {
      width: 90,
      height: 12,
      borderRadius: 4,
      backgroundColor: c.surface,
    },
    actionSkeleton: {
      width: 70,
      height: 28,
      borderRadius: 8,
      backgroundColor: c.borderStrong,
    },
    // Form styles
    labelSkeleton: {
      width: "35%",
      height: 14,
      borderRadius: 4,
      backgroundColor: c.borderStrong,
      marginBottom: 8,
    },
    inputSkeleton: {
      width: "100%",
      height: 48,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    buttonSkeleton: {
      width: "100%",
      height: 48,
      borderRadius: 12,
      backgroundColor: c.borderStrong,
      marginTop: 8,
    },
    // Profile styles
    profileHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      marginBottom: 16,
    },
    avatarSkeleton: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.borderStrong,
    },
    chipGridSkeleton: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chipSkeleton: {
      flex: 1,
      minWidth: "45%",
      height: 54,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
  });
