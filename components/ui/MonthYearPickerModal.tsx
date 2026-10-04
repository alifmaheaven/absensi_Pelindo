import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { parseDateParts, todayWIB } from "@/utils/utils";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

interface Props {
  visible: boolean;
  year?: number;
  month?: number; // 1 - 12
  onConfirm: (year: number, month: number) => void;
  onClose: () => void;
  title?: string;
}

export default function MonthYearPickerModal({
  visible,
  year,
  month,
  onConfirm,
  onClose,
  title = "Pilih Bulan & Tahun",
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const currentWIB = parseDateParts(todayWIB());
  const initialYear = year ?? currentWIB.year;
  const initialMonth = month ?? (currentWIB.month + 1);

  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);

  useEffect(() => {
    if (visible) {
      setSelectedYear(year ?? currentWIB.year);
      setSelectedMonth(month ?? (currentWIB.month + 1));
    }
  }, [visible, year, month]);

  const handlePrevYear = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // fallback
    }
    setSelectedYear((y) => y - 1);
  };

  const handleNextYear = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // fallback
    }
    setSelectedYear((y) => y + 1);
  };

  const handleSelectMonth = (mIndex: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // fallback
    }
    setSelectedMonth(mIndex + 1);
  };

  const handleResetCurrent = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // fallback
    }
    setSelectedYear(currentWIB.year);
    setSelectedMonth(currentWIB.month + 1);
  };

  const handleConfirm = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // fallback
    }
    onConfirm(selectedYear, selectedMonth);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.content} activeOpacity={1}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Tutup dialog"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Year Navigator */}
          <View style={styles.yearNavRow}>
            <TouchableOpacity
              onPress={handlePrevYear}
              style={styles.navButton}
              accessibilityLabel="Tahun sebelumnya"
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.yearBadge}>
              <Text style={styles.yearText}>{selectedYear}</Text>
            </View>
            <TouchableOpacity
              onPress={handleNextYear}
              style={styles.navButton}
              accessibilityLabel="Tahun berikutnya"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Month Grid */}
          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((name, index) => {
              const mNum = index + 1;
              const isSelected = selectedMonth === mNum;
              const isCurrent =
                selectedYear === currentWIB.year &&
                mNum === currentWIB.month + 1;

              return (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.monthItem,
                    isSelected && styles.monthItemSelected,
                    !isSelected && isCurrent && styles.monthItemCurrent,
                  ]}
                  onPress={() => handleSelectMonth(index)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.monthItemText,
                      isSelected && styles.monthItemTextSelected,
                      !isSelected && isCurrent && styles.monthItemTextCurrent,
                    ]}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Reset Current Month Shortcut */}
          <TouchableOpacity
            style={styles.currentMonthShortcut}
            onPress={handleResetCurrent}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Text style={styles.currentMonthShortcutText}>
              Bulan Ini ({MONTH_NAMES[currentWIB.month]} {currentWIB.year})
            </Text>
          </TouchableOpacity>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>Terapkan</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
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
      padding: 20,
    },
    content: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 16,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: c.textStrong,
    },
    subtitle: {
      fontSize: 13,
      color: c.primary,
      fontWeight: "600",
      marginTop: 2,
    },
    closeButton: {
      padding: 4,
    },
    yearNavRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    navButton: {
      padding: 8,
      borderRadius: 8,
    },
    yearBadge: {
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    yearText: {
      fontSize: 16,
      fontWeight: "700",
      color: c.textStrong,
    },
    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
    },
    monthItem: {
      width: "31%",
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    monthItemSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    monthItemCurrent: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    monthItemText: {
      fontSize: 12,
      fontWeight: "500",
      color: c.text,
      textAlign: "center",
    },
    monthItemTextSelected: {
      color: c.onGradient,
      fontWeight: "700",
    },
    monthItemTextCurrent: {
      color: c.primary,
      fontWeight: "600",
    },
    currentMonthShortcut: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: c.primarySoft,
    },
    currentMonthShortcutText: {
      fontSize: 12,
      color: c.primary,
      fontWeight: "600",
    },
    actionRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 16,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.textSecondary,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    confirmButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.onGradient,
    },
  });
