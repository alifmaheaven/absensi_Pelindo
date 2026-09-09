import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Insets,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";

export interface InteractiveButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  hitSlop?: Insets | number;
}

export default function InteractiveButton({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
  textStyle,
  hitSlop = { top: 12, bottom: 12, left: 12, right: 12 },
}: InteractiveButtonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handlePress = () => {
    if (disabled || loading) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // safe fallback on unsupported hardware
    }
    onPress();
  };

  const variantStyles = useMemo(() => {
    switch (variant) {
      case "secondary":
        return {
          container: styles.btnSecondary,
          text: styles.btnSecondaryText,
          indicatorColor: colors.textStrong,
        };
      case "danger":
        return {
          container: styles.btnDanger,
          text: styles.btnDangerText,
          indicatorColor: colors.onGradient,
        };
      case "outline":
        return {
          container: styles.btnOutline,
          text: styles.btnOutlineText,
          indicatorColor: colors.primary,
        };
      case "primary":
      default:
        return {
          container: styles.btnPrimary,
          text: styles.btnPrimaryText,
          indicatorColor: colors.onGradient,
        };
    }
  }, [variant, styles, colors]);

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.baseButton,
        fullWidth && styles.fullWidth,
        variantStyles.container,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.75}
      disabled={isDisabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles.indicatorColor} />
      ) : (
        <View style={styles.contentRow}>
          {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
          <Text style={[styles.baseText, variantStyles.text, textStyle]}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    baseButton: {
      minHeight: 48,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    fullWidth: {
      width: "100%",
    },
    contentRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    iconContainer: {
      justifyContent: "center",
      alignItems: "center",
    },
    baseText: {
      fontSize: 15,
      fontWeight: "600",
      textAlign: "center",
    },
    disabled: {
      opacity: 0.5,
    },
    // Variants
    btnPrimary: {
      backgroundColor: c.primary,
    },
    btnPrimaryText: {
      color: c.onGradient,
    },
    btnSecondary: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    btnSecondaryText: {
      color: c.textStrong,
    },
    btnDanger: {
      backgroundColor: c.danger,
    },
    btnDangerText: {
      color: c.onGradient,
    },
    btnOutline: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    btnOutlineText: {
      color: c.primary,
    },
  });
