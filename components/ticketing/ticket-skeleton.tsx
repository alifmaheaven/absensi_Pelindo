import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

export default function TicketSkeleton() {

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.contentContainer}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <SkeletonBox height={22} width="40%" borderRadius={8} />
        <SkeletonBox height={14} width="60%" borderRadius={6} style={{ marginTop: 8 }} />

        <SkeletonDivider />

        {/* Title */}
        <SkeletonLabel />
        <SkeletonInput height={48} />

        {/* Device */}
        <SkeletonLabel />
        <SkeletonInput height={48} />

        {/* Attendance */}
        <SkeletonLabel />
        <SkeletonInput height={48} />

        {/* Severity */}
        <SkeletonLabel />
        <View style={styles.severityRow}>
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBox key={i} height={36} width={60} borderRadius={18} />
          ))}
        </View>

        {/* Description */}
        <SkeletonLabel />
        <SkeletonInput height={100} />

        {/* Upload Image */}
        <SkeletonLabel />
        <View style={styles.imageGrid}>
          {[1, 2, 3].map((i) => (
            <SkeletonBox key={i} height={80} width={80} borderRadius={14} />
          ))}
        </View>

        {/* Upload Button */}
        <SkeletonButton />

        {/* Submit Button */}
        <SkeletonButton height={48} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

/* =======================
   Skeleton Components
======================= */

function SkeletonBox({
  height,
  width = "100%",
  borderRadius = 14,
  style,
}: {
  height: number;
  width?: number | string;
  borderRadius?: number;
  style?: any;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        {
          height,
          width,
          borderRadius,
          backgroundColor: colors.glassChip,
        },
        style,
      ]}
    />
  );
}

function SkeletonLabel() {
  return <SkeletonBox height={14} width="30%" borderRadius={6} style={{ marginBottom: 6 }} />;
}

function SkeletonInput({ height = 48 }: { height?: number }) {
  return <SkeletonBox height={height} style={{ marginBottom: 16 }} />;
}

function SkeletonDivider() {
  const colors = useThemeColors();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.glassBorder,
        marginVertical: 12,
      }}
    />
  );
}

function SkeletonButton({ height = 44 }: { height?: number }) {
  return (
    <SkeletonBox height={height} borderRadius={14} style={{ marginTop: 16 }} />
  );
}

/* =======================
   Styles
======================= */

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  contentContainer: {
    flex: 1,
    backgroundColor: c.background,
    overflow: "hidden",
  },
  scrollContent: {
    padding: 16,
  },
  severityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  imageGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
});
