import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";

interface AccessDeniedStateProps {
  title?: string;
  description?: string;
  permissionCode?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: React.ReactNode;
}

// Ikon Perisai Kunci (Shield Lock) SVG
function ShieldLockIcon({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L4 5V11.09C4 16.14 7.41 20.85 12 22C16.59 20.85 20 16.14 20 11.09V5L12 2Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 11V9.5C10 8.4 10.9 7.5 12 7.5C13.1 7.5 14 8.4 14 9.5V11M9 11H15C15.55 11 16 11.45 16 12V15C16 15.55 15.55 16 15 16H9C8.45 16 8 15.55 8 15V12C8 11.45 8.45 11 9 11Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function AccessDeniedState({
  title = "Akses Dibatasi",
  description = "Akun Anda saat ini belum memiliki izin untuk mengakses menu atau data ini. Hubungi administrator jika Anda memerlukan hak akses ini.",
  permissionCode,
  actionLabel = "Kembali ke Beranda",
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  icon,
}: AccessDeniedStateProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [showTechDetail, setShowTechDetail] = useState(false);

  const handlePrimaryPress = () => {
    if (onAction) {
      onAction();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${description}`}
    >
      <View style={styles.iconWrapper}>
        {icon || <ShieldLockIcon color={colors.warning} size={40} />}
      </View>

      <Text
        style={styles.title}
        accessible={true}
        accessibilityRole="header"
      >
        {title}
      </Text>

      <Text style={styles.description}>{description}</Text>

      {/* Detail Izin Sekunder (Accordion) */}
      {permissionCode ? (
        <View style={styles.detailContainer}>
          <TouchableOpacity
            style={styles.detailToggle}
            onPress={() => setShowTechDetail(!showTechDetail)}
            activeOpacity={0.7}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan informasi teknis izin"
          >
            <Text style={styles.detailToggleText}>
              {showTechDetail ? "▾ Sembunyikan Info Teknis" : "▸ Info Teknis Izin"}
            </Text>
          </TouchableOpacity>

          {showTechDetail && (
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Izin Dibutuhkan:</Text>
              <Text style={styles.detailCode}>{permissionCode}</Text>
            </View>
          )}
        </View>
      ) : null}

      {/* Tombol Aksi Utama */}
      <TouchableOpacity
        style={styles.actionButton}
        activeOpacity={0.8}
        onPress={handlePrimaryPress}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <LinearGradient
          colors={[colors.primary, "#0052cc"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientBtn}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Tombol Aksi Sekunder */}
      {secondaryActionLabel && onSecondaryAction ? (
        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.7}
          onPress={onSecondaryAction}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={secondaryActionLabel}
        >
          <Text style={styles.secondaryText}>{secondaryActionLabel}</Text>
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
      paddingHorizontal: 28,
      paddingVertical: 40,
    },
    iconWrapper: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: c.warningSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
      textAlign: "center",
      marginBottom: 8,
    },
    description: {
      fontSize: 13,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 16,
    },
    detailContainer: {
      width: "100%",
      alignItems: "center",
      marginBottom: 20,
    },
    detailToggle: {
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    detailToggleText: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: "500",
    },
    detailBox: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginTop: 6,
      alignItems: "center",
    },
    detailLabel: {
      fontSize: 11,
      color: c.textSecondary,
      marginBottom: 2,
    },
    detailCode: {
      fontSize: 12,
      fontFamily: "monospace",
      color: c.primary,
      fontWeight: "600",
    },
    actionButton: {
      minWidth: 180,
      minHeight: 48,
    },
    gradientBtn: {
      minHeight: 48,
      paddingHorizontal: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    actionText: {
      color: c.onGradient,
      fontSize: 14,
      fontWeight: "600",
    },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: 20,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 10,
    },
    secondaryText: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: "500",
    },
  });
