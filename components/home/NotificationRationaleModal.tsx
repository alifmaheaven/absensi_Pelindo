import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface NotificationRationaleModalProps {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export default function NotificationRationaleModal({
  visible,
  onAccept,
  onDismiss,
}: NotificationRationaleModalProps) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="notifications-outline" size={32} color={colors.primary} />
          </View>

          <Text style={styles.title}>Aktifkan Pengingat Shift Kerja</Text>

          <Text style={styles.description}>
            Dapatkan alarm pengingat 30 menit sebelum shift kerja dimulai serta
            informasi pembaruan tiket darurat penting secara tepat waktu.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={onAccept}
            >
              <LinearGradient
                colors={[colors.primaryAction, colors.primaryActionEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientBtn}
              >
                <Text style={styles.primaryText}>Aktifkan Pengingat</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.7}
              onPress={onDismiss}
            >
              <Text style={styles.secondaryText}>Nanti Saja</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors, isDark: boolean = false) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: c.glassSheet,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.glassBorder,
      padding: 24,
      alignItems: "center",
      shadowColor: c.shadowGlass,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
      color: c.textStrong,
      textAlign: "center",
      marginBottom: 10,
    },
    description: {
      fontSize: 13,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: "center",
      marginBottom: 24,
    },
    actions: {
      width: "100%",
      gap: 10,
    },
    primaryButton: {
      width: "100%",
      borderRadius: 14,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 2,
    },
    gradientBtn: {
      minHeight: 48,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.glassOnGradientBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryText: {
      color: c.onGradient,
      fontSize: 14,
      fontWeight: "600",
    },
    secondaryButton: {
      width: "100%",
      minHeight: 48,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.glassBorder,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.glassCardSubtle,
    },
    secondaryText: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: "600",
    },
  });
