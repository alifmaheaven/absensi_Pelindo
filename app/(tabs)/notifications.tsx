import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/services/notification";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  return `${Math.floor(hrs / 24)}h lalu`;
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    ticket_status_change: "#1e90ff",
    attendance_reminder: "#22c55e",
    leave_update: "#f59e0b",
  };
  return colors[type] || "#999";
}

export default function NotificationsScreen() {
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
    fetchData();
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
      style={{
        flexDirection: "row",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
        backgroundColor: item.is_read ? "#fff" : "#f0f8ff",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: getTypeColor(item.type) + "20",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: getTypeColor(item.type),
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text
            style={{
              fontWeight: item.is_read ? "400" : "700",
              fontSize: 14,
              flex: 1,
            }}
          >
            {item.title}
          </Text>
          <Text style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
            {formatTime(item.created_at)}
          </Text>
        </View>
        <Text
          style={{ fontSize: 13, color: "#666", marginTop: 4 }}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: "#f0f0f0",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Notifikasi</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={{ color: "#1e90ff", fontSize: 14 }}>
              Tandai semua sudah dibaca
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        getItemLayout={(_data, index) => ({ length: 76, offset: 76 * index, index })}
        windowSize={5}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 }}>
            <Text style={{ color: "#999", fontSize: 14 }}>Belum ada notifikasi</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
