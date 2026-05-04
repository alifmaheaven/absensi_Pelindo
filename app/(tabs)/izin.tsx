import { ATTENDANCE_STATUS_CODE_CHECKIN } from "@/constants";
import { getAttendanceList, getAttendanceStatus } from "@/services/attendance";
import { useAuthStore } from "@/stores/auth";
import { IAttendance } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const getStatusColor = (status: string) => {
  switch (status) {
    case "Disetujui":
      return "#4CAF50";
    case "Menunggu":
      return "#FF9800";
    case "Ditolak":
      return "#F44336";
    default:
      return "#666";
  }
};

export default function IzinScreen() {
  const { user } = useAuthStore();
  const [attendanceData, setAttendanceData] = useState<
    (IAttendance & { status: string })[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAttendance() {
      try {
        setIsLoading(true);

        const [attendanceRes, statusRes] = await Promise.all([
          getAttendanceList({
            page: 1,
            per_page: 10,
            order_by_desc: ["created_at"],
            user_id_exact: [user?.id ?? ""],
          }),
          getAttendanceStatus({ page: 1, per_page: 10 }),
        ]);

        const attendance = attendanceRes?.data?.data || [];
        const status = statusRes.data?.data || [];

        const statusMap: Record<string, string> = {};
        let checkinStatusId = "";
        const checkinStatus = status.find((s) => s.code === ATTENDANCE_STATUS_CODE_CHECKIN)
          ?? status.find((s) => {
            const name = s.name?.toLowerCase() ?? "";
            const code = s.code?.toLowerCase() ?? "";
            return (
              name.includes("hadir") ||
              name.includes("check") ||
              name.includes("attend") ||
              name.includes("masuk") ||
              code.includes("hadir") ||
              code.includes("checkin") ||
              code.includes("attend") ||
              code.includes("masuk")
            );
          });
        if (checkinStatus) {
          checkinStatusId = checkinStatus.id;
        }
        status.forEach((item) => {
          statusMap[item.id] = item.name;
        });

        const attendanceWithStatus = attendance
          .filter((item) => item.attendance_status_id !== checkinStatusId)
          .map((item) => ({
            ...item,
            status: statusMap[item.attendance_status_id] || "Menunggu",
          }));

        setAttendanceData(attendanceWithStatus);
      } catch (error) {
        console.error("Failed to fetch attendance data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAttendance();
  }, [user?.id]);

  let content: React.ReactNode;

  if (isLoading) {
    content = <IzinSkeleton />;
  } else if (attendanceData.length === 0) {
    content = <EmptyState />;
  } else {
    content = attendanceData?.map((item) => (
      <View key={item.id} style={styles.izinCard}>
        <View style={styles.izinHeader}>
          <Text style={styles.izinType}>{item.description}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.izinDetails}>
          <Text style={styles.izinDate}>📅 {item.checkin ?? "--"}</Text>
        </View>
      </View>
    ));
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1e90ff", "#4fc3f7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Izin/Cuti</Text>
        <Text style={styles.headerSubtitle}>Kelola pengajuan izin Anda</Text>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Apply Button */}
        <TouchableOpacity
          style={styles.applyButton}
          onPress={() => router.push("/(no-tabs)/leave/create")}
        >
          <Text style={styles.applyButtonText}>+ Ajukan Izin/Cuti</Text>
        </TouchableOpacity>

        {/* History */}
        <Text style={styles.sectionTitle}>Riwayat Pengajuan</Text>

        {content}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const IzinSkeleton = () => {
  return (
    <>
      {[1, 2, 3].map((_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonBadge} />
          </View>
          <View style={styles.skeletonLine} />
        </View>
      ))}
    </>
  );
};

const EmptyState = () => {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyTitle}>Belum ada pengajuan</Text>
      <Text style={styles.emptySubtitle}>
        Anda belum memiliki riwayat izin atau cuti
      </Text>
    </View>
  );
};

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
  applyButton: {
    backgroundColor: "#1e90ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  izinCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  izinHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  izinType: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#666",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  izinDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  izinDate: {
    fontSize: 13,
    color: "#666",
  },

  skeletonCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  skeletonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  skeletonTitle: {
    width: "50%",
    height: 14,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
  },

  skeletonBadge: {
    width: 60,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
  },

  skeletonLine: {
    width: "40%",
    height: 12,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },

  emptyIcon: {
    fontSize: 42,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },

  emptySubtitle: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
  },
});
