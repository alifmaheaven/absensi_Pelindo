import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";

export default function RoutineDetailSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Routine Title & Desc */}
      <View style={styles.titleBar} />
      <View style={styles.descBar} />
      <View style={styles.descBarShort} />

      <View style={styles.divider} />

      {/* Tabs placeholder */}
      <View style={styles.tabsRow}>
        <View style={styles.tabItemActive} />
        <View style={styles.tabItem} />
        <View style={styles.tabItem} />
      </View>

      {/* Item cards */}
      {[1, 2, 3].map((k) => (
        <View key={k} style={styles.itemCard}>
          <View style={styles.row}>
            <View style={styles.checkboxBox} />
            <View style={styles.textGroup}>
              <View style={styles.itemTitle} />
              <View style={styles.itemDesc} />
            </View>
          </View>
          <View style={styles.uploadPlaceholder} />
          <View style={styles.inputPlaceholder} />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      padding: 20,
      paddingTop: 25,
      gap: 12,
    },
    titleBar: {
      width: "60%",
      height: 20,
      borderRadius: 6,
      backgroundColor: c.borderStrong,
      marginBottom: 6,
    },
    descBar: {
      width: "90%",
      height: 12,
      borderRadius: 4,
      backgroundColor: c.border,
      marginBottom: 4,
    },
    descBarShort: {
      width: "50%",
      height: 12,
      borderRadius: 4,
      backgroundColor: c.border,
    },
    divider: {
      height: 1,
      backgroundColor: c.glassBorderSubtle,
      marginVertical: 10,
    },
    tabsRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    tabItemActive: {
      width: 90,
      height: 48,
      borderRadius: 14,
      backgroundColor: c.accentPill,
      borderWidth: 1,
      borderColor: c.accentPillBorder,
    },
    tabItem: {
      width: 90,
      height: 48,
      borderRadius: 14,
      backgroundColor: c.glassChip,
    },
    itemCard: {
      backgroundColor: c.glassCard,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.glassBorder,
      padding: 16,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row",
      gap: 12,
      alignItems: "flex-start",
    },
    checkboxBox: {
      width: 24,
      height: 24,
      borderRadius: 8,
      backgroundColor: c.border,
      marginTop: 2,
    },
    textGroup: {
      flex: 1,
      gap: 6,
    },
    itemTitle: {
      width: "70%",
      height: 16,
      borderRadius: 4,
      backgroundColor: c.borderStrong,
    },
    itemDesc: {
      width: "90%",
      height: 12,
      borderRadius: 4,
      backgroundColor: c.border,
    },
    uploadPlaceholder: {
      height: 44,
      borderRadius: 14,
      backgroundColor: c.glassCardSubtle,
      borderWidth: 1,
      borderColor: c.glassBorder,
      marginTop: 12,
      marginLeft: 36,
    },
    inputPlaceholder: {
      height: 40,
      borderRadius: 14,
      backgroundColor: c.glassCardSubtle,
      borderWidth: 1,
      borderColor: c.glassBorder,
      marginTop: 8,
      marginLeft: 36,
    },
  });
