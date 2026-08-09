import AttendanceCard from "@/components/home/AttendanceCard";
import {
  Bell,
  Calender,
  CheckRounded,
  ClockOutline,
  PersonFill,
  Ticket,
} from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { useRequest } from "@/hooks/use-request";
import { getAttendanceList } from "@/services/attendance";
import { getUnreadCount } from "@/services/notification";
import { useAuthStore } from "@/stores/auth";
import { wsClient } from "@/lib/websocket";
import { IAttendance } from "@/types";
import { getTodayDateString, smartCapitalize } from "@/utils/utils";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  AppState,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { getTodaySchedule } from "@/services/schedule";
import type { IScheduleToday, Ishift } from "@/types";

export function getWorkStatus(
  datetime?: string | null,
  type: "checkin" | "checkout" = "checkin",
  shift?: Ishift | null
): string {
  if (!shift) {
    // No schedule assigned — just show neutral state
    return "--";
  }

  const [sh, sm] = shift.start_time.split(":").map(Number);
  const [eh, em] = shift.end_time.split(":").map(Number);
  const defaultText = `${type === "checkin" ? "Start" : "End"} ${type === "checkin" ? shift.start_time.slice(0,5) : shift.end_time.slice(0,5)}`;

  if (!datetime) return defaultText;

  const formattedDate = datetime.replace(" ", "T");
  const actualTime = new Date(formattedDate);
  if (isNaN(actualTime.getTime())) return defaultText;

  // Build scheduledTime using actualTime's date but shift's hours,
  // then attach the original timezone offset so DST/timezone shifts don't
  // silently convert the comparison.
  const buildScheduled = (hh: number, mm: number): Date => {
    const d = new Date(actualTime);
    d.setHours(hh, mm, 0, 0);
    return d;
  };

  if (type === "checkin") {
    const scheduledTime = buildScheduled(sh, sm);
    const graceMs = shift.grace_late * 60 * 1000;
    const diffMs = actualTime.getTime() - scheduledTime.getTime();

    if (diffMs > graceMs) {
      const diffMinutes = Math.floor((diffMs - graceMs) / 60000);
      return `Late Check in +${diffMinutes} min`;
    }
    if (diffMs < 0) {
      // Checked in BEFORE shift started — show how early
      const earlyMinutes = Math.floor(Math.abs(diffMs) / 60000);
      return `Early Check in ${earlyMinutes} min`;
    }
    return defaultText;
  } else {
    const scheduledTime = buildScheduled(eh, em);
    if (shift.is_overnight && eh < sh) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    const graceMs = shift.grace_early * 60 * 1000;
    const diffMs = actualTime.getTime() - scheduledTime.getTime();

    if (diffMs < -graceMs) {
      const diffMinutes = Math.floor(Math.abs(diffMs + graceMs) / 60000);
      return `Early Check Out ${diffMinutes} min`;
    }
    return defaultText;
  }
}

