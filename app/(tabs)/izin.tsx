import { getAttendanceList, getAttendanceStatus } from "@/services/attendance";
import { getMyLeaves, ILeaveRequest } from "@/services/leave";
import { useAuthStore } from "@/stores/auth";
import { formatAttendanceDate, parseWIBDate } from "@/utils/utils";
import { IAttendance } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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

interface MergedItem {
  id: string;
  type: "attendance" | "leave_request";
  title: string;
  date: string;
  status: string;
  reason?: string;
  leave_type?: string;
}

export default function IzinScreen() {
  const { user } = useAuthStore();
  const [mergedData, setMergedData] = useState<MergedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);

      const [attendanceRes, statusRes, leavesRes] = await Promise.all([
        getAttendanceList({
          page: 1,
          per_page: 20,
          order_by_desc: ["created_at"],
          user_id_exact: [user.id],
        }),
        getAttendanceStatus({ page: 1, per_page: 10 }),
        getMyLeaves({ page: 1, per_page: 20 }).catch(() => [] as ILeaveRequest[]),
      ]);

      const attendance = attendanceRes?.data?.data || [];
      const status = statusRes.data?.data || [];
      const leaves: ILeaveRequest[] = Array.isArray(leavesRes) ? leavesRes : [];

      const statusMap: Record<string, string> = {};
      const attendId = status.find((s) => s.name?.toLowerCase() === "attend")?.id || "";
      status.forEach((s) => { statusMap[s.id] = s.name; });

      const merged: MergedItem[] = [];

      // Attendance records (approved by admin, non-Attend)
      attendance
        .filter((item) => item.attendance_status_id !== attendId)
        .forEach((item) => {
          merged.push({
            id: item.id,
            type: "attendance",
            title: statusMap[item.attendance_status_id] || item.description || "Izin/Cuti",
            date: item.checkin ?? "",
            status: item.checkin ? "Disetujui" : "Menunggu",
            reason: item.description,
          });
        });

      // Leave requests (pending/rejected — show even if not yet approved)
      leaves.forEach((lr) => {
        // Skip if already has an attendance record for same date (approved).
        // Bandingkan bagian tanggal saja (WIB) — m.date = checkin WIB
        // "2026-08-09 17:47:11", lr.leave_date mungkin "2026-08-09" atau ISO.
        const leaveDay = lr.leave_date?.split(/[T ]/)[0];
        const alreadyApproved = merged.some(
          (m) => m.type === "attendance" && (m.date?.split(/[T ]/)[0] === leaveDay)
        );
        if (!alreadyApproved) {
          const leaveTypeLabel = lr.leave_type === "cuti" ? "Cuti" : "Izin";
          merged.push({
            id: lr.id,
            type: "leave_request",
            title: leaveTypeLabel,
            date: lr.leave_date,
            status: lr.status === "approved" ? "Disetujui" : lr.status === "rejected" ? "Ditolak" : "Menunggu",
            reason: lr.reason,
            leave_type: lr.leave_type,
          });
        }
      });

      // Sort by date desc — parse WIB (andal di Hermes), NaN → 0 (stabil)
      const dateVal = (d?: string) => {
        const parsed = parseWIBDate(d);
        return parsed ? parsed.getTime() : 0;
      };
      merged.sort((a, b) => dateVal(b.date) - dateVal(a.date));

      setMergedData(merged);
    } catch (error) {
      console.error("Failed to fetch izin data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Refresh every time this tab gets focus
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  let content: React.ReactNode;

  if (isLoading) {
    content = <IzinSkeleton />;
  } else if (mergedData.length === 0) {
    content = <EmptyState />;
  } else {
    content = mergedData.map((item) => (
      <View key={`${item.type}-${item.id}`} style={styles.izinCard}>
        <View style={styles.izinHeader}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.izinType}>
              {item.title}
              {item.leave_type === "cuti" && item.type === "leave_request" ? " (Cuti)" : item.leave_type === "izin" && item.type === "leave_request" ? " (Izin)" : ""}
            </Text>
            {item.type === "leave_request" && item.status === "Menunggu" && (
              <Text style={styles.pendingDot}>⏳</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.izinDetails}>
          <Text style={styles.izinDate}>📅 {formatAttendanceDate(item.date, false, { day: "numeric", month: "long", year: "numeric" })}</Text>
        </View>
        {item.reason ? (
          <Text style={styles.reasonText} numberOfLines={2}>💬 {item.reason}</Text>
        ) : null}
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
  reasonText: {
    fontSize: 12,
    color: "#888",
    marginTop: 8,
    lineHeight: 18,
  },
  pendingDot: {
    fontSize: 14,
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
