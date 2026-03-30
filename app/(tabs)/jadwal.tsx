import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const scheduleData = [
  {
    day: "Senin",
    date: "06",
    shift: "Pagi",
    time: "08:00 - 17:00",
    status: "active",
  },
  {
    day: "Selasa",
    date: "07",
    shift: "Pagi",
    time: "08:00 - 17:00",
    status: "today",
  },
  {
    day: "Rabu",
    date: "08",
    shift: "Pagi",
    time: "08:00 - 17:00",
    status: "upcoming",
  },
  {
    day: "Kamis",
    date: "09",
    shift: "Pagi",
    time: "08:00 - 17:00",
    status: "upcoming",
  },
  {
    day: "Jumat",
    date: "10",
    shift: "Pagi",
    time: "08:00 - 16:00",
    status: "upcoming",
  },
  { day: "Sabtu", date: "11", shift: "Libur", time: "-", status: "off" },
  { day: "Minggu", date: "12", shift: "Libur", time: "-", status: "off" },
];

export default function JadwalScreen() {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case "today":
        return { bg: "#1e90ff", text: "#fff" };
      case "active":
        return { bg: "#e3f2fd", text: "#1e90ff" };
      case "off":
        return { bg: "#ffebee", text: "#f44336" };
      default:
        return { bg: "#f5f5f5", text: "#666" };
    }
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
        <Text style={styles.headerSubtitle}>Januari 2026</Text>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {scheduleData.map((item, index) => {
          const statusStyle = getStatusStyle(item.status);
          return (
            <View
              key={index}
              style={[
                styles.scheduleCard,
                item.status === "today" && styles.todayCard,
              ]}
            >
              <View
                style={[styles.dateBox, { backgroundColor: statusStyle.bg }]}
              >
                <Text style={[styles.dateNumber, { color: statusStyle.text }]}>
                  {item.date}
                </Text>
                <Text style={[styles.dayName, { color: statusStyle.text }]}>
                  {item.day}
                </Text>
              </View>
              <View style={styles.scheduleInfo}>
                <Text style={styles.shiftLabel}>{item.shift}</Text>
                <Text style={styles.timeText}>{item.time}</Text>
              </View>
              {item.status === "today" && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayText}>Hari Ini</Text>
                </View>
              )}
            </View>
          );
        })}
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
