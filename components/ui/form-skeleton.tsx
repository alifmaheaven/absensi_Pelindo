import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

const SkeletonBlock = ({ width, height, style }: { width?: number | string; height?: number | string; style?: any }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width ?? "100%", height: height ?? 16, opacity, borderRadius: 8 },
        styles.block,
        style,
      ]}
    />
  );
};

export function FormSkeleton() {
  return (
    <View style={styles.container}>
      {/* Map placeholder */}
      <View style={styles.mapPlaceholder}>
        <SkeletonBlock height="100%" />
      </View>

      {/* Section title placeholder */}
      <SkeletonBlock width="40%" height={18} style={{ marginTop: 20, marginBottom: 12 }} />

      {/* Site selector placeholders (3 rows) */}
      {[1, 2, 3].map((i) => (
        <SkeletonBlock
          key={i}
          height={56}
          style={{ marginBottom: 8, borderRadius: 12 }}
        />
      ))}

      {/* Notes placeholder */}
      <SkeletonBlock width="30%" height={16} style={{ marginTop: 16, marginBottom: 8 }} />
      <SkeletonBlock height={44} style={{ borderRadius: 12, marginBottom: 16 }} />

      {/* Image upload section placeholder */}
      <SkeletonBlock height={80} style={{ borderRadius: 12, marginBottom: 12 }} />

      {/* Submit button placeholder */}
      <SkeletonBlock height={50} style={{ borderRadius: 25, marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  block: {
    backgroundColor: "#e2e8f0",
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
  },
});
