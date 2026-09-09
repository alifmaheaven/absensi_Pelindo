import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface EarlyCheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmCheckout: () => void;
  shiftName: string;
  shiftEndTime: string;
  currentTime: string;
  deficitText?: string;
}

export default function EarlyCheckoutModal({
  visible,
  onClose,
  onConfirmCheckout,
  shiftName,
  shiftEndTime,
  currentTime,
  deficitText,
}: EarlyCheckoutModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [visible]);

  const computedDeficit = useMemo(() => {
    if (deficitText) return deficitText;
    try {
      const [eh, em] = shiftEndTime.slice(0, 5).split(":").map(Number);
      const [ch, cm] = currentTime.slice(0, 5).split(":").map(Number);
      let diffMin = (eh * 60 + em) - (ch * 60 + cm);
      if (diffMin < 0) diffMin += 24 * 60;
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      if (h > 0 && m > 0) return `${h} Jam ${m} Menit Lebih Cepat`;
      if (h > 0) return `${h} Jam Lebih Cepat`;
      return `${m} Menit Lebih Cepat`;
    } catch {
      return "Lebih Cepat Dari Jadwal";
    }
  }, [deficitText, shiftEndTime, currentTime]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
              {/* Handle Bar */}
              <View style={styles.handleBar} />

              {/* Amber Clock Icon in warningSoft circle */}
              <View style={styles.iconCircle}>
                <Ionicons name="time-outline" size={32} color={colors.warning} />
              </View>

              {/* Title */}
              <Text style={styles.title}>Pulang Lebih Awal?</Text>

              {/* Subtitle */}
              <Text style={styles.subtitle}>
                Jadwal <Text style={styles.highlightText}>{shiftName}</Text> Anda berakhir pukul{" "}
                <Text style={styles.highlightText}>{shiftEndTime.slice(0, 5)} WIB</Text>.
                {"\n"}Waktu saat ini pukul{" "}
                <Text style={styles.highlightText}>{currentTime.slice(0, 5)} WIB</Text>.
              </Text>

              {/* Time Deficit Card */}
              <View style={styles.deficitCard}>
                <Text style={styles.deficitLabel}>Selisih Waktu Kerja</Text>
                <Text style={styles.deficitValue}>{computedDeficit}</Text>
              </View>

              {/* Consequences Note */}
              <View style={styles.noteBox}>
                <Ionicons name="warning-outline" size={16} color={colors.warning} style={styles.noteIcon} />
                <Text style={styles.noteText}>
                  Kepulangan lebih awal akan tercatat pada riwayat kehadiran dan
                  mungkin memerlukan verifikasi atau persetujuan atasan.
                </Text>
              </View>

              {/* Buttons */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.85}
                  onPress={onClose}
                >
                  <LinearGradient
                    colors={[colors.primary, "#0052cc"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientBtn}
                  >
                    <Text style={styles.primaryText}>Lanjut Bertugas</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.8}
                  onPress={onConfirmCheckout}
                >
                  <Text style={styles.secondaryText}>Ya, Check Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      paddingHorizontal: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 10,
    },
    handleBar: {
      width: 44,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: c.borderStrong,
      marginBottom: 20,
    },
    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: c.warningSoft,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: c.textStrong,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 21,
      color: c.textSecondary,
      textAlign: "center",
      marginBottom: 16,
    },
    highlightText: {
      fontWeight: "600",
      color: c.textStrong,
    },
    deficitCard: {
      width: "100%",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: "center",
      marginBottom: 14,
    },
    deficitLabel: {
      fontSize: 12,
      color: c.textSecondary,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    deficitValue: {
      fontSize: 18,
      fontWeight: "700",
      color: c.warning,
    },
    noteBox: {
      width: "100%",
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: c.warningSoft,
      borderRadius: 10,
      padding: 12,
      marginBottom: 20,
    },
    noteIcon: {
      marginRight: 8,
      marginTop: 2,
    },
    noteText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: c.textSecondary,
    },
    actions: {
      width: "100%",
      gap: 12,
    },
    primaryButton: {
      width: "100%",
      borderRadius: 12,
      overflow: "hidden",
    },
    gradientBtn: {
      minHeight: 48,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryText: {
      color: c.onGradient,
      fontSize: 15,
      fontWeight: "600",
    },
    secondaryButton: {
      width: "100%",
      minHeight: 48,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
      borderColor: c.danger,
      borderWidth: 1.5,
    },
    secondaryText: {
      color: c.danger,
      fontSize: 15,
      fontWeight: "600",
    },
  });
