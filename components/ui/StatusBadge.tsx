import React, { useMemo } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";

export type StatusBadgeTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export interface StatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
  icon?: React.ReactNode;
  size?: "small" | "medium";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export default function StatusBadge({
  label,
  tone = "neutral",
  icon,
  size = "medium",
  style,
  textStyle,
}: StatusBadgeProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const toneStyle = useMemo(() => {
    switch (tone) {
      case "success":
        return {
          backgroundColor: colors.successSoft,
          borderColor: colors.success,
          color: colors.success,
        };
      case "warning":
        return {
          backgroundColor: colors.warningSoft,
          borderColor: colors.warning,
          color: colors.warning,
        };
      case "danger":
        return {
          backgroundColor: colors.dangerSoft,
          borderColor: colors.danger,
          color: colors.danger,
        };
      case "info":
        return {
          backgroundColor: colors.primarySoft,
          borderColor: colors.primary,
          color: colors.primary,
        };
      case "primary":
        return {
          backgroundColor: colors.primarySoft,
          borderColor: colors.primary,
          color: colors.primary,
        };
      case "neutral":
      default:
        return {
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          color: colors.textSecondary,
        };
    }
  }, [tone, colors]);

  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSmall : styles.badgeMedium,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
        style,
      ]}
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text
        style={[
          styles.text,
          isSmall ? styles.textSmall : styles.textMedium,
          { color: toneStyle.color },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 6,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    badgeSmall: {
      paddingVertical: 2,
      paddingHorizontal: 6,
      gap: 4,
    },
    badgeMedium: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      gap: 5,
    },
    iconContainer: {
      justifyContent: "center",
      alignItems: "center",
    },
    text: {
      fontWeight: "700",
    },
    textSmall: {
      fontSize: 11,
      lineHeight: 14,
    },
    textMedium: {
      fontSize: 12,
      lineHeight: 16,
    },
  });
