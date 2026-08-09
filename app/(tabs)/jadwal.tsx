import { getWeekSchedule } from "@/services/schedule";
import type { IWeekScheduleItem } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function JadwalScreen() {
  const [schedules, setSchedules] = useState<IWeekScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSchedule() {
      try {
        setIsLoading(true);
        const res = await getWeekSchedule();
        setSchedules(res.data?.schedules || []);
      } catch (e) {
        console.error("Failed to fetch schedule:", e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSchedule();
  }, []);

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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <Text style={styles.loadingText}>Memuat...</Text>
        ) : schedules.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Belum ada jadwal</Text>
          </View>
        ) : (
          schedules.map((item, index) => {
            // item.date format "YYYY-MM-DD" — ambil tanggal langsung (hindari
            // new Date(spasi/zone) yang bisa off-by-one lintas timezone device).
            const dateNum = item.date ? item.date.split("-")[2] : "--";
            const bg = item.is_today ? "#1e90ff" : item.has_schedule ? item.shift!.color : "#e3f2fd";
            const textColor = item.is_today || item.has_schedule ? "#fff" : "#999";

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e8f4fc",
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
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
    color: "#666",
    marginTop: 40,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "#666",
    fontSize: 14,
  },
  scheduleCard: {
    backgroundColor: "#fff",
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
    borderColor: "#1e90ff",
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
    color: "#333",
    marginBottom: 4,
  },
  timeText: {
    fontSize: 13,
    color: "#666",
  },
  todayBadge: {
    backgroundColor: "#1e90ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  todayText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
});
