import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export default function ScheduleSkeleton({ count = 5 }: { count?: number }) {
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

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  dateBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  infoBox: {
    flex: 1,
    marginLeft: 14,
  },
  line1: {
    width: "50%",
    height: 16,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
    marginBottom: 8,
  },
  line2: {
    width: "75%",
    height: 12,
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
  },
});