export default function HomeScreen() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user } = useAuthStore();
  const { showToast } = useToast();

  const { run: getCheckIn } = useRequest(() =>
    getAttendanceList({
      page: 1,
      per_page: 10,
      order_by_desc: ["created_at"],
      user_id_exact: [user?.id ?? ""],
    })
  );

  const [checkInData, setCheckInData] = useState<IAttendance[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState<IScheduleToday | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const checkInDataById = useMemo(() => {
    if (!checkInData?.length) return null;

    // created_at disimpan dalam WIB — pakai tanggal WIB, bukan UTC (toISOString)
    const todayDate = getTodayDateString(); // yyyy-mm-dd

    const checkInById = checkInData.find((c) => {
      if (!c.created_at) return false;

      // Ambil tanggal dari "2025-12-25 12:15:06.978681"
      const createdDate = c.created_at.split(" ")[0];

      return createdDate === todayDate;
    });

    return checkInById ?? null;
  }, [checkInData]);

  const fetchSchedule = async () => {
    try {
      const res = await getTodaySchedule();
      setTodaySchedule(res.data);
    } catch (error) {
      showToast("Gagal memuat jadwal hari ini", "error");
    }
  };

  const fetchAttendance = async () => {
    if (!user?.id) return;
    try {
      const res = await getCheckIn();
      setCheckInData(res.data?.data || []);
    } catch (error) {
      showToast("Gagal memuat data absensi", "error");
      setCheckInData([]);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await getUnreadCount();
      setUnreadCount(res?.data?.count || 0);
    } catch {
      // silently fail
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSchedule(), fetchAttendance(), fetchUnreadCount()]);
    setRefreshing(false);
  };

  // Re-fetch attendance + schedule every time this screen gains focus
  // (handles initial mount, returning from checkin/checkout, and tab switch)
  useFocusEffect(
    useCallback(() => {
      fetchAttendance();
      fetchSchedule();
      fetchUnreadCount();
    }, [user?.id])
  );

  // Re-fetch when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && user?.id) {
        fetchAttendance();
        fetchSchedule();
        fetchUnreadCount();
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  // Connect WebSocket for live notification updates
  useEffect(() => {
    if (!user?.id) return;
    wsClient.connect({ user_id: user.id });

    const handler = (data: any) => {
      if (data?.type === 'notification') {
        fetchUnreadCount();
      }
    };
    wsClient.onMessage(handler);

    return () => {
      wsClient.offMessage(handler);
    };
  }, [user?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getDayName = (date: Date) => {
    const days = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    return days[date.getDay()];
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const aksesMenuItems = [
    {
      icon: Ticket,
      label: "Ticket",
      color: "#FF8D28",
      containerColor: "#ffc999",
      onPress: () => {
        if (!checkInDataById?.checkin) {
          showToast("Anda belum check in", "info");
          return;
        }
        router.push("/(no-tabs)/ticketing");
      },
    },
    {
      icon: CheckRounded,
      label: "Daily",
      color: "#22C55E",
      containerColor: "#a7f3d0",
      onPress: () => {
        if (!checkInDataById?.checkin) {
          showToast("Anda belum check in", "info");
          return;
        }
        router.push("/(no-tabs)/daily-routine");
      },
    },
  ];

  const handleNotificationPress = () => {
    router.push("/(tabs)/notifications");
  };

  const handleAvatarPress = () => {
    router.push("/profile");
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1e90ff", "#ffffff"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradient}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>
                Sir {smartCapitalize(user?.name)}
              </Text>
            </View>

            <View style={styles.rightActions}>
              {/* Notification */}
              <TouchableOpacity
                onPress={handleNotificationPress}
                style={styles.notificationBtn}
              >
                <Bell color="#fff" />

                {unreadCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Avatar */}
              <TouchableOpacity
                onPress={handleAvatarPress}
                style={styles.avatar}
              >
                <PersonFill color="#fff" {...styles.avatarIcon} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tips Card */}
          <View style={styles.tipsCard}>
            <View style={styles.tipsHeader}>
              <Text style={styles.tipsIcon}>💪</Text>
              <Text style={styles.tipsTitle}>Tips Hari Ini</Text>
            </View>
            <Text style={styles.tipsText}>
              Jangan lupa untuk istirahat sejenak dan minum air putih secara
              teratur. Produktivitas terbaik datang dari tubuh yang sehat!
            </Text>
          </View>

          {/* Ringkasan Card */}
          <View style={styles.ringkasanCard}>
            {/* Header Row */}
            <View style={styles.ringkasanHeader}>
              <View style={styles.ringkasanLabelContainer}>
                <Text style={styles.ringkasanLabel}>Ringkasan</Text>
              </View>
              <Text style={styles.ringkasanDate}>
                {formatDate(currentTime)}
              </Text>
              <View style={styles.dayBadge}>
                <Text style={styles.dayIcon}>
                  <Calender width={20} height={20} color="#000" />
                </Text>
                <Text style={styles.dayText}>{getDayName(currentTime)}</Text>
              </View>
            </View>

            {/* Clock Section */}
            <View style={styles.clockSection}>
              <View style={styles.clockIconRow}>
                <Text style={styles.clockEmoji}>
                  <ClockOutline width={20} height={20} color="#2F73FF" />
                </Text>
                <Text style={styles.clockSmall}>{formatTime(currentTime)}</Text>
              </View>
              <Text style={styles.digitalClock}>{formatTime(currentTime)}</Text>
            </View>

            {/* Attendance Cards */}
            <View style={styles.attendanceRow}>
              <AttendanceCard
                type="checkin"
                time={checkInDataById?.checkin}
                subtitle={getWorkStatus(checkInDataById?.checkin, "checkin", todaySchedule?.shift)}
                badgeText={checkInDataById?.checkin ? "Checked In" : "Check In"}
                onPress={() => {
                  if (checkInDataById?.checkin) {
                    showToast("Anda sudah check in", "info");
                    return;
                  }
                  router.push("/(no-tabs)/checkin");
                }}
              />

              <AttendanceCard
                type="checkout"
                time={checkInDataById?.checkout}
                subtitle={getWorkStatus(checkInDataById?.checkout, "checkout", todaySchedule?.shift)}
                badgeText={
                  checkInDataById?.checkout ? "Checked Out" : "Check Out"
                }
                onPress={() => {
                  if (!checkInDataById?.checkin) {
                    showToast("Anda belum check in", "info");
                    return;
                  }
                  if (checkInDataById?.checkout) {
                    showToast("Anda sudah check out", "info");
                    return;
                  }
                  router.push("/(no-tabs)/checkout");
                }}
              />
            </View>
          </View>

          {/* Akses Cepat */}
          <View style={styles.aksesCard}>
            <Text style={styles.sectionTitle}>Akses Cepat</Text>

            <View style={styles.aksesGrid}>
              {aksesMenuItems.map((item, index) => {
                const Icon = item.icon;

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.aksesItem,
                      { backgroundColor: item.containerColor },
                    ]}
                    onPress={item.onPress}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.aksesIconContainer,
                        { backgroundColor: item.color },
                      ]}
                    >
                      <Icon color="#fff" />
                    </View>

                    <Text style={styles.aksesLabel}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 2,
  },
  userName: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(163, 163, 163, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(163, 163, 163, 0.9)",
  },
  avatarIcon: {
    width: 25,
    height: 25,
  },
  // Tips Card
  tipsCard: {
    backgroundColor: "#2196F3", // Biru seperti di gambar
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  tipsIcon: {
    fontSize: 16,
    marginRight: 8,
    color: "#FFEB3B", // Kuning untuk icon lampu
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
  },
  tipsText: {
    fontSize: 12,
    color: "#fff",
    lineHeight: 18,
    opacity: 0.9,
  },
  // Ringkasan Card
  ringkasanCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 24,
  },
  ringkasanHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  ringkasanLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  ringkasanLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginRight: 12,
  },
  ringkasanDate: {
    fontSize: 12,
    color: "#666",
    flex: 1,
    textAlign: "right",
    marginRight: 10,
  },
  dayBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  dayText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  // Clock Section
  clockSection: {
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "#f8f9fa",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 10,
  },
  clockIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  clockEmoji: {
    fontSize: 14,
    marginRight: 6,
    color: "#1e90ff",
  },
  clockSmall: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
  },
  digitalClock: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#1a1a1a",
    letterSpacing: 2,
  },
  // Attendance Cards
  attendanceRow: {
    flexDirection: "row",
    gap: 12,
  },
  // Content
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  aksesGrid: {
    flexDirection: "row",
    gap: 12,
  },
  aksesItem: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: "row", // Menyesuaikan gambar yang horizontal
    gap: 10,
  },
  aksesIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  aksesLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  aksesCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },

  rightActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  notificationBtn: {
    marginRight: 12,
    position: "relative",
    padding: 6, // tap area lebih nyaman
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
  },

  notificationBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#FF3B30",
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },

  notificationBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
});
