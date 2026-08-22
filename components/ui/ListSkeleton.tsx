import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export default function ListSkeleton({ count = 4 }: { count?: number }) {
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

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
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
    backgroundColor: "#e2e8f0",
  },
  time: {
    width: 60,
    height: 12,
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
  },
  title: {
    width: "70%",
    height: 16,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
    marginBottom: 8,
  },
  description: {
    width: "90%",
    height: 12,
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
  },
});
