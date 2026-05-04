import { getAttendanceList } from "@/services/attendance";
import { useAuthStore } from "@/stores/auth";
import { IAttendance } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export default function JadwalScreen() {
  const { user } = useAuthStore();
  const [attendanceData, setAttendanceData] = useState<IAttendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRecent() {
      try {
        setIsLoading(true);
        const res = await getAttendanceList({
          page: 1,
          per_page: 7,
          user_id_exact: [user?.id ?? ""],
          order_by_desc: ["created_at"],
        });
        setAttendanceData(res.data?.data || []);
      } catch (e) {
        console.error("Failed to fetch attendance:", e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRecent();
  }, [user?.id]);

  const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric" });
  const monthYear = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1e90ff", "#4fc3f7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Riwayat Absensi</Text>
        <Text style={styles.headerSubtitle}>{monthYear}</Text>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <Text style={styles.loadingText}>Memuat...</Text>
        ) : attendanceData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Belum ada data absensi</Text>
          </View>
        ) : (
          attendanceData.map((item) => {
            const checkin = item.checkin ?? "";
            const date = new Date(checkin);
            const day = DAY_NAMES[date.getDay()];
            const dateNum = formatter.format(date);
            const isToday = new Date().toDateString() === date.toDateString();
            const time = item.checkout
              ? `${checkin.split(" ")[1]?.slice(0, 5) ?? "--"} - ${item.checkout.split(" ")[1]?.slice(0, 5) ?? "--"}`
              : checkin.split(" ")[1]?.slice(0, 5) ?? "--:--";
            const bg = isToday ? "#1e90ff" : "#e3f2fd";
            const textColor = isToday ? "#fff" : "#1e90ff";

            return (
              <View
                key={item.id}
                style={[styles.scheduleCard, isToday && styles.todayCard]}
              >
                <View style={[styles.dateBox, { backgroundColor: bg }]}>
                  <Text style={[styles.dateNumber, { color: textColor }]}>
                    {dateNum}
                  </Text>
                  <Text style={[styles.dayName, { color: textColor }]}>
                    {day}
                  </Text>
                </View>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.shiftLabel}>{item.name}</Text>
                  <Text style={styles.timeText}>{time}</Text>
                </View>
                {isToday && (
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
