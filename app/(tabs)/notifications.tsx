import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { useTabBarInset } from "@/hooks/use-tab-bar-inset";
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/services/notification";
import { parseWIBDate } from "@/utils/utils";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import { Bell, ClockOutline, Ticket, Calender } from "@/components/icon";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

function formatTime(dateStr: string): string {
  // created_at = WIB wall-clock string -> parse WIB (bukan device-local)
  const date = parseWIBDate(dateStr) ?? new Date();
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  return `${Math.floor(hrs / 24)}h lalu`;
}

function getTypeColor(type: string, c: ThemeColors): string {
  const map: Record<string, string> = {
    ticket_status_change: c.primary,
    attendance_reminder: c.success,
    leave_update: c.warning,
  };
  return map[type] || c.textMuted;
}

function renderTypeIcon(type: string, c: ThemeColors) {
  const color = getTypeColor(type, c);
  switch (type) {
    case "attendance_reminder":
      return <ClockOutline color={color} width={22} height={22} />;
    case "ticket_status_change":
      return <Ticket color={color} width={22} height={22} />;
    case "leave_update":
      return <Calender color={color} width={22} height={22} />;
    default:
      return <Bell color={color} width={22} height={22} />;
  }
}

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const tabInset = useTabBarInset();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [notifRes, unreadRes] = await Promise.all([
        getNotifications(1, 50),
        getUnreadCount(),
      ]);
      setNotifications(notifRes?.data?.data || []);
      setUnreadCount(unreadRes?.data?.count || 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // IIFE async: setState di fetchData terjadi setelah `await`, bukan sinkron
    // di body effect (memenuhi `react-hooks/set-state-in-effect`).
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      Alert.alert("Error", "Gagal menandai semua notifikasi");
    }
  };

  const handlePressNotif = async (notif: Notification) => {
    if (!notif.is_read) {
      try {
        await markAsRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // silently fail
      }
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      onPress={() => handlePressNotif(item)}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        marginHorizontal: 16,
        marginTop: 10,
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: item.is_read ? (colors.glassCard || colors.card) : colors.primarySoft,
        shadowColor: "#081730",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: getTypeColor(item.type, colors) + "20",
          borderWidth: 1,
          borderColor: getTypeColor(item.type, colors) + "35",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        }}
      >
        {renderTypeIcon(item.type, colors)}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text
            style={{
              fontWeight: item.is_read ? "600" : "800",
              fontSize: 14,
              color: colors.textStrong,
              flex: 1,
              letterSpacing: -0.2,
            }}
          >
            {item.title}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 8, fontVariant: ["tabular-nums"] }}>
            {formatTime(item.created_at)}
          </Text>
        </View>
        <Text
          style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 4, lineHeight: 17 }}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.glassCard || colors.card,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700", letterSpacing: -0.3, color: colors.textStrong }}>Notifikasi</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
              Tandai semua sudah dibaca
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {loading && !notifications.length ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <ListSkeleton count={5} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabInset + 16 }}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              title="Tidak Ada Notifikasi"
              description="Semua pemberitahuan dan pembaruan tiket atau absensi akan muncul di sini."
              actionLabel="Periksa Notifikasi"
              onAction={onRefresh}
              icon={<Bell color={colors.primary} width={36} height={36} />}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
