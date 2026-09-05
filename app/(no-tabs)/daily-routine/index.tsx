import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
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
import EmptyState from "@/components/ui/EmptyState";

interface IErrorState {
  type: "not_checked_in" | "not_found" | "forbidden" | "network_or_server";
  title: string;
  message: string;
}

export default function DailyRoutineListScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        colors={[colors.primary, colors.background]}
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
              <ArrowLeft color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Daily Routine</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.card}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} />
        }
      >
        {loading ? (
          // Skeleton loader (M8 - P2)
          <View style={styles.skeletonContainer}>
            {[1, 2].map((k) => (
              <View key={k} style={styles.skeletonCard}>
                <View style={styles.skeletonHeaderRow}>
                  <View style={styles.skeletonTitleBar} />
                  <View style={styles.skeletonBadge} />
                </View>
                <View style={styles.skeletonDescBar} />
                <View style={styles.skeletonDescBarShort} />
                <View style={styles.skeletonDivider} />
                <View style={styles.skeletonInfoRow}>
                  <View style={styles.skeletonTextSmall} />
                  <View style={styles.skeletonTextSmall} />
                </View>
                <View style={styles.skeletonButton} />
              </View>
            ))}
          </View>
        ) : errorState ? (
          // M4: Dedicated Error States
          errorState.type === "not_checked_in" ? (
            <EmptyState
              title={errorState.title}
              description={errorState.message}
              actionLabel="Check In Sekarang"
              onAction={() => router.push("/(no-tabs)/checkin")}
              icon={<ClockOutline color={colors.warning} width={40} height={40} />}
            />
          ) : errorState.type === "not_found" ? (
            <EmptyState
              title={errorState.title}
              description={errorState.message}
              actionLabel="Muat Ulang"
              onAction={() => fetchData(true)}
              icon={<InfoOutlineRounded color={colors.warning} width={40} height={40} />}
            />
          ) : errorState.type === "forbidden" ? (
            <EmptyState
              title={errorState.title}
              description={errorState.message}
              actionLabel="Kembali"
              onAction={handleHeaderBack}
              icon={<InfoOutlineRounded color={colors.danger} width={40} height={40} />}
            />
          ) : (
            <EmptyState
              title={errorState.title}
              description={errorState.message}
              actionLabel="Coba Lagi"
              onAction={() => fetchData(true)}
              icon={<InfoOutlineRounded color={colors.danger} width={40} height={40} />}
            />
          )
        ) : !data?.routines || data.routines.length === 0 ? (
          // Empty State
          <EmptyState
            title="Tidak Ada Daily Routine"
            description="Tidak ada penugasan checklist daily routine untuk site Anda hari ini."
            actionLabel="Muat Ulang"
            onAction={() => fetchData(true)}
            icon={<CheckRounded color={colors.primary} width={36} height={36} />}
          />
        ) : (
          // M5: Multi-routine cards
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

              return (
                <View key={routine.id || index} style={styles.routineCard}>
                  <View style={styles.routineHeader}>
                    <Text style={styles.routineName} numberOfLines={2}>
                      {routine.name}
                    </Text>
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
                            color="#fff"
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
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    headerGradient: {
      height: 140,
      paddingBottom: 30,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: c.onGradient,
    },
    backButton: {
      padding: 8,
      borderRadius: 20,
    },
    card: {
      flex: 1,
      backgroundColor: c.surface,
      marginTop: -20,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    routineCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    routineHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    routineName: {
      fontSize: 17,
      fontWeight: "700",
      color: c.textStrong,
      flex: 1,
      marginRight: 8,
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
      borderTopColor: c.border,
    },
    itemCountLabel: {
      fontSize: 13,
      color: c.textSecondary,
    },
    itemCountValue: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    progressRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    progressLabel: {
      fontSize: 13,
      color: c.textSecondary,
    },
    progressValue: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    completedBadge: {
      backgroundColor: c.successSoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    completedBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.success,
    },
    inProgressBadge: {
      backgroundColor: c.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
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
      borderRadius: 10,
    },
    pendingBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.warning,
    },
    startButton: {
      backgroundColor: c.success,
      paddingVertical: 14,
      borderRadius: 12,
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
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    viewButtonText: {
      color: c.onGradient,
      fontSize: 15,
      fontWeight: "700",
    },

    // Skeleton styles
    skeletonContainer: {
      gap: 16,
      marginTop: 4,
    },
    skeletonCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    skeletonHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    skeletonTitleBar: {
      width: "55%",
      height: 18,
      borderRadius: 6,
      backgroundColor: c.borderStrong,
    },
    skeletonBadge: {
      width: 60,
      height: 22,
      borderRadius: 10,
      backgroundColor: c.border,
    },
    skeletonDescBar: {
      width: "90%",
      height: 12,
      borderRadius: 4,
      backgroundColor: c.border,
      marginBottom: 6,
    },
    skeletonDescBarShort: {
      width: "60%",
      height: 12,
      borderRadius: 4,
      backgroundColor: c.border,
      marginBottom: 14,
    },
    skeletonDivider: {
      height: 1,
      backgroundColor: c.border,
      marginBottom: 12,
    },
    skeletonInfoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    skeletonTextSmall: {
      width: 80,
      height: 12,
      borderRadius: 4,
      backgroundColor: c.border,
    },
    skeletonButton: {
      height: 48,
      borderRadius: 12,
      backgroundColor: c.borderStrong,
    },
  });
