import { getAttendanceList } from "@/services/attendance";
import { useAuthStore } from "@/stores/auth";
import { parseWIBDate, parseUTCDate } from "@/utils/utils";
import {
  IAttendance,
  IMeta,
} from "@/types";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import { ClockOutline } from "@/components/icon";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
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
  const { user } = useAuthStore();
  const [attendanceData, setAttendanceData] = useState<IAttendance[]>([]);
  const [meta, setMeta] = useState<IMeta>(initialMeta);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);

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
      console.debug(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setAttendanceData([]);
      setMeta(initialMeta);
      setHasMore(true);
      const response = await fetchAttendanceList(1);
      const items = response.data?.data || [];
      const responseMeta = response.data?.meta;
      setAttendanceData(items);
      setMeta((prev) => ({ ...prev, total: responseMeta?.total || 0, page: 2, total_pages: responseMeta?.total_pages || 0 }));
      if (1 >= (responseMeta?.total_pages || 0)) setHasMore(false);
    } catch (error) {
      console.debug(error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    handleGetList();
  }, []);

  // checkin/checkout = WIB, created_at = UTC. Pakai helper timezone-aware
  // (new Date(spasi) engine-dependent di Hermes → jam salah).
  const formatWIB = (s?: string | null) =>
    s ? new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    }).format(parseWIBDate(s) ?? 0) : null;
  const formatUTC = (s?: string | null) =>
    s ? new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    }).format(parseUTCDate(s) ?? 0) : null;

  const renderItem = ({ item }: { item: IAttendance }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCode}>{item.code || "-"}</Text>
        <View style={[styles.statusBadge, item.checkout ? styles.statusDone : styles.statusActive]}>
          <Text style={[styles.statusText, item.checkout ? styles.statusTextDone : styles.statusTextActive]}>
            {item.checkout ? "Selesai" : "Aktif"}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Ionicons name="log-in-outline" size={14} color="#22C55E" />
            <Text style={styles.timeLabel}>Check In</Text>
            <Text style={styles.timeValue}>{formatWIB(item.checkin) || "-"}</Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeBlock}>
            <Ionicons name="log-out-outline" size={14} color="#EF4444" />
            <Text style={styles.timeLabel}>Check Out</Text>
            <Text style={styles.timeValue}>{formatWIB(item.checkout) || "-"}</Text>
          </View>
        </View>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
      <View style={styles.cardFooter}>
        <Ionicons name="time-outline" size={12} color="#999" />
        <Text style={styles.footerText}>{formatUTC(item.created_at)}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#1e90ff", "#8fd5f5ff"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
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
            contentContainerStyle={{ paddingBottom: 24 }}
            onEndReached={handleGetList}
            onEndReachedThreshold={0.5}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            ListFooterComponent={loading && attendanceData.length ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#1e90ff" />
              </View>
            ) : null}
            ListEmptyComponent={!loading ? (
              <EmptyState
                title="Belum Ada Riwayat Absensi"
                description="Lakukan check in untuk memulai pencatatan kehadiran kerja Anda."
                actionLabel="Muat Ulang"
                onAction={handleRefresh}
                icon={<ClockOutline color="#1e90ff" width={36} height={36} />}
              />
            ) : null}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { height: 140, paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingTop: 10 },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#fff" },
  content: { flex: 1, backgroundColor: "#F8FBFF", marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#F0F0F0" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardCode: { fontSize: 14, fontWeight: "700", color: "#1a1a1a" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusActive: { backgroundColor: "#E9F0FF" },
  statusDone: { backgroundColor: "#E8F5E9" },
  statusText: { fontSize: 11, fontWeight: "600" },
  statusTextActive: { color: "#4F7CFE" },
  statusTextDone: { color: "#43A047" },
  cardBody: { marginBottom: 8 },
  timeRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  timeBlock: { flex: 1, gap: 2 },
  timeLabel: { fontSize: 11, color: "#999", marginTop: 2 },
  timeValue: { fontSize: 13, color: "#333", fontWeight: "500" },
  timeDivider: { width: 1, height: "100%", backgroundColor: "#EEE", marginHorizontal: 12 },
  desc: { fontSize: 12, color: "#777", marginTop: 4 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 4, borderTopWidth: 1, borderTopColor: "#F5F5F5", paddingTop: 8 },
  footerText: { fontSize: 11, color: "#999" },
  loadingFooter: { paddingVertical: 20, alignItems: "center" },
  emptyState: { alignItems: "center", justifyContent: "center", padding: 40, marginTop: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: "bold", color: "#333", textAlign: "center", marginBottom: 4 },
  emptySubText: { fontSize: 13, color: "#999", textAlign: "center" },
});
