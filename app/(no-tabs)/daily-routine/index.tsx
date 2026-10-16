import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, CheckRounded, ClockOutline, InfoOutlineRounded } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { getTodayRoutines, startDailyRoutineLog, mapDailyRoutineError } from "@/services/dailyRoutine";
import { ITodayRoutinesAllResponse, ITodayRoutineResponse } from "@/types";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState, useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RoutineProgressCard from "@/components/daily-routine/RoutineProgressCard";
import RoutineListSkeleton from "@/components/daily-routine/RoutineListSkeleton";
import { formatRoutineFrequency } from "@/utils/dailyRoutineHelpers";

interface IErrorState {
  type: "not_checked_in" | "not_found" | "forbidden" | "network_or_server";
  title: string;
  message: string;
}

export default function DailyRoutineListScreen() {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingRoutineId, setStartingRoutineId] = useState<string | null>(null);
  const [data, setData] = useState<ITodayRoutinesAllResponse | null>(null);
  const [errorState, setErrorState] = useState<IErrorState | null>(null);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorState(null);

      const res = await getTodayRoutines();
      setData(res.data);
    } catch (error: any) {
      setData(null);
      const code =
        error?.code ??
        error?.response?.status ??
        error?.status ??
        (typeof error?.code === "number" ? error.code : 0);

      const rawMsg =
        (typeof error === "string" ? error : null) ||
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "";
      const lowerMsg = String(rawMsg).toLowerCase();

      if (
        code === 400 ||
        lowerMsg.includes("not checked in") ||
        lowerMsg.includes("haven't checked in") ||
        lowerMsg.includes("have not checked in") ||
        lowerMsg.includes("check in") ||
        lowerMsg.includes("checked in") ||
        lowerMsg.includes("belum check in") ||
        lowerMsg.includes("belum check-in")
      ) {
        setErrorState({
          type: "not_checked_in",
          title: "Belum Melakukan Check In",
          message: "Anda belum check-in hari ini.",
        });
      } else if (
        code === 404 ||
        lowerMsg.includes("daily routine not found") ||
        lowerMsg.includes("daily_routine not found") ||
        (lowerMsg.includes("routine") && lowerMsg.includes("not found")) ||
        (lowerMsg.includes("routine") && lowerMsg.includes("tidak ditemukan"))
      ) {
        setErrorState({
          type: "not_found",
          title: "Routine Tidak Tersedia",
          message:
            "Routine tidak tersedia untuk site check-in Anda. Pastikan Anda check-in di site yang benar.",
        });
      } else if (
        code === 403 ||
        lowerMsg.includes("forbidden") ||
        lowerMsg.includes("unauthorized") ||
        lowerMsg.includes("access denied") ||
        lowerMsg.includes("permission") ||
        lowerMsg.includes("akses ditolak") ||
        lowerMsg.includes("tidak memiliki izin")
      ) {
        setErrorState({
          type: "forbidden",
          title: "Akses Ditolak",
          message: "Anda tidak memiliki izin untuk memulai routine ini.",
        });
      } else {
        setErrorState({
          type: "network_or_server",
          title: code === 0 ? "Koneksi Bermasalah" : "Terjadi Kesalahan Server",
          message: mapDailyRoutineError(
            error,
            "Gagal memuat data Daily Routine. Silakan periksa jaringan internet Anda dan coba lagi."
          ),
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const handleNavigateDetail = async (item: ITodayRoutineResponse) => {
    if (!item?.routine) return;

    // If log doesn't exist yet, start one
    if (!item?.log) {
      try {
        setStartingRoutineId(item.routine.id);
        await startDailyRoutineLog(item.routine.id);
      } catch (error: any) {
        showToast(
          mapDailyRoutineError(error, "Gagal memulai daily routine"),
          "error"
        );
        return;
      } finally {
        setStartingRoutineId(null);
      }
    }

    router.push(`/(no-tabs)/daily-routine/${item.routine.id}`);
  };

  const handleHeaderBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primaryAction, colors.primaryActionEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleHeaderBack}
              style={styles.backButton}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <ArrowLeft color={colors.onGradient} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Daily Routine</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.card}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            colors={[colors.primary]}
            tintColor={colors.refreshTint}
          />
        }
      >
        {loading ? (
          <RoutineListSkeleton />
        ) : (
          <View>
            {/* Kartu Progress Tugas Hari Ini (RPT-1: 123 §5 / FR-RPT-DR-07) */}
            <RoutineProgressCard
              routines={data?.routines}
              errorType={errorState?.type}
              errorMessage={errorState?.message}
              onRefresh={() => fetchData(true)}
              onCheckIn={() => router.push("/(no-tabs)/checkin")}
            />

            {/* Jika ada routines, render daftar kartu rutinitas individual */}
            {data?.routines && data.routines.length > 0 && (
              <View>
            {data.routines.map((item, index) => {
              if (!item?.routine) return null;
              const routine = item.routine;
              const isStarting = startingRoutineId === routine.id;
              const isCompleted = item.log?.status === "completed";
              const isInProgress = item.log?.status === "in_progress";
              const isPending = !item.log;

              const totalItems =
                routine.device_items?.length || routine.items?.length || 0;
              const checkedItems = (item.log_items || []).filter(
                (li) => li.is_checked
              ).length;

              const isWeekly = routine.frequency === "weekly";
              const frequencyBadgeText = formatRoutineFrequency(
                routine.frequency,
                routine.work_days
              );

              return (
                <View key={routine.id || index} style={styles.routineCard}>
                  <View style={styles.routineHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.frequencyBadge,
                            isWeekly
                              ? styles.frequencyBadgeWeekly
                              : styles.frequencyBadgeDaily,
                          ]}
                        >
                          <Text
                            style={[
                              styles.frequencyBadgeText,
                              isWeekly
                                ? styles.frequencyBadgeWeeklyText
                                : styles.frequencyBadgeDailyText,
                            ]}
                          >
                            {frequencyBadgeText}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.routineName} numberOfLines={2}>
                        {routine.name}
                      </Text>
                    </View>
                    {isCompleted && (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedBadgeText}>Selesai</Text>
                      </View>
                    )}
                    {isInProgress && (
                      <View style={styles.inProgressBadge}>
                        <Text style={styles.inProgressBadgeText}>In Progress</Text>
                      </View>
                    )}
                    {isPending && (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>Belum</Text>
                      </View>
                    )}
                  </View>

                  {routine.description ? (
                    <Text style={styles.routineDescription}>{routine.description}</Text>
                  ) : null}

                  <View style={styles.itemCountRow}>
                    <Text style={styles.itemCountLabel}>Checklist Items</Text>
                    <Text style={styles.itemCountValue}>{totalItems}</Text>
                  </View>

                  {(item.log_items?.length > 0 || isInProgress || isCompleted) && (
                    <View style={styles.progressRow}>
                      <Text style={styles.progressLabel}>Progress</Text>
                      <Text
                        style={[
                          styles.progressValue,
                          isCompleted && { color: colors.success },
                        ]}
                      >
                        {checkedItems}/{totalItems}
                      </Text>
                    </View>
                  )}

                  <View style={{ marginTop: 16 }}>
                    {isCompleted ? (
                      <TouchableOpacity
                        style={styles.viewButton}
                        onPress={() => handleNavigateDetail(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.viewButtonText}>Lihat Detail</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.startButton,
                          isStarting && { opacity: 0.7 },
                        ]}
                        onPress={() => handleNavigateDetail(item)}
                        disabled={isStarting}
                        activeOpacity={0.8}
                      >
                        {isStarting ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.onGradient}
                            style={{ marginRight: 8 }}
                          />
                        ) : null}
                        <Text style={styles.startButtonText}>
                          {isStarting
                            ? "Memulai..."
                            : isInProgress
                            ? "Lanjutkan"
                            : "Mulai Daily Routine"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors, isDark: boolean = false) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    headerGradient: {
      height: 140,
      paddingBottom: 30,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
      color: c.onGradient,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.glassOnGradient,
      borderWidth: 1,
      borderColor: c.glassOnGradientBorder,
      justifyContent: "center",
      alignItems: "center",
    },
    card: {
      flex: 1,
      backgroundColor: c.background,
      marginTop: -20,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderTopColor: c.glassSheetBorder,
    },
    routineCard: {
      backgroundColor: c.glassCard,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.glassBorder,
      shadowColor: c.shadowGlass,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    routineHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    frequencyBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    frequencyBadgeText: {
      fontSize: 11,
      fontWeight: "600",
    },
    frequencyBadgeDaily: {
      backgroundColor: c.glassChip,
      borderColor: c.glassBorder,
    },
    frequencyBadgeDailyText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textSecondary,
    },
    frequencyBadgeWeekly: {
      backgroundColor: c.accentPill,
      borderColor: c.accentPillBorder,
    },
    frequencyBadgeWeeklyText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.primary,
    },
    routineName: {
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: c.textStrong,
      lineHeight: 22,
    },
    routineDescription: {
      fontSize: 13,
      color: c.textSecondary,
      marginBottom: 14,
      lineHeight: 19,
    },
    itemCountRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.glassBorderSubtle,
    },
    itemCountLabel: {
      fontSize: 13,
      color: c.textSecondary,
    },
    itemCountValue: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textStrong,
      fontVariant: ["tabular-nums"],
    },
    progressRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.glassBorderSubtle,
    },
    progressLabel: {
      fontSize: 13,
      color: c.textSecondary,
    },
    progressValue: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
      fontVariant: ["tabular-nums"],
    },
    completedBadge: {
      backgroundColor: c.successSoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.success,
    },
    completedBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.successText,
    },
    inProgressBadge: {
      backgroundColor: c.accentPill,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.accentPillBorder,
    },
    inProgressBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.primary,
    },
    pendingBadge: {
      backgroundColor: c.warningSoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.warningBorder,
    },
    pendingBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.warningText,
    },
    startButton: {
      backgroundColor: c.successAction,
      minHeight: 48,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.glassOnGradientBorder,
      shadowColor: c.success,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    startButtonText: {
      color: c.onGradient,
      fontSize: 15,
      fontWeight: "700",
    },
    viewButton: {
      backgroundColor: c.primaryAction,
      minHeight: 48,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.glassOnGradientBorder,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
      alignItems: "center",
      justifyContent: "center",
    },
    viewButtonText: {
      color: c.onGradient,
      fontSize: 15,
      fontWeight: "700",
    },
  });
