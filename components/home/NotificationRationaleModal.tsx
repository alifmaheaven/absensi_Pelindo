import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { Feather } from "@expo/vector-icons";
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
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
            <Feather name="bell" size={32} color={colors.primary} />
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
                colors={[colors.primary, "#0052cc"]}
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

const makeStyles = (c: ThemeColors) =>
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
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.primarySoft,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
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
      borderRadius: 12,
      overflow: "hidden",
    },
    gradientBtn: {
      paddingVertical: 12,
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
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
    },
    secondaryText: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: "500",
    },
  });
