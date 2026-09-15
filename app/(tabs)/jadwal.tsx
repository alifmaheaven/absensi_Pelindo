import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { getWeekSchedule } from "@/services/schedule";
import { syncShiftNotifications } from "@/services/notification-scheduler";
import type { IWeekScheduleItem } from "@/types";
import { useEffect, useState, useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import ScheduleSkeleton from "@/components/ui/ScheduleSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import ScreenContainer from "@/components/ui/ScreenContainer";
import { Calender } from "@/components/icon";
import { Ionicons } from "@expo/vector-icons";
import { getAccessibleTextColor, parseWIBDate } from "@/utils/utils";

const DAY_ORDER = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_MAP: Record<string, number> = {
  minggu: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
};

export default function JadwalScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [schedules, setSchedules] = useState<IWeekScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);

  const fetchSchedule = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setIsLoading(true);
      setIsError(false);

      const res = await getWeekSchedule();
      const list = res.data?.schedules || [];
      setSchedules(list);
      syncShiftNotifications(list);
    } catch (e) {
      console.error("Failed to fetch schedule:", e);
      setIsError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchSchedule();
    })();
  }, [fetchSchedule]);

  const monthYear = useMemo(() => {
    return new Date().toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
  }, []);

  const activeShiftsCount = useMemo(
    () => schedules.filter((s) => s.has_schedule).length,
    [schedules]
  );
  const offDaysCount = useMemo(
    () => schedules.filter((s) => !s.has_schedule).length,
    [schedules]
  );

  const getDayShortName = useCallback((dayName?: string, dateStr?: string) => {
    if (dayName) {
      const clean = dayName.trim().toLowerCase();
      if (clean in DAY_MAP) {
        return DAY_ORDER[DAY_MAP[clean]];
      }
    }
    if (dateStr) {
      const d = parseWIBDate(dateStr.includes(" ") ? dateStr : `${dateStr} 00:00:00`);
      if (d) return DAY_ORDER[d.getDay()];
    }
    return "";
  }, []);

  const getNextDayShortName = useCallback((dayName?: string, dateStr?: string) => {
    if (dayName) {
      const clean = dayName.trim().toLowerCase();
      if (clean in DAY_MAP) {
        const nextIdx = (DAY_MAP[clean] + 1) % 7;
        return DAY_ORDER[nextIdx];
      }
    }
    if (dateStr) {
      const d = parseWIBDate(dateStr.includes(" ") ? dateStr : `${dateStr} 00:00:00`);
      if (d) {
        d.setDate(d.getDate() + 1);
        return DAY_ORDER[d.getDay()];
      }
    }
    return "";
  }, []);

  return (
    <ScreenContainer
      title="Jadwal Kerja"
      subtitle={monthYear}
      refreshing={refreshing}
      onRefresh={() => fetchSchedule(true)}
    >
      {isLoading ? (
        <ScheduleSkeleton count={7} />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Gagal Memuat Jadwal"
          description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
          actionLabel="Coba Lagi"
          onAction={() => fetchSchedule(true)}
        />
      ) : schedules.length === 0 ? (
        <EmptyState
          title="Belum Ada Penugasan Shift"
          description="Jadwal kerja Anda belum ditetapkan untuk pekan ini. Hubungi supervisor operasional jika ini tidak sesuai."
          actionLabel="Muat Ulang"
          onAction={() => fetchSchedule(true)}
          icon={<Calender color={colors.primary} width={36} height={36} />}
        />
      ) : (
        <>
          {/* Header Summary Banner */}
          <View style={styles.summaryBanner}>
            <View style={styles.summaryHeaderRow}>
              <View style={styles.summaryTitleWrap}>
                <Text style={styles.summaryTitle}>Jadwal Pekan Ini</Text>
                <Text style={styles.summarySubtitle}>
                  {schedules.length} Hari Kerja Terjadwal
                </Text>
              </View>
              <View style={styles.summaryIconWrap}>
                <Calender color={colors.primary} width={22} height={22} />
              </View>
            </View>

            <View style={styles.summaryChipsRow}>
              <View style={styles.summaryChipPrimary}>
                <Ionicons name="briefcase-outline" size={14} color={colors.primaryText} />
                <Text style={styles.summaryChipPrimaryText}>
                  {activeShiftsCount} Shift Aktif
                </Text>
              </View>
              <View style={styles.summaryChipNeutral}>
                <Ionicons name="cafe-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.summaryChipNeutralText}>
                  {offDaysCount} Hari Libur
                </Text>
              </View>
            </View>
          </View>

          {/* Section Header */}
          <Text style={styles.sectionTitle}>Daftar Hari</Text>

          {/* Day Cards */}
          {schedules.map((item, index) => {
            const dateNum = item.date ? item.date.split("-")[2] : "--";
            const isOvernight = Boolean(item.has_schedule && item.shift?.is_overnight);
            const curDayShort = getDayShortName(item.day_name, item.date);
            const nextDayShort = getNextDayShortName(item.day_name, item.date);

            const shiftColor = item.shift?.color || colors.primary;
            const accessibleColor = getAccessibleTextColor(shiftColor);

            const timeRangeText = item.has_schedule
              ? isOvernight
                ? `${item.shift!.start_time.slice(0, 5)} (${curDayShort}) — ${item.shift!.end_time.slice(0, 5)} (${nextDayShort}) WIB`
                : `${item.shift!.start_time.slice(0, 5)} — ${item.shift!.end_time.slice(0, 5)} WIB`
              : "Tidak ada jadwal shift";

            if (item.has_schedule) {
              return (
                <View
                  key={item.date || index}
                  style={[
                    styles.scheduleCard,
                    item.is_today && styles.todayCard,
                  ]}
                >
                  {item.is_today && <View style={styles.todayIndicatorBar} />}

                  {/* Date Box */}
                  <View
                    style={[
                      styles.dateBox,
                      { backgroundColor: item.is_today ? colors.primary : shiftColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateNumber,
                        { color: item.is_today ? colors.onGradient : accessibleColor },
                      ]}
                    >
                      {dateNum}
                    </Text>
                    <Text
                      style={[
                        styles.dayName,
                        { color: item.is_today ? colors.onGradient : accessibleColor },
                      ]}
                    >
                      {item.day_name}
                    </Text>
                  </View>

                  {/* Shift Information */}
                  <View style={styles.scheduleInfo}>
                    <View style={styles.shiftHeaderRow}>
                      <View style={styles.shiftNameWithColor}>
                        <View
                          style={[
                            styles.shiftColorDot,
                            { backgroundColor: shiftColor },
                          ]}
                        />
                        <Text style={styles.shiftLabel} numberOfLines={1}>
                          {item.shift!.name}
                        </Text>
                      </View>
                      {item.is_today && (
                        <View style={styles.todayBadge}>
                          <Ionicons
                            name="flash"
                            size={10}
                            color={colors.onGradient}
                            style={{ marginRight: 3 }}
                          />
                          <Text style={styles.todayBadgeText}>HARI INI</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.timeRow}>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.timeText}>{timeRangeText}</Text>
                    </View>

                    {isOvernight && (
                      <View style={styles.overnightBadge}>
                        <Ionicons
                          name="moon"
                          size={11}
                          color={colors.primaryText}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.overnightBadgeText}>
                          Lintas Hari (+1)
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            }

            // Off-Day ("Libur")
            return (
              <View
                key={item.date || index}
                style={[
                  styles.scheduleCard,
                  styles.offDayCard,
                  item.is_today && styles.todayCard,
                ]}
              >
                {item.is_today && <View style={styles.todayIndicatorBar} />}

                {/* Date Box */}
                <View
                  style={[
                    styles.dateBox,
                    styles.offDayDateBox,
                    item.is_today && styles.todayOffDayDateBox,
                  ]}
                >
                  <Text
                    style={[
                      styles.dateNumber,
                      { color: item.is_today ? colors.primaryText : colors.textMuted },
                    ]}
                  >
                    {dateNum}
                  </Text>
                  <Text
                    style={[
                      styles.dayName,
                      { color: item.is_today ? colors.primaryText : colors.textMuted },
                    ]}
                  >
                    {item.day_name}
                  </Text>
                </View>

                {/* Off-Day Info */}
                <View style={styles.scheduleInfo}>
                  <View style={styles.shiftHeaderRow}>
                    <View style={styles.shiftNameWithColor}>
                      <Ionicons
                        name="cafe-outline"
                        size={16}
                        color={colors.textMuted}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.offDayTitle}>Libur</Text>
                    </View>
                    {item.is_today && (
                      <View style={styles.todayBadge}>
                        <Ionicons
                          name="flash"
                          size={10}
                          color={colors.onGradient}
                          style={{ marginRight: 3 }}
                        />
                        <Text style={styles.todayBadgeText}>HARI INI</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.offDayHelperText}>
                    Tidak Ada Penugasan Shift / Hari Libur
                  </Text>
                </View>

                {/* Off-Day Badge */}
                <View style={styles.offDayBadge}>
                  <Text style={styles.offDayBadgeText}>Libur</Text>
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    summaryBanner: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    summaryHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    summaryTitleWrap: {
      flex: 1,
    },
    summaryTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: c.textStrong,
      marginBottom: 2,
    },
    summarySubtitle: {
      fontSize: 13,
      color: c.textSecondary,
    },
    summaryIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 12,
    },
    summaryChipsRow: {
      flexDirection: "row",
      gap: 10,
    },
    summaryChipPrimary: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: c.primarySoft,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    summaryChipPrimaryText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.primaryText,
    },
    summaryChipNeutral: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    summaryChipNeutralText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textSecondary,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.textStrong,
      marginBottom: 12,
    },
    scheduleCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
      position: "relative",
      overflow: "hidden",
    },
    todayCard: {
      borderWidth: 2,
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    todayIndicatorBar: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: c.primary,
    },
    dateBox: {
      width: 58,
      height: 58,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    dateNumber: {
      fontSize: 22,
      fontWeight: "800",
      lineHeight: 26,
    },
    dayName: {
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    scheduleInfo: {
      flex: 1,
    },
    shiftHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    shiftNameWithColor: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flex: 1,
      marginRight: 6,
    },
    shiftColorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    shiftLabel: {
      fontSize: 15,
      fontWeight: "700",
      color: c.textStrong,
      flexShrink: 1,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 2,
    },
    timeText: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: "500",
    },
    overnightBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.primary,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: "flex-start",
      marginTop: 6,
    },
    overnightBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.primaryText,
    },
    todayBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    todayBadgeText: {
      fontSize: 10,
      color: c.onGradient,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    // Off-Day ("Libur") specific styles
    offDayCard: {
      backgroundColor: c.card,
    },
    offDayDateBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    todayOffDayDateBox: {
      backgroundColor: c.card,
      borderColor: c.primary,
    },
    offDayTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: c.textSecondary,
    },
    offDayHelperText: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    offDayBadge: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      alignSelf: "center",
      marginLeft: 6,
    },
    offDayBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textMuted,
    },
  });
