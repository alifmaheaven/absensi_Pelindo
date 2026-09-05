import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { CheckRounded, ClockOutline, InfoOutlineRounded } from "@/components/icon";
import { ITodayRoutineResponse } from "@/types";

export interface RoutineProgressCardProps {
  routines?: ITodayRoutineResponse[] | null;
  errorType?: "not_checked_in" | "not_found" | "forbidden" | "network_or_server" | null;
  errorMessage?: string | null;
  onRefresh?: () => void;
  onCheckIn?: () => void;
  style?: ViewStyle;
}

export interface IRoutineProgressSummary {
  totalRoutines: number;
  completedRoutines: number;
  inProgressRoutines: number;
  unstartedRoutines: number;
  completionPercentage: number;
  totalChecklistItems: number;
  checkedChecklistItems: number;
  checklistPercentage: number;
}

/**
 * Helper untuk memformat tanggal ke format kanonik Indonesia "DD MMM" (mis. "05 Sep").
 * Berjalan stabil di engine Hermes dengan zona waktu Asia/Jakarta.
 */
export function formatDDMMM(dateInput?: Date | string | null): string {
  let d: Date;
  if (!dateInput) {
    d = new Date();
  } else if (typeof dateInput === "string") {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      d = new Date(
        parseInt(match[1], 10),
        parseInt(match[2], 10) - 1,
        parseInt(match[3], 10)
      );
    } else {
      d = new Date(dateInput);
    }
  } else {
    d = dateInput;
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const monthsID = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const day =
      parts.find((p) => p.type === "day")?.value ||
      String(d.getDate()).padStart(2, "0");
    const monthIndex =
      parseInt(parts.find((p) => p.type === "month")?.value || "1", 10) - 1;
    return `${day} ${monthsID[monthIndex] || "Jan"}`;
  } catch {
    const day = String(d.getDate()).padStart(2, "0");
    return `${day} ${monthsID[d.getMonth()] || "Jan"}`;
  }
}

/**
 * Menghitung metrik agregasi routine teknisi dari data getTodayAll yang sudah dimuat.
 * Zero network roundtrip — murni komputasi sisi klien (ADDENDUM §4).
 */
export function calculateRoutineProgress(
  routines?: ITodayRoutineResponse[] | null
): IRoutineProgressSummary {
  if (!routines || routines.length === 0) {
    return {
      totalRoutines: 0,
      completedRoutines: 0,
      inProgressRoutines: 0,
      unstartedRoutines: 0,
      completionPercentage: 0,
      totalChecklistItems: 0,
      checkedChecklistItems: 0,
      checklistPercentage: 0,
    };
  }

  const validList = routines.filter((r) => !!r?.routine);
  const total = validList.length;

  let completed = 0;
  let inProgress = 0;
  let unstarted = 0;

  let totalItems = 0;
  let checkedItems = 0;

  for (const item of validList) {
    const status = item.log?.status;
    if (status === "completed") {
      completed++;
    } else if (status === "in_progress") {
      inProgress++;
    } else {
      unstarted++;
    }

    const routine = item.routine!;
    const itemsCount =
      routine.device_items && routine.device_items.length > 0
        ? routine.device_items.length
        : routine.items && routine.items.length > 0
        ? routine.items.length
        : 0;

    totalItems += itemsCount;

    const checked = (item.log_items || []).filter((li) => li.is_checked).length;
    checkedItems += checked;
  }

  const completionPercentage =
    total > 0 ? Math.round((completed / total) * 100) : 0;
  const checklistPercentage =
    totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  return {
    totalRoutines: total,
    completedRoutines: completed,
    inProgressRoutines: inProgress,
    unstartedRoutines: unstarted,
    completionPercentage,
    totalChecklistItems: totalItems,
    checkedChecklistItems: checkedItems,
    checklistPercentage,
  };
}

