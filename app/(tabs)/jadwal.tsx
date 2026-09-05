import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { getWeekSchedule } from "@/services/schedule";
import { syncShiftNotifications } from "@/services/notification-scheduler";
import type { IWeekScheduleItem } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import ScheduleSkeleton from "@/components/ui/ScheduleSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Calender, InfoOutlineRounded } from "@/components/icon";
import { getAccessibleTextColor, parseWIBDate } from "@/utils/utils";

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
    fetchSchedule();
  }, [fetchSchedule]);

  const monthYear = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

  const getDayShortName = (dateStr?: string) => {
    if (!dateStr) return "";
    const shortDays = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const d = parseWIBDate(dateStr.includes(" ") ? dateStr : `${dateStr} 00:00:00`);
    if (!d) return "";
    return shortDays[d.getDay()];
  };

  const getNextDayShortName = (dateStr?: string) => {
    if (!dateStr) return "";
    const shortDays = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const d = parseWIBDate(dateStr.includes(" ") ? dateStr : `${dateStr} 00:00:00`);
    if (!d) return "";
    d.setDate(d.getDate() + 1);
    return shortDays[d.getDay()];
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1e90ff", "#4fc3f7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Jadwal Kerja</Text>
        <Text style={styles.headerSubtitle}>{monthYear}</Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchSchedule(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <ScheduleSkeleton count={7} />
        ) : isError ? (
          /* S-MO-3: Pemisahan jujur Error State (jaringan / server 500) */
          <EmptyState
            title="Gagal Memuat Jadwal"
            description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
            actionLabel="Coba Lagi"
            onAction={() => fetchSchedule(true)}
            icon={<InfoOutlineRounded color={colors.danger} width={36} height={36} />}
          />
        ) : schedules.length === 0 ? (
          /* S-MO-3: True Empty State (memang belum ada jadwal) */
          <EmptyState
            title="Belum Ada Penugasan Shift"
            description="Jadwal kerja Anda belum ditetapkan untuk pekan ini. Hubungi supervisor operasional jika ini tidak sesuai."
            actionLabel="Muat Ulang"
            onAction={() => fetchSchedule(true)}
            icon={<Calender color={colors.primary} width={36} height={36} />}
          />
        ) : (
          schedules.map((item, index) => {
            // item.date format "YYYY-MM-DD" — ambil tanggal langsung
            const dateNum = item.date ? item.date.split("-")[2] : "--";
            const bg = item.is_today ? colors.primary : item.has_schedule ? item.shift!.color : colors.primarySoft;
            // S-MO-5: Helper kontras WCAG AA (getAccessibleTextColor)
            const textColor = item.is_today
              ? colors.onGradient
              : item.has_schedule
              ? getAccessibleTextColor(item.shift?.color)
              : colors.textMuted;

            const isOvernight = Boolean(item.has_schedule && item.shift?.is_overnight);
            const curDayShort = getDayShortName(item.date);
            const nextDayShort = getNextDayShortName(item.date);

            const timeRangeText = item.has_schedule
              ? isOvernight
                ? `${item.shift!.start_time.slice(0, 5)} (${curDayShort}) – ${item.shift!.end_time.slice(0, 5)} (${nextDayShort})`
                : `${item.shift!.start_time.slice(0, 5)} - ${item.shift!.end_time.slice(0, 5)}`
              : "Tidak ada jadwal";

            return (
              <View
                key={index}
                style={[styles.scheduleCard, item.is_today && styles.todayCard]}
              >
                <View style={[styles.dateBox, { backgroundColor: bg }]}>
                  <Text style={[styles.dateNumber, { color: textColor }]}>
                    {dateNum}
                  </Text>
                  <Text style={[styles.dayName, { color: textColor }]}>
                    {item.day_name}
                  </Text>
                </View>
                <View style={styles.scheduleInfo}>
                  {item.has_schedule ? (
                    <>
                      <View style={styles.shiftLabelRow}>
                        <Text style={styles.shiftLabel}>{item.shift!.name}</Text>
                        {isOvernight && (
                          <View style={styles.overnightBadge}>
                            <Text style={styles.overnightBadgeText}>🌙 Lintas Hari (+1)</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.timeText}>{timeRangeText}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.shiftLabel}>Libur</Text>
                      <Text style={styles.timeText}>{timeRangeText}</Text>
                    </>
                  )}
                </View>
                {item.is_today && (
                  <View style={styles.todayBadge}>
                    <Text style={styles.todayText}>Hari Ini</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.primarySoft,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: c.onGradient,
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingText: {
    textAlign: "center",
    color: c.textSecondary,
    marginTop: 40,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: c.textSecondary,
    fontSize: 14,
  },
  scheduleCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  todayCard: {
    borderWidth: 2,
    borderColor: c.primary,
  },
  dateBox: {
    width: 55,
    height: 55,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  dateNumber: {
    fontSize: 20,
    fontWeight: "bold",
  },
  dayName: {
    fontSize: 10,
    fontWeight: "500",
  },
  scheduleInfo: {
    flex: 1,
  },
  shiftLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  shiftLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
  },
  overnightBadge: {
    backgroundColor: c.surface,
    borderColor: c.primary,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overnightBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: c.textStrong,
  },
  timeText: {
    fontSize: 13,
    color: c.textSecondary,
  },
  todayBadge: {
    backgroundColor: c.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  todayText: {
    fontSize: 11,
    color: c.onGradient,
    fontWeight: "600",
  },
});
