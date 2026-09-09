import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
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
  getTodayDateString,
  parseWIBDate,
  smartCapitalize,
} from "@/utils/utils";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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

export function getWorkStatus(
  datetime?: string | null,
  type: "checkin" | "checkout" = "checkin",
  shift?: Ishift | null,
  shiftDate?: string | null
): string {
  if (!shift) {
    // No schedule assigned — just show neutral state
    return "--";
  }

  const [sh, sm] = shift.start_time.split(":").map(Number);
  const [eh, em] = shift.end_time.split(":").map(Number);
  const defaultText = `${type === "checkin" ? "Start" : "End"} ${type === "checkin" ? shift.start_time.slice(0,5) : shift.end_time.slice(0,5)}`;

  if (!datetime) return defaultText;

  // checkin/checkout = WIB wall-clock string → parse WIB (bukan device-local).
  const actualTime = parseWIBDate(datetime);
  if (!actualTime) return defaultText;

  // S-MO-2: Turunkan tanggal jadwal dari tanggal shift (baseDate), bukan tanggal aktual.
  // Ini menghapus bug penambahan ganda +1 hari pada checkout pagi hari H+1.
  let baseDate = new Date(actualTime);
  if (shiftDate) {
    const parsedShiftDate = parseWIBDate(shiftDate.includes(" ") ? shiftDate : `${shiftDate} 00:00:00`);
    if (parsedShiftDate) {
      baseDate = parsedShiftDate;
    }
  } else if (type === "checkout" && shift.is_overnight && eh < sh) {
    // Jika checkout terjadi di jam pagi (< sh), maka tanggal mulai shift adalah kemarin
    if (actualTime.getHours() < sh) {
      baseDate.setDate(baseDate.getDate() - 1);
    }
  }

  const buildScheduled = (hh: number, mm: number): Date => {
    const d = new Date(baseDate);
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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  // S-MO-1: Algoritma Hibrida 3 Lapis
  // Lapis 1: Record tanggal kalender hari ini
  // Lapis 2: todaySchedule.active_overnight_session (kontrak §B.1)
  // Lapis 3: Fallback lokal wajib (record terakhir checkout == null & selisih <= 18 jam)
  // Tambahan penyelesaian: record yang baru di-checkout hari ini dari sesi semalam
  const activeCheckin = useMemo(() => {
    const today = getTodayDateString();

    // 1. Record tanggal hari ini (paling tinggi bila ada sesi hari ini)
    if (checkInData?.length) {
      const todayRecord = checkInData.find((c) => c.checkin?.split(" ")[0] === today);
      if (todayRecord) return todayRecord;
    }

    // 2. todaySchedule.active_overnight_session dari backend
    if (todaySchedule?.active_overnight_session) {
      const overnight = todaySchedule.active_overnight_session;
      const attId = overnight.attendance?.id ?? overnight.attendance_id;
      const checkinStr = overnight.attendance?.checkin ?? overnight.checkin;

      const matched = checkInData?.find(
        (c) => (attId && c.id === attId) || (checkinStr && c.checkin === checkinStr)
      );
      if (matched) return matched;

      if (overnight.attendance) {
        return {
          id: overnight.attendance.id,
          checkin: overnight.attendance.checkin,
          checkout: overnight.attendance.checkout,
          site_id: overnight.attendance.site_id ?? null,
          user_id: user?.id ?? "",
          created_at: overnight.attendance.checkin,
        } as IAttendance;
      }
    }

    // 3. Fallback lokal wajib (backend lama / APK n-1 / network race):
    // Record attendance terakhir dengan checkout == null dan selisih <= 18 jam
    if (checkInData?.length) {
      const latestUnfinished = checkInData.find((c) => c.checkin && !c.checkout);
      if (latestUnfinished?.checkin) {
        const checkinDate = parseWIBDate(latestUnfinished.checkin);
        if (checkinDate) {
          const elapsedMs = currentTime.getTime() - checkinDate.getTime();
          const elapsedHours = elapsedMs / (1000 * 60 * 60);
          if (elapsedHours >= 0 && elapsedHours <= 18) {
            return latestUnfinished;
          }
        }
      }

      // Transisi pasca-checkout: record sesi semalam yang di-checkout hari ini
      const checkedOutToday = checkInData.find(
        (c) => c.checkout?.split(" ")[0] === today && c.checkin?.split(" ")[0] !== today
      );
      if (checkedOutToday) return checkedOutToday;
    }

    return null;
  }, [checkInData, todaySchedule, currentTime, user?.id]);

  // Evaluasi sesi shift malam (overnight session), overdue, dan status pulang awal (S-MO-4)
  const overnightSessionInfo = useMemo(() => {
    const today = getTodayDateString();
    const serverOvernight = todaySchedule?.active_overnight_session;

    let isNightShiftActive = false;
    let shift: Ishift | null = null;
    let shiftDateStr = "";
    let checkinTimeStr = "";
    let isOverdue = false;

    if (serverOvernight) {
      isNightShiftActive = !serverOvernight.attendance?.checkout;
      shift = serverOvernight.shift;
      shiftDateStr = serverOvernight.shift_date || activeCheckin?.checkin?.split(" ")[0] || "";
      checkinTimeStr = serverOvernight.attendance?.checkin || serverOvernight.checkin || activeCheckin?.checkin || "";
      isOverdue = Boolean(serverOvernight.is_overdue);
    } else if (activeCheckin?.checkin && !activeCheckin?.checkout) {
      // Deteksi lokal: checkin bukan hari ini (atau shift is_overnight), selisih <= 18 jam
      const checkinDate = parseWIBDate(activeCheckin.checkin);
      if (checkinDate) {
        const elapsedHours = (currentTime.getTime() - checkinDate.getTime()) / (1000 * 60 * 60);
        const checkinDay = activeCheckin.checkin.split(" ")[0];
        const isPastMidnight = checkinDay !== today && elapsedHours >= 0 && elapsedHours <= 18;
        const isShiftOvernight = Boolean(todaySchedule?.shift?.is_overnight);

        if (isPastMidnight || isShiftOvernight) {
          isNightShiftActive = true;
          shift = todaySchedule?.shift ?? {
            id: "overnight-fallback",
            code: "SHIFT-MALAM",
            name: "Shift Malam",
            start_time: "22:00:00",
            end_time: "06:00:00",
            grace_late: 15,
            grace_early: 15,
            reminder_minutes: 30,
            is_overnight: true,
            color: "#5B21B6",
          };
          shiftDateStr = checkinDay;
          checkinTimeStr = activeCheckin.checkin;
        }
      }
    }

    if (!isNightShiftActive || !shift) {
      // Cek apakah baru checkout dari shift malam hari ini (Post-Checkout transition)
      const isRecentlyCompletedNightShift = Boolean(
        activeCheckin?.checkout &&
        activeCheckin?.checkout?.split(" ")[0] === today &&
        activeCheckin?.checkin?.split(" ")[0] !== today
      );
      return {
        isActive: false,
        isOverdue: false,
        isCompleted: isRecentlyCompletedNightShift,
        completedCheckoutTime: isRecentlyCompletedNightShift ? activeCheckin?.checkout?.split(" ")[1]?.slice(0, 5) : null,
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
    const scheduledEndDate = new Date(parsedShiftDate);
    scheduledEndDate.setHours(eh, em || 0, 0, 0);
    // Tambah 1 hari karena shift lintas hari
    scheduledEndDate.setDate(scheduledEndDate.getDate() + 1);

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
      isCompleted: false,
      completedCheckoutTime: null,
      shift,
      shiftDate: shiftDateStr,
      checkinTime: checkinTimeStr,
      scheduledEndStr: `${shift.end_time.slice(0, 5)} WIB`,
      elapsedStr,
      remainingStr,
      overdueMinutes,
      isEarlyCheckout,
    };
  }, [todaySchedule, activeCheckin, currentTime]);

  const currentShift = useMemo(() => {
    if (overnightSessionInfo.isActive && overnightSessionInfo.shift) {
      return overnightSessionInfo.shift;
    }
    return todaySchedule?.shift ?? null;
  }, [overnightSessionInfo, todaySchedule]);

  const shiftDateForStatus = useMemo(() => {
    if (overnightSessionInfo.shiftDate) {
      return overnightSessionInfo.shiftDate;
    }
    return activeCheckin?.checkin?.split(" ")[0] ?? null;
  }, [overnightSessionInfo, activeCheckin]);

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
    if (!activeCheckin?.checkin || activeCheckin?.checkout) {
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

    const checkinDay = activeCheckin.checkin.split(" ")[0];
    const shiftDate = shiftDateForStatus || checkinDay || getTodayDateString();

    const status = calculateEarlyCheckoutStatus({
      currentTime,
      checkinTime: activeCheckin.checkin,
      checkoutTime: activeCheckin.checkout,
      shift,
      shiftDate,
    });

    return {
      isEarly: status.isEarly,
      shiftName: status.shiftName,
      shiftEndTime: status.shiftEndTime,
      deficitText: status.deficitText,
    };
  }, [activeCheckin, overnightSessionInfo, currentShift, shiftDateForStatus, currentTime]);

  const handleCheckoutPress = () => {
    // Guard anti double-trigger
    if (submittingRef.current) return;

    if (!activeCheckin?.checkin) {
      showToast("Anda belum check in", "info");
      return;
    }
    if (activeCheckin?.checkout) {
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
        if (!activeCheckin?.checkin) {
          showToast("Anda belum check in", "info");
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
        if (!activeCheckin?.checkin) {
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

          {/* R-BL-11: Pill antrean offline */}
          {pendingOfflineCount > 0 && (
            <View style={styles.offlinePillContainer}>
              <View style={styles.offlinePillTextRow}>
                <Text style={styles.offlinePillIcon}>⏳</Text>
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
                  <Calender width={20} height={20} color={colors.text} />
                </Text>
                <Text style={styles.dayText}>{getDayName(currentTime)}</Text>
              </View>
            </View>

            {/* S-MO-4: Banner Shift Malam / Overdue / Pasca-Checkout */}
            {overnightSessionInfo.isActive && overnightSessionInfo.isOverdue ? (
              <View style={styles.overdueBanner}>
                <View style={styles.bannerHeaderRow}>
                  <Text style={styles.bannerEmoji}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.overdueTitle}>
                      WAKTU SHIFT TELAH BERAKHIR (OVERDUE)
                    </Text>
                    <Text style={styles.overdueSubtitle}>
                      {overnightSessionInfo.shift?.name || "Shift Malam"} berakhir pukul{" "}
                      {overnightSessionInfo.scheduledEndStr}
                    </Text>
                  </View>
                </View>
                <View style={styles.bannerDetailBox}>
                  <Text style={styles.bannerDetailText}>
                    Waktu Sekarang (WIB): {formatTime(currentTime)}
                  </Text>
                  <Text style={styles.bannerDetailText}>
                    Keterlambatan Check Out: {overnightSessionInfo.overdueMinutes} Menit
                  </Text>
                </View>
                <Text style={styles.bannerNotice}>
                  Anda belum melakukan Check Out kepulangan. Segera selesaikan absensi agar jam kerja Anda tercatat utuh.
                </Text>
              </View>
            ) : overnightSessionInfo.isActive ? (
              <View style={styles.overnightBanner}>
                <View style={styles.bannerHeaderRow}>
                  <Text style={styles.bannerEmoji}>🌙</Text>
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
            ) : overnightSessionInfo.isCompleted ? (
              <View style={styles.completedBanner}>
                <Text style={styles.completedTitle}>
                  ✅ Shift Malam Selesai
                </Text>
                <Text style={styles.completedSubtitle}>
                  Checked out pukul {overnightSessionInfo.completedCheckoutTime} WIB. Sesi dinas malam Anda telah tuntas dilaporkan.
                </Text>
              </View>
            ) : null}

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
                time={activeCheckin?.checkin}
                subtitle={getWorkStatus(activeCheckin?.checkin, "checkin", currentShift, shiftDateForStatus)}
                shift={currentShift}
                shiftDate={shiftDateForStatus}
                badgeText={activeCheckin?.checkin ? "Checked In" : "Check In"}
                onPress={() => {
                  if (submittingRef.current) return;
                  if (activeCheckin?.checkin) {
                    showToast("Anda sudah check in", "info");
                    return;
                  }
                  submittingRef.current = true;
                  router.push("/(no-tabs)/checkin");
                  setTimeout(() => {
                    submittingRef.current = false;
                  }, 1500);
                }}
              />

              <AttendanceCard
                type="checkout"
                time={activeCheckin?.checkout}
                subtitle={getWorkStatus(activeCheckin?.checkout, "checkout", currentShift, shiftDateForStatus)}
                shift={currentShift}
                shiftDate={shiftDateForStatus}
                isOverdue={overnightSessionInfo.isOverdue}
                badgeText={
                  activeCheckin?.checkout
                    ? "Checked Out"
                    : overnightSessionInfo.isOverdue
                    ? "Check Out Sekarang"
                    : "Check Out"
                }
                onPress={handleCheckoutPress}
              />
            </View>

            {overnightSessionInfo.isActive && !overnightSessionInfo.isOverdue && (
              <Text style={styles.overnightNote}>
                Catatan: Anda dapat melakukan check-out saat shift selesai (mulai {graceStartStr} WIB).
              </Text>
            )}
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
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
    color: c.onGradient,
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
  // R-BL-11: Pill antrean offline
  offlinePillContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.warningSoft,
    borderWidth: 1,
    borderColor: c.warning,
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
    fontSize: 16,
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
  },
  offlineSyncButtonDisabled: {
    opacity: 0.6,
  },
  offlineSyncButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  // Tips Card
  tipsCard: {
    backgroundColor: c.primary, // Biru seperti di gambar
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
    color: c.onGradient,
  },
  tipsText: {
    fontSize: 12,
    color: c.onGradient,
    lineHeight: 18,
    opacity: 0.9,
  },
  // Ringkasan Card
  ringkasanCard: {
    backgroundColor: c.card,
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
    borderRadius: 8,
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
  // S-MO-4: Overnight & Overdue Banners
  overnightBanner: {
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.primary,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  overdueBanner: {
    backgroundColor: c.dangerSoft,
    borderWidth: 1.5,
    borderColor: c.danger,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  completedBanner: {
    backgroundColor: c.successSoft,
    borderWidth: 1.5,
    borderColor: c.success,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  bannerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  bannerEmoji: {
    fontSize: 20,
    marginRight: 10,
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
    backgroundColor: "rgba(0,0,0,0.05)",
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
    backgroundColor: "rgba(0,0,0,0.03)",
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
    marginBottom: 4,
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
    marginBottom: 24,
    backgroundColor: c.surface,
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
