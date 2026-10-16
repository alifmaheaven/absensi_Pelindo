import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { InfoOutlineRounded } from "../icon";
import { LinearGradient } from "expo-linear-gradient";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  variant?: "empty" | "error";
}

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  variant = "empty",
}: EmptyStateProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isError = variant === "error";

  const resolvedActionLabel = actionLabel || (isError ? "Coba Lagi" : undefined);

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, isError && styles.iconWrapperError]}>
        {icon || (
          <InfoOutlineRounded
            color={isError ? colors.dangerText : colors.primary}
            width={40}
            height={40}
          />
        )}
      </View>
      <Text style={[styles.title, isError && styles.titleError]}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {resolvedActionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.actionButton, isError && styles.outlineBtn]}
          activeOpacity={0.8}
          onPress={onAction}
        >
          {isError ? (
            <Text style={styles.outlineBtnText}>{resolvedActionLabel}</Text>
          ) : (
            <LinearGradient
              colors={[colors.primaryAction, colors.primaryActionEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientBtn}
            >
              <Text style={styles.actionText}>{resolvedActionLabel}</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingVertical: 48,
    },
    iconWrapper: {
      width: 80,
      height: 80,
      borderRadius: 26,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    iconWrapperError: {
      backgroundColor: c.dangerGlass,
      borderColor: c.dangerGlassBorder,
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: c.textStrong,
      textAlign: "center",
      marginBottom: 8,
    },
    titleError: {
      color: c.dangerText,
    },
    description: {
      fontSize: 13,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 20,
    },
    actionButton: {
      minWidth: 140,
    },
    gradientBtn: {
      minHeight: 48,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.glassOnGradientBorder,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 2,
    },
    actionText: {
      color: c.onGradient,
      fontSize: 13,
      fontWeight: "600",
    },
    outlineBtn: {
      minHeight: 48,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.dangerGlassBorder,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.dangerGlass,
    },
    outlineBtnText: {
      color: c.dangerText,
      fontSize: 13,
      fontWeight: "600",
    },
  });
