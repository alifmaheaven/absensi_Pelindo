import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, CheckRounded } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { getTodayRoutine } from "@/services/dailyRoutine";
import { ITodayRoutineResponse, IDailyRoutine, IDailyRoutineLog } from "@/types";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState , useMemo } from "react";
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

export default function DailyRoutineListScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<ITodayRoutineResponse | null>(null);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await getTodayRoutine();
      setData(res.data);
    } catch (error: any) {
      if (error?.message?.includes("not checked in")) {
        // Show toast if not checked in
        showToast("Anda belum check in", "info");
      }
      setData(null);
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

  const handleNavigateDetail = async () => {
    if (!data?.routine) return;

    // If log doesn't exist yet, start one
    if (!data?.log) {
      try {
        const { startDailyRoutineLog } = await import("@/services/dailyRoutine");
        await startDailyRoutineLog(data.routine.id);
      } catch (error: any) {
        showToast(error?.message || error?.response?.data?.message || "Gagal memulai daily routine", "error");
        return;
      }
    }

    router.push(`/(no-tabs)/daily-routine/${data.routine.id}`);
  };

  if (loading) {
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
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace("/(tabs)");
                }}
                style={styles.backButton}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <ArrowLeft color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Daily Routine</Text>
              <View style={{ width: 60 }} />
            </View>
          </SafeAreaView>
        </LinearGradient>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        </View>
      </View>
    );
  }

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
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/(tabs)");
              }}
              style={styles.backButton}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <ArrowLeft color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Daily Routine</Text>
            <View style={{ width: 60 }} />
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
        {!data?.routine ? (
          <EmptyState
            title="Tidak Ada Daily Routine"
            description="Tidak ada penugasan checklist daily routine untuk site Anda hari ini."
            actionLabel="Muat Ulang"
            onAction={() => fetchData(true)}
            icon={<CheckRounded color={colors.primary} width={36} height={36} />}
          />
        ) : (
          // Routine exists
          <View>
            {/* Routine Info Card */}
            <View style={styles.routineCard}>
              <View style={styles.routineHeader}>
                <Text style={styles.routineName}>{data.routine.name}</Text>
                {data.log?.status === "completed" && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Selesai</Text>
                  </View>
                )}
                {data.log?.status === "in_progress" && (
                  <View style={styles.inProgressBadge}>
                    <Text style={styles.inProgressBadgeText}>In Progress</Text>
                  </View>
                )}
              </View>

              {data.routine.description ? (
                <Text style={styles.routineDescription}>{data.routine.description}</Text>
              ) : null}

              {/* Checklist count: per-device items if device exists, else template items */}
              <View style={styles.itemCountRow}>
                <Text style={styles.itemCountLabel}>Checklist Items</Text>
                <Text style={styles.itemCountValue}>
                  {data.routine?.device_items?.length || data.routine?.items?.length || 0}
                </Text>
              </View>

              {data.log_items?.length > 0 && (
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>Progress</Text>
                  <Text style={styles.progressValue}>
                    {(() => {
                      const total = data.routine?.device_items?.length || data.routine?.items?.length || 0;
                      const checked = data.log_items.filter((i) => i.is_checked).length;
                      return `${checked}/${total}`;
                    })()}
                  </Text>
                </View>
              )}
            </View>

            {/* Action Button */}
            {data.log?.status === "completed" ? (
              <TouchableOpacity
                style={styles.viewButton}
                onPress={handleNavigateDetail}
              >
                <Text style={styles.viewButtonText}>Lihat Detail</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.startButton}
                onPress={handleNavigateDetail}
              >
                <Text style={styles.startButtonText}>
                  {data.log ? "Lanjutkan" : "Mulai Daily Routine"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
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
    backgroundColor: c.primarySoft,
    marginTop: -20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: c.text,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  routineCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  routineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  routineName: {
    fontSize: 18,
    fontWeight: "700",
    color: c.textStrong,
    flex: 1,
    marginRight: 8,
  },
  routineDescription: {
    fontSize: 14,
    color: c.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
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
    fontSize: 14,
    color: c.textSecondary,
  },
  itemCountValue: {
    fontSize: 14,
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
    fontSize: 14,
    color: c.textSecondary,
  },
  progressValue: {
    fontSize: 14,
    fontWeight: "600",
    color: c.success,
  },
  completedBadge: {
    backgroundColor: c.successSoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: c.success,
  },
  inProgressBadge: {
    backgroundColor: c.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inProgressBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: c.primary,
  },
  startButton: {
    backgroundColor: c.success,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  startButtonText: {
    color: c.onGradient,
    fontSize: 16,
    fontWeight: "600",
  },
  viewButton: {
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  viewButtonText: {
    color: c.onGradient,
    fontSize: 16,
    fontWeight: "600",
  },
});
