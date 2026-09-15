import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { getAttendanceList } from "@/services/attendance";
import { useAuthStore } from "@/stores/auth";
import {
  parseWIBDate,
  calculateAttendanceStatus,
  getOperationalDateWIB,
} from "@/utils/utils";
import {
  IAttendance,
  IMeta,
} from "@/types";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import AttendanceDetailModal from "@/components/attendance/AttendanceDetailModal";
import { ClockOutline, InfoOutlineRounded } from "@/components/icon";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
  const [selectedAttendance, setSelectedAttendance] = useState<IAttendance | null>(null);

  const fetchAttendanceList = async (page: number) => {
    return getAttendanceList({
      page,
      per_page: meta.per_page,
      order_by_desc: ["created_at"],
      include: "shift,site",
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
        return {
          ...prev,
          total: responseMeta?.total || 0,
          page: nextPage,
          total_pages: responseMeta?.total_pages || 0,
        };
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
      const response = await fetchAttendanceList(1);
      const items = response.data?.data || [];
      const responseMeta = response.data?.meta;
      setAttendanceData(items);
      setMeta({
        ...initialMeta,
        total: responseMeta?.total || 0,
        page: 2,
        total_pages: responseMeta?.total_pages || 0,
      });
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
    (async () => {
      await handleGetList();
    })();
  }, []);

  const formatWIB = (s?: string | null) =>
    s
      ? new Intl.DateTimeFormat("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta",
        }).format(parseWIBDate(s) ?? 0)
      : null;

  const handleCardPress = (item: IAttendance) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics safe fallback
    }
    setSelectedAttendance(item);
  };

  // Summary metric counters computed from attendanceData
  const metrics = useMemo(() => {
    let onTime = 0;
    let late = 0;
    let active = 0;
    let completed = 0;

    for (const item of attendanceData) {
      if (!item.checkout) {
        active++;
      } else {
        completed++;
      }

      const opDate = item.checkin ? getOperationalDateWIB(item.checkin) : null;
      const checkinStatus = calculateAttendanceStatus({
        datetime: item.checkin,
        type: "checkin",
        shift: item.shift ?? null,
        shiftDate: opDate,
      });

      if (checkinStatus.state === "ON_TIME") {
        onTime++;
      } else if (checkinStatus.state === "LATE") {
        late++;
      }
    }

    return {
      total: meta.total || attendanceData.length,
      onTime,
      late,
      active,
      completed,
    };
  }, [attendanceData, meta.total]);

  const renderSummaryMetrics = () => {
    if (!attendanceData.length) return null;

    return (
      <View style={styles.metricsWrapper}>
        <Text style={styles.metricsSectionTitle}>Ringkasan Presensi</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsContainer}
        >
          {/* Total */}
          <View style={[styles.metricChip, styles.metricChipPrimary]}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="list-outline" size={13} color={colors.primaryText} />
            </View>
            <View>
              <Text style={styles.metricValuePrimary}>{metrics.total}</Text>
              <Text style={styles.metricLabelPrimary}>Total Absensi</Text>
            </View>
          </View>

          {/* Selesai */}
          <View style={[styles.metricChip, styles.metricChipSuccess]}>
            <View style={styles.metricIconWrap}>
              <Ionicons
                name="checkmark-done-outline"
                size={13}
                color={colors.success}
              />
            </View>
            <View>
              <Text style={styles.metricValueSuccess}>{metrics.completed}</Text>
              <Text style={styles.metricLabelSuccess}>Selesai</Text>
            </View>
          </View>

          {/* Aktif */}
          <View style={[styles.metricChip, styles.metricChipWarning]}>
            <View style={styles.metricIconWrap}>
              <Ionicons
                name="radio-button-on-outline"
                size={13}
                color={colors.warning}
              />
            </View>
            <View>
              <Text style={styles.metricValueWarning}>{metrics.active}</Text>
              <Text style={styles.metricLabelWarning}>Aktif</Text>
            </View>
          </View>

          {/* Tepat Waktu */}
          <View style={[styles.metricChip, styles.metricChipSuccess]}>
            <View style={styles.metricIconWrap}>
              <Ionicons
                name="checkmark-circle-outline"
                size={13}
                color={colors.success}
              />
            </View>
            <View>
              <Text style={styles.metricValueSuccess}>{metrics.onTime}</Text>
              <Text style={styles.metricLabelSuccess}>Tepat Waktu</Text>
            </View>
          </View>

          {/* Terlambat */}
          <View style={[styles.metricChip, styles.metricChipDanger]}>
            <View style={styles.metricIconWrap}>
              <Ionicons
                name="alert-circle-outline"
                size={13}
                color={colors.danger}
              />
            </View>
            <View>
              <Text style={styles.metricValueDanger}>{metrics.late}</Text>
              <Text style={styles.metricLabelDanger}>Terlambat</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderItem = ({ item }: { item: IAttendance }) => {
    const opDate = item.checkin ? getOperationalDateWIB(item.checkin) : null;
    const resolvedShift = item.shift ?? null;
    const checkinStatus = calculateAttendanceStatus({
      datetime: item.checkin,
      type: "checkin",
      shift: resolvedShift,
      shiftDate: opDate,
    });

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => handleCardPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`Presensi ${item.code || ""}, ketuk untuk melihat detail`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardCode}>{item.code || "-"}</Text>
            {item.site?.name ? (
              <View style={styles.siteHeaderPill}>
                <Ionicons name="location-outline" size={11} color={colors.textSecondary} />
                <Text style={styles.siteHeaderText} numberOfLines={1}>
                  {item.site.name}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cardHeaderRight}>
            <StatusBadge
              label={item.checkout ? "Selesai" : "Aktif"}
              tone={item.checkout ? "success" : "primary"}
              size="small"
            />
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
              style={styles.chevronIcon}
            />
          </View>
        </View>

        {item.shift ? (
          <View style={styles.shiftPillBadge}>
            <Ionicons
              name="briefcase-outline"
              size={12}
              color={colors.primaryText}
            />
            <Text style={styles.shiftPillText}>
              {item.shift.name} • {item.shift.start_time.slice(0, 5)} -{" "}
              {item.shift.end_time.slice(0, 5)} WIB
              {item.shift.is_overnight ? " [Lintas Hari]" : ""}
            </Text>
          </View>
        ) : (
          <View style={[styles.shiftPillBadge, styles.neutralShiftPillBadge]}>
            <Ionicons
              name="briefcase-outline"
              size={12}
              color={colors.textSecondary}
            />
            <Text style={styles.neutralShiftPillText}>
              Dinas Terbuka (Non-Shift)
            </Text>
          </View>
        )}

        <View style={styles.cardBody}>
          <View style={styles.timeRow}>
            <View style={styles.timeBlock}>
              <View style={styles.timeBlockHeader}>
                <Ionicons
                  name="log-in-outline"
                  size={14}
                  color={colors.success}
                />
                <Text style={styles.timeLabel}>Check In</Text>
              </View>
              <Text style={styles.timeValue}>
                {formatWIB(item.checkin) || "-"}
              </Text>
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
                <Ionicons
                  name="log-out-outline"
                  size={14}
                  color={colors.danger}
                />
                <Text style={styles.timeLabel}>Check Out</Text>
              </View>
              <Text style={styles.timeValue}>
                {formatWIB(item.checkout) || "-"}
              </Text>
            </View>
          </View>

          {item.description ? (
            <Text style={styles.desc} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.cardFooterLeft}>
            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
            <Text style={styles.footerText}>{formatWIB(item.created_at)}</Text>
          </View>
          <View style={styles.cardFooterRight}>
            <Text style={styles.detailHintText}>Lihat Detail</Text>
            <Ionicons
              name="chevron-forward-circle-outline"
              size={13}
              color={colors.primary}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
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
            ListHeaderComponent={renderSummaryMetrics}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              attendanceData.length === 0
                ? {
                    flexGrow: 1,
                    justifyContent: "center",
                    paddingBottom: 36,
                  }
                : { paddingBottom: 36 }
            }
            onEndReached={handleGetList}
            onEndReachedThreshold={0.5}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            ListFooterComponent={
              loading && attendanceData.length ? (
                <View style={styles.loadingFooter}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              !loading ? (
                isError ? (
                  <EmptyState
                    title="Gagal Memuat Riwayat Absensi"
                    description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
                    actionLabel="Coba Lagi"
                    onAction={handleRefresh}
                    icon={
                      <InfoOutlineRounded
                        color={colors.danger}
                        width={36}
                        height={36}
                      />
                    }
                  />
                ) : (
                  <EmptyState
                    title="Belum Ada Riwayat Absensi"
                    description="Lakukan check in untuk memulai pencatatan kehadiran kerja Anda."
                    actionLabel="Muat Ulang"
                    onAction={handleRefresh}
                    icon={
                      <ClockOutline
                        color={colors.primary}
                        width={36}
                        height={36}
                      />
                    }
                  />
                )
              ) : null
            }
          />
        )}
      </View>

      {/* Attendance Detail Modal */}
      <AttendanceDetailModal
        visible={!!selectedAttendance}
        attendance={selectedAttendance}
        onClose={() => setSelectedAttendance(null)}
      />
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerGradient: { height: 140, paddingBottom: 30 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    headerTitle: { fontSize: 18, fontWeight: "600", color: c.onGradient },
    content: {
      flex: 1,
      backgroundColor: c.primarySoft,
      marginTop: -20,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    metricsWrapper: {
      marginBottom: 14,
    },
    metricsSectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.textStrong,
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    metricsContainer: {
      flexDirection: "row",
      gap: 8,
      paddingBottom: 4,
    },
    metricChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 12,
      borderWidth: 1,
    },
    metricIconWrap: {
      justifyContent: "center",
      alignItems: "center",
    },
    metricChipPrimary: {
      backgroundColor: c.card,
      borderColor: c.primary,
    },
    metricValuePrimary: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    metricLabelPrimary: {
      fontSize: 10,
      fontWeight: "600",
      color: c.primaryText,
    },
    metricChipSuccess: {
      backgroundColor: c.card,
      borderColor: c.success,
    },
    metricValueSuccess: {
      fontSize: 13,
      fontWeight: "700",
      color: c.success,
    },
    metricLabelSuccess: {
      fontSize: 10,
      fontWeight: "600",
      color: c.successText,
    },
    metricChipWarning: {
      backgroundColor: c.card,
      borderColor: c.warning,
    },
    metricValueWarning: {
      fontSize: 13,
      fontWeight: "700",
      color: c.warning,
    },
    metricLabelWarning: {
      fontSize: 10,
      fontWeight: "600",
      color: c.warning,
    },
    metricChipDanger: {
      backgroundColor: c.card,
      borderColor: c.danger,
    },
    metricValueDanger: {
      fontSize: 13,
      fontWeight: "700",
      color: c.danger,
    },
    metricLabelDanger: {
      fontSize: 10,
      fontWeight: "600",
      color: c.danger,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    cardHeaderLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    cardHeaderRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    cardCode: { fontSize: 14, fontWeight: "700", color: c.textStrong },
    siteHeaderPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: c.surface,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
      maxWidth: 150,
    },
    siteHeaderText: {
      fontSize: 10,
      color: c.textSecondary,
      fontWeight: "500",
    },
    chevronIcon: {
      marginLeft: 2,
    },
    shiftPillBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: c.primarySoft,
      borderColor: c.borderStrong,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginBottom: 8,
      gap: 4,
    },
    shiftPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.primaryText,
    },
    neutralShiftPillBadge: {
      backgroundColor: c.surface,
    },
    neutralShiftPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textSecondary,
    },
    cardBody: { marginBottom: 8 },
    timeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    timeBlock: { flex: 1, gap: 2 },
    timeLabel: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    timeValue: { fontSize: 13, color: c.text, fontWeight: "500" },
    timeDivider: {
      width: 1,
      height: "100%",
      backgroundColor: c.border,
      marginHorizontal: 12,
    },
    desc: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 8,
      marginTop: 2,
    },
    cardFooterLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    cardFooterRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    footerText: { fontSize: 11, color: c.textMuted },
    detailHintText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.primary,
    },
    loadingFooter: { paddingVertical: 20, alignItems: "center" },
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
