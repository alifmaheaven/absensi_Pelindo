import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { getAttendanceList } from "@/services/attendance";
import { getTodaySchedule, getWeekSchedule } from "@/services/schedule";
import { useAuthStore } from "@/stores/auth";
import {
  parseWIBDate,
  calculateAttendanceStatus,
  getOperationalDateWIB,
  getTodayDateString,
} from "@/utils/utils";
import {
  IAttendance,
  IMeta,
  Ishift,
} from "@/types";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import { ClockOutline, InfoOutlineRounded } from "@/components/icon";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState , useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const initialMeta: IMeta = {
  page: 1,
  per_page: 10,
  total: 0,
  total_pages: 0,
};

export default function AttendanceTabScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuthStore();
  const [attendanceData, setAttendanceData] = useState<IAttendance[]>([]);
  const [meta, setMeta] = useState<IMeta>(initialMeta);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isError, setIsError] = useState(false);

  const [scheduleMap, setScheduleMap] = useState<Record<string, Ishift>>({});

  const loadSchedules = async () => {
    try {
      const [todayRes, weekRes] = await Promise.allSettled([
        getTodaySchedule(),
        getWeekSchedule(),
      ]);
      const map: Record<string, Ishift> = {};
      if (weekRes.status === "fulfilled" && weekRes.value?.data?.schedules) {
        weekRes.value.data.schedules.forEach((s) => {
          if (s.date && s.shift) {
            map[s.date] = s.shift;
          }
        });
      }
      if (todayRes.status === "fulfilled" && todayRes.value?.data?.shift) {
        const todayStr = getTodayDateString();
        map[todayStr] = todayRes.value.data.shift;
      }
      setScheduleMap(map);
    } catch {
      // Skenario offline/gagal memuat jadwal: tetap lanjut dengan fallback UNKNOWN_SCHEDULE
    }
  };

  const fetchAttendanceList = async (page: number) => {
    return getAttendanceList({
      page,
      per_page: meta.per_page,
      order_by_desc: ["created_at"],
      user_id_exact: [user?.id ?? ""],
    });
  };

  const handleGetList = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setIsError(false);
    try {
      const response = await fetchAttendanceList(meta.page);
      const items = response.data?.data || [];
      const responseMeta = response.data?.meta;

      if (!items.length) {
        setHasMore(false);
        return;
      }

      setAttendanceData((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const filtered = items.filter((i) => !existingIds.has(i.id));
        return [...prev, ...filtered];
      });

      setMeta((prev) => {
        const nextPage = prev.page + 1;
        if (nextPage >= (responseMeta?.total_pages || 0)) setHasMore(false);
        return { ...prev, total: responseMeta?.total || 0, page: nextPage, total_pages: responseMeta?.total_pages || 0 };
      });
    } catch (error) {
      console.error("Failed to fetch attendance:", error);
      if (attendanceData.length === 0) {
        setIsError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setIsError(false);
    try {
      const [response] = await Promise.all([
        fetchAttendanceList(1),
        loadSchedules(),
      ]);
      const items = response.data?.data || [];
      const responseMeta = response.data?.meta;
      setAttendanceData(items);
      setMeta({ ...initialMeta, total: responseMeta?.total || 0, page: 2, total_pages: responseMeta?.total_pages || 0 });
      setHasMore(1 < (responseMeta?.total_pages || 0));
    } catch (error) {
      console.error("Failed to refresh attendance:", error);
      if (attendanceData.length === 0) {
        setIsError(true);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    handleGetList();
    loadSchedules();
  }, []);

  // checkin/checkout/created_at = WIB. Pakai helper timezone-aware
  // (new Date(spasi) engine-dependent di Hermes → jam salah).
  const formatWIB = (s?: string | null) =>
    s ? new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    }).format(parseWIBDate(s) ?? 0) : null;

  const renderItem = ({ item }: { item: IAttendance }) => {
    const opDate = item.checkin ? getOperationalDateWIB(item.checkin) : null;
    const resolvedShift = (item as any).shift || (opDate ? scheduleMap[opDate] : null);
    const checkinStatus = calculateAttendanceStatus({
      datetime: item.checkin,
      type: "checkin",
      shift: resolvedShift,
      shiftDate: opDate,
    });

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardCode}>{item.code || "-"}</Text>
          <StatusBadge
            label={item.checkout ? "Selesai" : "Aktif"}
            tone={item.checkout ? "success" : "primary"}
            size="small"
          />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.timeRow}>
            <View style={styles.timeBlock}>
              <View style={styles.timeBlockHeader}>
                <Ionicons name="log-in-outline" size={14} color={colors.success} />
                <Text style={styles.timeLabel}>Check In</Text>
              </View>
              <Text style={styles.timeValue}>{formatWIB(item.checkin) || "-"}</Text>
              {item.checkin ? (
                <View
                  style={[
                    styles.statusBadgeRow,
                    {
                      backgroundColor:
                        checkinStatus.state === "LATE"
                          ? colors.dangerSoft
                          : checkinStatus.state === "ON_TIME"
                          ? colors.successSoft
                          : colors.surface,
                      borderColor:
                        checkinStatus.state === "LATE"
                          ? colors.danger
                          : checkinStatus.state === "ON_TIME"
                          ? colors.success
                          : colors.borderStrong,
                    },
                  ]}
                  accessibilityRole="text"
                  accessibilityLabel={`Status: ${checkinStatus.displayText}`}
                >
                  <Ionicons
                    name={
                      checkinStatus.state === "LATE"
                        ? "alert-circle-outline"
                        : checkinStatus.state === "ON_TIME"
                        ? "checkmark-circle-outline"
                        : "calendar-outline"
                    }
                    size={11}
                    color={
                      checkinStatus.state === "LATE"
                        ? colors.danger
                        : checkinStatus.state === "ON_TIME"
                        ? colors.success
                        : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color:
                          checkinStatus.state === "LATE"
                            ? colors.danger
                            : checkinStatus.state === "ON_TIME"
                            ? colors.success
                            : colors.textSecondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {checkinStatus.displayText}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeBlock}>
              <View style={styles.timeBlockHeader}>
                <Ionicons name="log-out-outline" size={14} color={colors.danger} />
                <Text style={styles.timeLabel}>Check Out</Text>
              </View>
              <Text style={styles.timeValue}>{formatWIB(item.checkout) || "-"}</Text>
            </View>
          </View>
          {item.description ? (
            <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
          ) : null}
        </View>
        <View style={styles.cardFooter}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
          <Text style={styles.footerText}>{formatWIB(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.primary, colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Riwayat Absensi</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>
      <View style={styles.content}>
        {loading && !attendanceData.length ? (
          <ListSkeleton count={4} />
        ) : (
          <FlatList
            data={attendanceData}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={attendanceData.length === 0 ? { flexGrow: 1, justifyContent: "center", paddingBottom: 24 } : { paddingBottom: 24 }}
            onEndReached={handleGetList}
            onEndReachedThreshold={0.5}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            ListFooterComponent={loading && attendanceData.length ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null}
            ListEmptyComponent={!loading ? (
              isError ? (
                <EmptyState
                  title="Gagal Memuat Riwayat Absensi"
                  description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
                  actionLabel="Coba Lagi"
                  onAction={handleRefresh}
                  icon={<InfoOutlineRounded color={colors.danger} width={36} height={36} />}
                />
              ) : (
                <EmptyState
                  title="Belum Ada Riwayat Absensi"
                  description="Lakukan check in untuk memulai pencatatan kehadiran kerja Anda."
                  actionLabel="Muat Ulang"
                  onAction={handleRefresh}
                  icon={<ClockOutline color={colors.primary} width={36} height={36} />}
                />
              )
            ) : null}
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { height: 140, paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingTop: 10 },
  headerTitle: { fontSize: 18, fontWeight: "600", color: c.onGradient },
  content: { flex: 1, backgroundColor: c.primarySoft, marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  card: { backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: c.border },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardCode: { fontSize: 14, fontWeight: "700", color: c.textStrong },
  cardBody: { marginBottom: 8 },
  timeRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  timeBlock: { flex: 1, gap: 2 },
  timeLabel: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  timeValue: { fontSize: 13, color: c.text, fontWeight: "500" },
  timeDivider: { width: 1, height: "100%", backgroundColor: c.border, marginHorizontal: 12 },
  desc: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 4, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 },
  footerText: { fontSize: 11, color: c.textMuted },
  loadingFooter: { paddingVertical: 20, alignItems: "center" },
  emptyState: { alignItems: "center", justifyContent: "center", padding: 40, marginTop: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: "bold", color: c.text, textAlign: "center", marginBottom: 4 },
  emptySubText: { fontSize: 13, color: c.textMuted, textAlign: "center" },
  timeBlockHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
});
