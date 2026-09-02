import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { getWeekSchedule } from "@/services/schedule";
import { syncShiftNotifications } from "@/services/notification-scheduler";
import type { IWeekScheduleItem } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, useCallback , useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import ScheduleSkeleton from "@/components/ui/ScheduleSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Calender } from "@/components/icon";

export default function JadwalScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [schedules, setSchedules] = useState<IWeekScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSchedule = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setIsLoading(true);

      const res = await getWeekSchedule();
      const list = res.data?.schedules || [];
      setSchedules(list);
      syncShiftNotifications(list);
    } catch (e) {
      console.error("Failed to fetch schedule:", e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const monthYear = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

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
        ) : schedules.length === 0 ? (
          <EmptyState
            title="Belum Ada Jadwal"
            description="Jadwal shift kerja Anda belum ditetapkan oleh administrator. Hubungi supervisor untuk penugasan shift."
            actionLabel="Muat Ulang"
            onAction={() => fetchSchedule(true)}
            icon={<Calender color={colors.primary} width={36} height={36} />}
          />
        ) : (
          schedules.map((item, index) => {
            // item.date format "YYYY-MM-DD" — ambil tanggal langsung (hindari
            // new Date(spasi/zone) yang bisa off-by-one lintas timezone device).
            const dateNum = item.date ? item.date.split("-")[2] : "--";
            const bg = item.is_today ? colors.primary : item.has_schedule ? item.shift!.color : colors.primarySoft;
            const textColor = item.is_today || item.has_schedule ? colors.onGradient : colors.textMuted;

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
                      <Text style={styles.shiftLabel}>{item.shift!.name}</Text>
                      <Text style={styles.timeText}>
                        {item.shift!.start_time} - {item.shift!.end_time}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.shiftLabel}>Libur</Text>
                      <Text style={styles.timeText}>Tidak ada jadwal</Text>
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
  shiftLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
    marginBottom: 4,
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
