import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
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
import {
  calculateEarlyCheckoutStatus,
  formatHourMinute,
  getCompletedShiftBannerInfo,
  getTodayDateString,
  getWIBHour,
  parseWIBDate,
  resolveAttendanceSession,
  smartCapitalize,
  buildWIBScheduledTime,
  getWorkStatus,
  resolveHomeScreenCurrentShift,
} from "@/utils/utils";
import { router, useFocusEffect } from "expo-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getTodaySchedule, getWeekSchedule } from "@/services/schedule";
import { syncShiftNotifications, requestNotificationPermissions } from "@/services/notification-scheduler";
import { TIMEZONE } from "@/constants";
import type { IScheduleToday, Ishift } from "@/types";
import { getPendingCount, syncQueuedRequests } from "@/lib/offlineQueue";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import NotificationRationaleModal from "@/components/home/NotificationRationaleModal";
import NotificationPermissionBanner from "@/components/home/NotificationPermissionBanner";
import EarlyCheckoutModal from "@/components/ui/EarlyCheckoutModal";

export { getWorkStatus } from "@/utils/utils";

export default function HomeScreen() {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets, isDark), [colors, insets, isDark]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user } = useAuthStore();
  const { showToast } = useToast();

  // Record attendance hari ini (check-in DAN check-out) — sumber status card.
  // Pakai getAttendanceList + filter tanggal hari ini via getTodayDateString()
  // (Intl.DateTimeFormat "en-CA" — andal di Hermes, tidak seperti pola round-trip
  // toLocaleString). Lihat .planning/notes/bug-dashboard-not-detecting-checkin.md
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

  // R-BL-11: Antrean absensi offline
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  // Modal & notifikasi state
  const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState(false);
  const [showRationaleModal, setShowRationaleModal] = useState(false);
  const [hasNotifPermission, setHasNotifPermission] = useState<boolean | null>(null);
  const [isNotifBannerDismissed, setIsNotifBannerDismissed] = useState(false);
  const submittingRef = useRef(false);

  const checkNotificationPermission = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setHasNotifPermission(status === "granted");
    } catch {
      setHasNotifPermission(false);
    }
  }, []);

  const checkNotificationRationale = useCallback(async () => {
    try {
      const shown = await AsyncStorage.getItem("@notif_rationale_shown");
      const { status } = await Notifications.getPermissionsAsync();
      setHasNotifPermission(status === "granted");

      if (!shown) {
        setShowRationaleModal(true);
      }
    } catch {
      // fallback safe
    }
  }, []);

  useEffect(() => {
    checkNotificationRationale();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkNotificationPermission();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkNotificationRationale, checkNotificationPermission]);

  const handleAcceptNotification = async () => {
    setShowRationaleModal(false);
    await AsyncStorage.setItem("@notif_rationale_shown", "true");
    const granted = await requestNotificationPermissions();
    setHasNotifPermission(granted);
  };

  const handleDismissRationale = async () => {
    setShowRationaleModal(false);
    await AsyncStorage.setItem("@notif_rationale_shown", "true");
    const { status } = await Notifications.getPermissionsAsync();
    setHasNotifPermission(status === "granted");
  };

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingOfflineCount(count);
    } catch {
      // ignore
    }
  }, []);

  const handleSyncOffline = async () => {
    if (isSyncingOffline) return;
    setIsSyncingOffline(true);
    try {
      const synced = await syncQueuedRequests();
      await refreshPendingCount();
      if (synced > 0) {
        showToast(`Berhasil menyinkronkan ${synced} absensi`, "success");
        fetchAttendance();
      } else {
        const remaining = await getPendingCount();
        if (remaining === 0) {
          showToast("Semua absensi telah disinkronkan", "info");
        } else {
          showToast("Koneksi belum stabil untuk sinkronisasi", "error");
        }
      }
    } catch {
      showToast("Gagal menyinkronkan absensi", "error");
    } finally {
      setIsSyncingOffline(false);
    }
  };

  // Laporan 248: Resolusi sesi aktif ketat (checkout NULL & <= 18 jam)
  // dan pemisahan recentlyCompletedSession agar check-in H+1 tidak terkunci
  const sessionResolution = useMemo(() => {
    return resolveAttendanceSession({
      checkInData,
      todaySchedule,
      currentTime,
    });
  }, [checkInData, todaySchedule, currentTime]);

  const activeSession = sessionResolution.activeSession;
  const recentlyCompletedSession = sessionResolution.recentlyCompletedSession;
  const isExpiredSession = sessionResolution.isExpiredSession;
  const expiredSession = sessionResolution.expiredSession;

  // Laporan 257 / UX BLOCKER-01: Copy banner pasca-checkout berbasis cut-off hari operasional (04:00 WIB)
  const completedBannerInfo = useMemo(() => {
    if (!recentlyCompletedSession || activeSession) return null;
    return getCompletedShiftBannerInfo({
      session: recentlyCompletedSession,
      currentTime,
    });
  }, [recentlyCompletedSession, activeSession, currentTime]);

  // ADR-267 / OI-2: Sesi dinas hari operasional ini telah selesai (pasca-checkout, sebelum cut-off 04:00 WIB)
  const isTodayShiftCompleted = useMemo(() => {
    return !activeSession && Boolean(recentlyCompletedSession && !completedBannerInfo?.isNewOperationalDay);
  }, [activeSession, recentlyCompletedSession, completedBannerInfo]);

  // Sesi yang ditampilkan pada kartu presensi (aktif berjalan, atau yang baru diselesaikan hari ini)
  const displaySession = useMemo(() => {
    if (activeSession) return activeSession;
    if (isTodayShiftCompleted) return recentlyCompletedSession;
    return null;
  }, [activeSession, isTodayShiftCompleted, recentlyCompletedSession]);

  // Evaluasi sesi shift malam (overnight session), overdue, dan status pulang awal (S-MO-4)
  const overnightSessionInfo = useMemo(() => {
    const today = getTodayDateString();
    const serverOvernight = todaySchedule?.active_overnight_session;

    let isNightShiftActive = false;
    let shift: Ishift | null = null;
    let shiftDateStr = "";
    let checkinTimeStr = "";
    let isOverdue = false;

    if (serverOvernight && !serverOvernight.attendance?.checkout) {
      isNightShiftActive = true;
      shift = serverOvernight.shift;
      shiftDateStr = serverOvernight.shift_date || activeSession?.checkin?.split(/[T\s]/)[0] || "";
      checkinTimeStr = serverOvernight.attendance?.checkin || serverOvernight.checkin || activeSession?.checkin || "";
      isOverdue = Boolean(serverOvernight.is_overdue);
    } else if (activeSession?.checkin && !activeSession?.checkout) {
      const isShiftOvernight = Boolean(
        activeSession.shift
          ? activeSession.shift.is_overnight
          : todaySchedule?.shift?.is_overnight
      );
      if (isShiftOvernight) {
        shift = activeSession.shift ?? (todaySchedule?.shift ?? null);
        if (shift) {
          isNightShiftActive = true;
          shiftDateStr = activeSession.checkin.split(/[T\s]/)[0];
          checkinTimeStr = activeSession.checkin;
        }
      }
    }

    if (!isNightShiftActive || !shift) {
      return {
        isActive: false,
        isOverdue: false,
        shift: null,
        shiftDate: "",
        checkinTime: "",
        scheduledEndStr: "",
        elapsedStr: "",
        remainingStr: "",
        overdueMinutes: 0,
        isEarlyCheckout: false,
      };
    }

    // Bangun scheduled end Date di zona WIB
    const [eh, em] = shift.end_time.split(":").map(Number);
    const parsedShiftDate = parseWIBDate(`${shiftDateStr} 00:00:00`) || new Date(currentTime);
    const scheduledEndDate = buildWIBScheduledTime(parsedShiftDate, eh, em || 0);
    // Tambah 1 hari karena shift lintas hari
    scheduledEndDate.setTime(scheduledEndDate.getTime() + 24 * 60 * 60 * 1000);

    const nowMs = currentTime.getTime();
    const scheduledEndMs = scheduledEndDate.getTime();
    const graceEarlyMs = (shift.grace_early ?? 15) * 60 * 1000;

    // Evaluasi overdue jika server belum menandai
    if (!isOverdue && nowMs > scheduledEndMs + graceEarlyMs) {
      isOverdue = true;
    }

    // Durasi berjalan sejak checkin
    let elapsedStr = "--";
    const checkinDate = parseWIBDate(checkinTimeStr);
    if (checkinDate) {
      const elapsedMs = Math.max(0, nowMs - checkinDate.getTime());
      const hours = Math.floor(elapsedMs / 3600000);
      const minutes = Math.floor((elapsedMs % 3600000) / 60000);
      elapsedStr = `${hours} Jam ${minutes} Menit`;
    }

    // Sisa waktu tugas
    let remainingStr = "--";
    let overdueMinutes = 0;
    if (nowMs < scheduledEndMs) {
      const remMs = scheduledEndMs - nowMs;
      const remHours = Math.floor(remMs / 3600000);
      const remMinutes = Math.floor((remMs % 3600000) / 60000);
      remainingStr = `~${remHours} Jam ${remMinutes} Menit`;
    } else {
      remainingStr = "Waktu shift berakhir";
      overdueMinutes = Math.floor((nowMs - scheduledEndMs) / 60000);
    }

    const isEarlyCheckout = nowMs < (scheduledEndMs - graceEarlyMs);

    return {
      isActive: true,
      isOverdue,
      shift,
      shiftDate: shiftDateStr,
      checkinTime: checkinTimeStr,
      scheduledEndStr: `${shift.end_time.slice(0, 5)} WIB`,
      elapsedStr,
      remainingStr,
      overdueMinutes,
      isEarlyCheckout,
    };
  }, [todaySchedule, activeSession, currentTime]);

  const currentShift = useMemo(() => {
    return resolveHomeScreenCurrentShift({
      displaySession,
      todaySchedule,
    });
  }, [overnightSessionInfo, todaySchedule, isTodayShiftCompleted, displaySession]);

  const shiftDateForStatus = useMemo(() => {
    if (overnightSessionInfo.shiftDate) {
      return overnightSessionInfo.shiftDate;
    }
    return displaySession?.checkin?.split(/[T\s]/)[0] ?? null;
  }, [overnightSessionInfo, displaySession]);

  const graceStartStr = useMemo(() => {
    if (!overnightSessionInfo.shift) return "05:45";
    const [eh, em] = overnightSessionInfo.shift.end_time.split(":").map(Number);
    const graceMins = overnightSessionInfo.shift.grace_early ?? 15;
    let totalMin = eh * 60 + em - graceMins;
    if (totalMin < 0) totalMin += 24 * 60;
    const gh = Math.floor(totalMin / 60);
    const gm = totalMin % 60;
    return `${String(gh).padStart(2, "0")}:${String(gm).padStart(2, "0")}`;
  }, [overnightSessionInfo.shift]);

  // Deteksi pulang-awal terpadu untuk semua shift (overnight maupun normal siang)
  const earlyCheckoutInfo = useMemo(() => {
    // 1. Sesi absensi aktif harus ada dan belum check-out
    if (!activeSession?.checkin || activeSession?.checkout) {
      return {
        isEarly: false,
        shiftName: "",
        shiftEndTime: "",
        deficitText: undefined as string | undefined,
      };
    }

    // 2. Jika sesi overnight aktif: pertahankan logika & format teks existing tanpa regresi
    if (overnightSessionInfo.isActive) {
      const shiftName = overnightSessionInfo.shift?.name || "Shift Malam";
      const shiftEndTime = overnightSessionInfo.shift?.end_time?.slice(0, 5) || "06:00";
      const deficitText = overnightSessionInfo.remainingStr.startsWith("~")
        ? `${overnightSessionInfo.remainingStr.replace("~", "").trim()} Lebih Cepat`
        : undefined;

      return {
        isEarly: overnightSessionInfo.isEarlyCheckout,
        shiftName,
        shiftEndTime,
        deficitText,
      };
    }

    // 3. Shift normal siang / non-overnight dari todaySchedule / currentShift
    const shift = currentShift;
    if (!shift || !shift.end_time) {
      // Tanpa jadwal -> langsung checkout tanpa modal
      return {
        isEarly: false,
        shiftName: "",
        shiftEndTime: "",
        deficitText: undefined as string | undefined,
      };
    }

    const checkinDay = activeSession.checkin.split(/[T\s]/)[0];
    const shiftDate = shiftDateForStatus || checkinDay || getTodayDateString();

    const status = calculateEarlyCheckoutStatus({
      currentTime,
      checkinTime: activeSession.checkin,
      checkoutTime: activeSession.checkout,
      shift,
      shiftDate,
    });

    return {
      isEarly: status.isEarly,
      shiftName: status.shiftName,
      shiftEndTime: status.shiftEndTime,
      deficitText: status.deficitText,
    };
  }, [activeSession, overnightSessionInfo, currentShift, shiftDateForStatus, currentTime]);

  const handleCheckoutPress = () => {
    // Guard anti double-trigger
    if (submittingRef.current) return;

    if (isTodayShiftCompleted || displaySession?.checkout) {
      showToast(
        "Presensi dinas hari ini telah selesai. Sesi baru dapat dimulai pukul 04:00 WIB.",
        "info"
      );
      return;
    }

    if (!activeSession?.checkin) {
      showToast("Anda belum check in", "info");
      return;
    }
    if (activeSession?.checkout) {
      showToast("Anda sudah check out", "info");
      return;
    }

    // Keputusan D87 Opsi A: Modal konfirmasi pulang-awal jika belum jam normal (semua shift)
    if (earlyCheckoutInfo.isEarly) {
      setShowEarlyCheckoutModal(true);
      return;
    }

    submittingRef.current = true;
    router.push("/(no-tabs)/checkout");
    setTimeout(() => {
      submittingRef.current = false;
    }, 1500);
  };

  const fetchSchedule = async () => {
    try {
      const [todayRes, weekRes] = await Promise.allSettled([
        getTodaySchedule(),
        getWeekSchedule(),
      ]);

      if (todayRes.status === "fulfilled") {
        setTodaySchedule(todayRes.value.data);
      } else {
        showToast("Gagal memuat jadwal hari ini", "error");
      }

      if (weekRes.status === "fulfilled" && weekRes.value.data?.schedules) {
        syncShiftNotifications(weekRes.value.data.schedules);
      }
    } catch (error) {
      showToast("Gagal memuat jadwal", "error");
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
    try {
      const { getProfile } = await import("@/services/auth");
      await Promise.allSettled([
        fetchSchedule(),
        fetchAttendance(),
        fetchUnreadCount(),
        refreshPendingCount(),
        getProfile().then((res) => {
          if (res.data) useAuthStore.getState().setUser(res.data);
        }).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // Re-fetch attendance + schedule every time this screen gains focus
  // (handles initial mount, returning from checkin/checkout, and tab switch)
  useFocusEffect(
    useCallback(() => {
      submittingRef.current = false;
      fetchAttendance();
      fetchSchedule();
      fetchUnreadCount();
      refreshPendingCount();
    }, [user?.id, refreshPendingCount])
  );

  // Re-fetch when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && user?.id) {
        fetchAttendance();
        fetchSchedule();
        fetchUnreadCount();
        refreshPendingCount();
      }
    });
    return () => sub.remove();
  }, [user?.id, refreshPendingCount]);

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

  // Jam/tanggal/hari tampil di zona WIB (bukan device-local) — lihat
  // .planning/notes/timezone-audit-2026-08-09.md
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: TIMEZONE,
    });
  };

  const formatDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date);
    const get = (t: string) => (parts.find((p) => p.type === t) || {}).value || "00";
    return `${get("day")}/${get("month")}/${get("year")}`;
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
    return days[Number(new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(date).toUpperCase().replace(/SUN/, "0").replace(/MON/, "1").replace(/TUE/, "2").replace(/WED/, "3").replace(/THU/, "4").replace(/FRI/, "5").replace(/SAT/, "6"))];
  };

  const getGreeting = () => {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "2-digit", hour12: false }).format(currentTime));
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const aksesMenuItems = [
    {
      icon: Ticket,
      label: "Ticket",
      subtext: "Bantuan & Lapor",
      color: colors.warning,
      containerColor: colors.warningSoft,
      onPress: () => {
        if (!activeSession?.checkin && !recentlyCompletedSession?.checkin) {
          showToast(
            "Akses menu memerlukan presensi aktif. Silakan lakukan check-in terlebih dahulu.",
            "warning"
          );
          return;
        }
        router.push("/(no-tabs)/ticketing");
      },
    },
    {
      icon: CheckRounded,
      label: "Daily Routine",
      subtext: "Checklist Harian",
      color: colors.success,
      containerColor: colors.successSoft,
      onPress: () => {
        if (!activeSession?.checkin && !recentlyCompletedSession?.checkin) {
          showToast(
            "Akses menu memerlukan presensi aktif. Silakan lakukan check-in terlebih dahulu.",
            "warning"
          );
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
        colors={[colors.primary, colors.background]}
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
              tintColor={colors.onGradient}
              colors={[colors.primary]}
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
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Bell color={colors.onGradient} />

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
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <PersonFill color={colors.onGradient} {...styles.avatarIcon} />
              </TouchableOpacity>
            </View>
          </View>

        {/* R-BL-11: Pill antrean offline */}
        {pendingOfflineCount > 0 && (
          <View style={styles.offlinePillContainer}>
            <View style={styles.offlinePillTextRow}>
              <Ionicons
                name="time-outline"
                size={16}
                color={isDark ? colors.warning : "#92400e"}
                style={styles.offlinePillIcon}
              />
              <Text style={styles.offlinePillText}>
                {pendingOfflineCount} absensi menunggu sinkronisasi
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.offlineSyncButton,
                isSyncingOffline && styles.offlineSyncButtonDisabled,
              ]}
              onPress={handleSyncOffline}
              disabled={isSyncingOffline}
              activeOpacity={0.8}
            >
              {isSyncingOffline ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.offlineSyncButtonText}>Sinkronkan</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Banner Peringatan Izin Notifikasi Nonaktif */}
        {hasNotifPermission === false && !isNotifBannerDismissed && (
          <NotificationPermissionBanner
            onDismiss={() => setIsNotifBannerDismissed(true)}
          />
        )}

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
                <Calender width={20} height={20} color={colors.text} />
              </Text>
              <Text style={styles.dayText}>{getDayName(currentTime)}</Text>
            </View>
          </View>

          {/* Shift Context Badge (Laporan 248) */}
          {currentShift && (
            <View style={styles.shiftContextRow}>
              <View
                style={[
                  styles.shiftContextBadge,
                  {
                    backgroundColor: currentShift.color ? `${currentShift.color}15` : colors.primarySoft,
                    borderColor: currentShift.color || colors.primary,
                  },
                ]}
              >
                <Ionicons
                  name="briefcase-outline"
                  size={12}
                  color={currentShift.color || colors.primary}
                  style={styles.shiftContextIcon}
                />
                <Text
                  style={[
                    styles.shiftContextText,
                    { color: currentShift.color || colors.primary },
                  ]}
                >
                  {currentShift.name} ({currentShift.start_time.slice(0, 5)} - {currentShift.end_time.slice(0, 5)} WIB)
                </Text>
              </View>
            </View>
          )}

          {/* Clock Section */}
          <View style={styles.clockSection}>
            <View style={styles.clockIconRow}>
              <Text style={styles.clockEmoji}>
                <ClockOutline width={20} height={20} color={colors.primary} />
              </Text>
              <Text style={styles.clockSmall}>{formatTime(currentTime)}</Text>
            </View>
            <Text style={styles.digitalClock}>{formatTime(currentTime)}</Text>
          </View>

          {/* Attendance Cards */}
          <View style={styles.attendanceRow}>
            <AttendanceCard
              type="checkin"
              time={displaySession?.checkin}
              subtitle={getWorkStatus(displaySession?.checkin, "checkin", currentShift, shiftDateForStatus)}
              shift={currentShift}
              shiftDate={shiftDateForStatus}
              badgeText={displaySession?.checkin ? "Checked In" : "Check In"}
              disabled={isTodayShiftCompleted || Boolean(activeSession?.checkin)}
              disabledReason={isTodayShiftCompleted ? "Sesi dinas hari ini telah selesai" : undefined}
              onPress={
                isTodayShiftCompleted
                  ? undefined
                  : () => {
                      if (submittingRef.current) return;
                      if (activeSession?.checkin) {
                        showToast(
                          "Sesi dinas masih aktif. Silakan lakukan check-out terlebih dahulu sebelum memulai sesi baru.",
                          "warning"
                        );
                        return;
                      }
                      submittingRef.current = true;
                      router.push("/(no-tabs)/checkin");
                      setTimeout(() => {
                        submittingRef.current = false;
                      }, 1500);
                    }
              }
            />

            <AttendanceCard
              type="checkout"
              time={displaySession?.checkout}
              subtitle={getWorkStatus(displaySession?.checkout, "checkout", currentShift, shiftDateForStatus)}
              shift={currentShift}
              shiftDate={shiftDateForStatus}
              isOverdue={overnightSessionInfo.isOverdue}
              badgeText={
                displaySession?.checkout
                  ? "Checked Out"
                  : overnightSessionInfo.isOverdue
                  ? "Check Out Sekarang"
                  : "Check Out"
              }
              disabled={isTodayShiftCompleted}
              disabledReason={isTodayShiftCompleted ? "Sesi dinas hari ini telah selesai" : undefined}
              onPress={isTodayShiftCompleted ? undefined : handleCheckoutPress}
            />
          </View>

          {overnightSessionInfo.isActive && !overnightSessionInfo.isOverdue && (
            <Text style={styles.overnightNote}>
              Catatan: Anda dapat melakukan check-out saat shift selesai (mulai {graceStartStr} WIB).
            </Text>
          )}

          {/* S-MO-4 / Laporan 257: Zona Banner Status & Riwayat (relokasi ke bawah kartu presensi untuk zero-CLS) */}
          {overnightSessionInfo.isActive && overnightSessionInfo.isOverdue ? (
            <View style={styles.overdueBanner}>
              <View style={styles.bannerHeaderRow}>
                <Ionicons
                  name="warning"
                  size={20}
                  color={colors.danger}
                  style={styles.bannerIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.overdueTitle}>
                    Waktu Shift Telah Selesai
                  </Text>
                  <Text style={styles.overdueSubtitle}>
                    {overnightSessionInfo.shift?.name || "Shift Malam"} berakhir pada pukul{" "}
                    {overnightSessionInfo.shift?.end_time ? overnightSessionInfo.shift.end_time.slice(0, 5) : "--:--"} WIB
                  </Text>
                </View>
              </View>
              <View style={styles.bannerDetailBox}>
                <Text style={styles.bannerDetailText}>
                  Waktu Sekarang (WIB): {formatTime(currentTime)}
                </Text>
                <Text style={styles.bannerDetailText}>
                  Waktu berlalu sejak jadwal selesai: {overnightSessionInfo.overdueMinutes} menit
                </Text>
              </View>
              <Text style={styles.bannerNotice}>
                Silakan lakukan check-out sekarang agar jam kerja Anda tercatat lengkap di sistem.
              </Text>
            </View>
          ) : overnightSessionInfo.isActive ? (
            <View style={styles.overnightBanner}>
              <View style={styles.bannerHeaderRow}>
                <Ionicons
                  name="moon"
                  size={20}
                  color={colors.primary}
                  style={styles.bannerIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.overnightTitle}>
                    SESI SHIFT MALAM BERJALAN
                  </Text>
                  <Text style={styles.overnightSubtitle}>
                    {overnightSessionInfo.shift?.name || "Shift Malam"}:{" "}
                    {overnightSessionInfo.shift?.start_time.slice(0, 5)} WIB (Kemarin) s.d.{" "}
                    {overnightSessionInfo.shift?.end_time.slice(0, 5)} WIB (Pagi)
                  </Text>
                </View>
              </View>
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Waktu Sekarang</Text>
                  <Text style={styles.metricValue}>{formatTime(currentTime)}</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Durasi Berjalan</Text>
                  <Text style={styles.metricValue}>{overnightSessionInfo.elapsedStr}</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Sisa Waktu</Text>
                  <Text style={styles.metricValue}>{overnightSessionInfo.remainingStr}</Text>
                </View>
              </View>
            </View>
          ) : completedBannerInfo ? (
            <View style={styles.completedBanner}>
              <View style={styles.bannerHeaderRow}>
                <CheckRounded
                  width={18}
                  height={18}
                  color={colors.success}
                  style={styles.bannerIcon}
                />
                <Text style={styles.completedTitle}>
                  {completedBannerInfo.title}
                </Text>
              </View>
              <Text style={styles.completedSubtitle}>
                {completedBannerInfo.subtitle}
              </Text>
            </View>
          ) : isExpiredSession && expiredSession && !activeSession ? (
            <View style={styles.expiredBanner}>
              <View style={styles.bannerHeaderRow}>
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={isDark ? colors.warning : "#92400e"}
                  style={styles.bannerIcon}
                />
                <Text style={styles.expiredTitle}>
                  Sesi Dinas Terlewati
                </Text>
              </View>
              <Text style={styles.expiredSubtitle}>
                Presensi masuk kemarin ({formatHourMinute(expiredSession.checkin)} WIB) belum di-checkout hingga batas 18 jam. Silakan lakukan check-in baru dan laporkan jam pulang kemarin kepada pengawas.
              </Text>
            </View>
          ) : null}
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

                  <View style={styles.aksesTextContainer}>
                    <Text style={styles.aksesLabel} numberOfLines={1}>{item.label}</Text>
                    {item.subtext ? (
                      <Text style={styles.aksesSubtext} numberOfLines={1}>{item.subtext}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </LinearGradient>

      <EarlyCheckoutModal
        visible={showEarlyCheckoutModal}
        onClose={() => {
          setShowEarlyCheckoutModal(false);
          submittingRef.current = false;
        }}
        onConfirmCheckout={() => {
          if (submittingRef.current) return;
          submittingRef.current = true;
          setShowEarlyCheckoutModal(false);
          router.push("/(no-tabs)/checkout");
          setTimeout(() => {
            submittingRef.current = false;
          }, 1500);
        }}
        shiftName={earlyCheckoutInfo.shiftName || "Shift Kerja"}
        shiftEndTime={earlyCheckoutInfo.shiftEndTime || "17:00"}
        currentTime={formatTime(currentTime).slice(0, 5)}
        deficitText={earlyCheckoutInfo.deficitText}
      />

      <NotificationRationaleModal
        visible={showRationaleModal}
        onAccept={handleAcceptNotification}
        onDismiss={handleDismissRationale}
      />
    </View>
  );
}

const makeStyles = (c: ThemeColors, insets: EdgeInsets, isDark: boolean = false) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Math.max(insets.top + 12, 24),
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
    color: c.onGradient,
    marginBottom: 2,
  },
  userName: {
    fontSize: 14,
    color: c.onGradient,
    opacity: 0.9,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  avatarIcon: {
    width: 22,
    height: 22,
  },
  // R-BL-11: Pill antrean offline
  offlinePillContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.warningSoft,
    borderWidth: 1,
    borderColor: isDark ? "#b45309" : "#d97706",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  offlinePillTextRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  offlinePillIcon: {
    marginRight: 8,
  },
  offlinePillText: {
    fontSize: 13,
    fontWeight: "600",
    color: c.textStrong,
    flexShrink: 1,
  },
  offlineSyncButton: {
    backgroundColor: c.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 80,
    minHeight: 36,
  },
  offlineSyncButtonDisabled: {
    opacity: 0.6,
  },
  offlineSyncButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  // Ringkasan Card
  ringkasanCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.borderStrong,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  ringkasanHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  ringkasanLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  ringkasanLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: c.text,
    marginRight: 12,
  },
  ringkasanDate: {
    fontSize: 12,
    color: c.textSecondary,
    flex: 1,
    textAlign: "right",
    marginRight: 10,
  },
  dayBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  dayIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  dayText: {
    fontSize: 12,
    fontWeight: "600",
    color: c.text,
  },
  // Laporan 248: Shift Context Badge
  shiftContextRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  shiftContextBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  shiftContextIcon: {
    marginRight: 6,
  },
  shiftContextText: {
    fontSize: 12,
    fontWeight: "600",
  },
  // S-MO-4 / Laporan 257: Overnight, Overdue, Completed, & Expired Banners
  overnightBanner: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  overdueBanner: {
    backgroundColor: c.dangerSoft,
    borderWidth: 1,
    borderColor: c.danger,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  completedBanner: {
    backgroundColor: c.successSoft,
    borderWidth: 1,
    borderColor: c.success,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  expiredBanner: {
    backgroundColor: c.warningSoft,
    borderWidth: 1,
    borderColor: isDark ? "#b45309" : "#d97706",
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  expiredTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: isDark ? c.warning : "#92400e",
    letterSpacing: 0.5,
  },
  expiredSubtitle: {
    fontSize: 12,
    color: c.text,
    marginTop: 2,
    lineHeight: 16,
  },
  bannerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  bannerIcon: {
    marginRight: 8,
  },
  overnightTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: c.primary,
    letterSpacing: 0.5,
  },
  overnightSubtitle: {
    fontSize: 12,
    color: c.textSecondary,
    marginTop: 2,
  },
  overdueTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: c.danger,
    letterSpacing: 0.5,
  },
  overdueSubtitle: {
    fontSize: 12,
    color: c.textStrong,
    marginTop: 2,
  },
  bannerDetailBox: {
    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    borderRadius: 8,
    padding: 8,
    marginVertical: 6,
  },
  bannerDetailText: {
    fontSize: 12,
    color: c.text,
    fontWeight: "500",
  },
  bannerNotice: {
    fontSize: 11,
    color: c.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
    borderRadius: 10,
    padding: 8,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 10,
    color: c.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "700",
    color: c.textStrong,
  },
  completedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: c.success,
  },
  completedSubtitle: {
    fontSize: 12,
    color: c.text,
    lineHeight: 16,
  },
  overnightNote: {
    fontSize: 11,
    color: c.textSecondary,
    marginTop: 10,
    textAlign: "center",
    fontStyle: "italic",
  },
  // Clock Section
  clockSection: {
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  clockIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  clockEmoji: {
    fontSize: 14,
    marginRight: 6,
    color: c.primary,
  },
  clockSmall: {
    fontSize: 14,
    color: c.text,
    fontWeight: "600",
  },
  digitalClock: {
    fontSize: 40,
    fontWeight: "bold",
    color: c.textStrong,
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
    color: c.text,
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
    borderWidth: 1,
    borderColor: c.borderStrong,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: "row",
    gap: 10,
  },
  aksesIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  aksesTextContainer: {
    flex: 1,
    justifyContent: "center",
  },
  aksesLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: c.textStrong,
  },
  aksesSubtext: {
    fontSize: 11,
    color: c.textSecondary,
    marginTop: 2,
  },
  aksesCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.borderStrong,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  notificationBtn: {
    marginRight: 12,
    position: "relative",
    width: 44,
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: c.danger,
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    color: c.onGradient,
    fontSize: 10,
    fontWeight: "bold",
  },
});