export default function RoutineProgressCard({
  routines,
  errorType,
  errorMessage,
  onRefresh,
  onCheckIn,
  style,
}: RoutineProgressCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const summary = useMemo(() => calculateRoutineProgress(routines), [routines]);
  const dateStr = useMemo(() => {
    // Gunakan tanggal log pertama bila tersedia, atau tanggal hari ini
    const logDate = routines?.find((r) => r.log?.date)?.log?.date;
    return formatDDMMM(logDate);
  }, [routines]);

  // 1. State: Belum Check-In Presensi (123 §5.4.1)
  if (errorType === "not_checked_in") {
    return (
      <View style={[styles.card, styles.warningCard, style]}>
        <View style={styles.headerRow}>
          <View style={styles.warningIconWrapper}>
            <ClockOutline width={20} height={20} color={colors.warning} />
          </View>
          <Text style={styles.warningHeaderTitle}>Presensi Belum Tercatat</Text>
        </View>
        <Text style={styles.warningMessageText}>
          Anda belum melakukan check-in hari ini. Lakukan check-in presensi terlebih dahulu untuk mengakses checklist tugas harian.
        </Text>
        {onCheckIn ? (
          <TouchableOpacity
            style={styles.checkInButton}
            activeOpacity={0.8}
            onPress={onCheckIn}
          >
            <Text style={styles.checkInButtonText}>Check In Sekarang</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // 2. State: Error Jaringan / Server / Forbidden (123 §5.4.3)
  if (errorType) {
    return (
      <View style={[styles.card, styles.errorCard, style]}>
        <View style={styles.headerRow}>
          <View style={styles.errorIconWrapper}>
            <InfoOutlineRounded width={20} height={20} color={colors.danger} />
          </View>
          <Text style={styles.errorHeaderTitle}>Gagal Memuat Progress</Text>
        </View>
        <Text style={styles.errorMessageText}>
          {errorMessage || "Gagal memuat data Daily Routine. Silakan periksa jaringan internet Anda dan coba lagi."}
        </Text>
        {onRefresh ? (
          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.8}
            onPress={onRefresh}
          >
            <Text style={styles.retryButtonText}>Muat Ulang</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // 3. State: Site Tanpa Routine Aktif (123 §5.4.2)
  if (summary.totalRoutines === 0) {
    return (
      <View style={[styles.card, style]}>
        <View style={styles.headerRow}>
          <View style={styles.labelContainer}>
            <View style={styles.iconCheckWrapper}>
              <CheckRounded width={14} height={14} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>PROGRESS TUGAS HARI INI</Text>
          </View>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        <View style={styles.emptyContent}>
          <View style={styles.successIconWrapper}>
            <CheckRounded width={24} height={24} color={colors.success} />
          </View>
          <Text style={styles.neutralMessageText}>
            Tidak ada penugasan routine untuk site Anda hari ini. Selamat bertugas!
          </Text>
          {onRefresh ? (
            <TouchableOpacity
              style={styles.neutralRefreshButton}
              activeOpacity={0.7}
              onPress={onRefresh}
            >
              <Text style={styles.neutralRefreshButtonText}>Muat Ulang</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  // 4. Normal State: Ada Routine Hari Ini (123 §5.2)
  const isAllCompleted =
    summary.totalRoutines > 0 &&
    summary.completedRoutines === summary.totalRoutines;
  const progressRatio =
    summary.totalRoutines > 0
      ? summary.completedRoutines / summary.totalRoutines
      : 0;
  const progressWidthPercent = `${Math.min(
    Math.max(progressRatio * 100, 0),
    100
  )}%` as const;

  return (
    <View style={[styles.card, style]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.labelContainer}>
          <View style={styles.iconCheckWrapper}>
            <CheckRounded width={14} height={14} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>PROGRESS TUGAS HARI INI</Text>
        </View>
        <Text style={styles.dateText}>{dateStr}</Text>
      </View>

      {/* Selesai & Persentase Tuntas */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryCountText}>
          {summary.completedRoutines} dari {summary.totalRoutines} Selesai
        </Text>
        <Text
          style={[
            styles.summaryPercentageText,
            isAllCompleted && { color: colors.success },
          ]}
        >
          ( {summary.completionPercentage}% TUNTAS )
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            { width: progressWidthPercent },
            isAllCompleted && { backgroundColor: colors.success },
          ]}
        />
      </View>

      {/* Rincian: Sedang Dikerjakan & Belum Dimulai */}
      <View style={styles.detailRow}>
        <View style={styles.detailItem}>
          <View
            style={[styles.statusDot, { backgroundColor: colors.primary }]}
          />
          <Text style={styles.detailText}>
            {summary.inProgressRoutines} Sedang Dikerjakan
          </Text>
        </View>
        <View style={styles.detailItem}>
          <View
            style={[styles.statusDot, { backgroundColor: colors.warning }]}
          />
          <Text style={styles.detailText}>
            {summary.unstartedRoutines} Belum Dimulai
          </Text>
        </View>
      </View>

      {/* Total Checklist Terpenuhi (bila tersedia) */}
      {summary.totalChecklistItems > 0 && (
        <View style={styles.checklistRow}>
          <Text style={styles.checklistText}>
            Total Checklist Terpenuhi:{" "}
            <Text style={styles.checklistValue}>
              {summary.checkedChecklistItems} / {summary.totalChecklistItems}{" "}
              Item ({summary.checklistPercentage}%)
            </Text>
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 4,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    labelContainer: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: 8,
    },
    iconCheckWrapper: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.textStrong,
      letterSpacing: 0.3,
    },
    dateText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textSecondary,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 10,
    },
    summaryCountText: {
      fontSize: 16,
      fontWeight: "700",
      color: c.textStrong,
    },
    summaryPercentageText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    progressBarTrack: {
      height: 8,
      backgroundColor: c.surface,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    progressBarFill: {
      height: "100%",
      backgroundColor: c.primary,
      borderRadius: 4,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    detailItem: {
      flexDirection: "row",
      alignItems: "center",
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    detailText: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: "500",
    },
    checklistRow: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 10,
      marginTop: 8,
    },
    checklistText: {
      fontSize: 12.5,
      color: c.textSecondary,
    },
    checklistValue: {
      fontWeight: "600",
      color: c.textStrong,
    },

    // Warning / Belum Check-in State
    warningCard: {
      backgroundColor: c.warningSoft,
      borderColor: c.warning,
    },
    warningIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(245, 158, 11, 0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    warningHeaderTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.warning,
      flex: 1,
    },
    warningMessageText: {
      fontSize: 13,
      color: c.text,
      lineHeight: 19,
      marginBottom: 16,
    },
    checkInButton: {
      backgroundColor: c.warning,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
    },
    checkInButtonText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },

    // Error State
    errorCard: {
      borderColor: c.danger,
    },
    errorIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.dangerSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    errorHeaderTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.danger,
      flex: 1,
    },
    errorMessageText: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 19,
      marginBottom: 16,
    },
    retryButton: {
      borderWidth: 1,
      borderColor: c.primary,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
    },
    retryButtonText: {
      color: c.primary,
      fontSize: 13,
      fontWeight: "600",
    },

    // Empty State (Site Tanpa Routine)
    emptyContent: {
      alignItems: "center",
      paddingVertical: 12,
    },
    successIconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.successSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    neutralMessageText: {
      fontSize: 13,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 19,
      marginBottom: 12,
      paddingHorizontal: 8,
    },
    neutralRefreshButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    neutralRefreshButtonText: {
      color: c.primary,
      fontSize: 12,
      fontWeight: "600",
    },
  });
