import {
  useThemeColors,
  useThemePreference,
  useIsDarkTheme,
  type ThemeColors,
  type ThemePreference,
} from "@/hooks/use-theme-color";
import { PersonFill } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { removeToken } from "@/lib/storage";
import { useAuthStore } from "@/stores/auth";
import { smartCapitalize } from "@/utils/utils";
import API from "@/lib/axios";
import { getLatestVersion } from "@/services/version";
import { getAttendanceMySummary, type IAttendanceMySummary } from "@/services/attendance";
import Constants from "expo-constants";
import { useRouter, useFocusEffect } from "expo-router";
import { useState, useMemo, useCallback } from "react";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_NUMBER = Constants.expoConfig?.extra?.eas?.buildNumber ?? "-";

const getWIBMonthString = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "2026";
  const m = parts.find((p) => p.type === "month")?.value || "09";
  return `${y}-${m}`;
};

const getWIBMonthDisplay = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "long",
    year: "numeric",
  }).format(date);
};

const THEME_OPTIONS: {
  key: ThemePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "system", label: "Sistem", icon: "phone-portrait-outline" },
  { key: "light", label: "Terang", icon: "sunny-outline" },
  { key: "dark", label: "Gelap", icon: "moon-outline" },
];

export default function ProfileScreen() {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { showToast } = useToast();
  const { preference, setPreference } = useThemePreference();
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // R-BL-4: State rekap absensi bulanan milik sendiri
  const [summaryData, setSummaryData] = useState<IAttendanceMySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const currentMonthDisplay = useMemo(() => getWIBMonthDisplay(), []);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const monthStr = getWIBMonthString();
      const res = await getAttendanceMySummary(monthStr);
      const payload: any = res.data;
      const actualData: IAttendanceMySummary = payload?.data || payload;
      setSummaryData(actualData || null);
    } catch (error) {
      console.warn("Failed to fetch my attendance summary:", error);
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
    }, [fetchSummary])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchSummary();
    } finally {
      setRefreshing(false);
    }
  };

  const totals = summaryData?.totals;
  const summaryChips = [
    {
      label: "Hadir",
      count: totals?.hadir ?? totals?.A ?? 0,
      bg: colors.successSoft,
      color: colors.success,
    },
    {
      label: "Terlambat",
      count: totals?.terlambat ?? totals?.T ?? 0,
      bg: colors.warningSoft,
      color: colors.warning,
    },
    {
      label: "Sakit",
      count: totals?.sakit ?? totals?.S ?? 0,
      bg: colors.primarySoft,
      color: colors.primary,
    },
    {
      label: "Izin",
      count: totals?.izin ?? totals?.I ?? 0,
      bg: colors.surface,
      color: colors.textSecondary,
    },
    {
      label: "Cuti",
      count: totals?.cuti ?? totals?.C ?? 0,
      bg: colors.surface,
      color: colors.primary,
    },
    {
      label: "Alpha",
      count: totals?.alpha ?? totals?.L ?? 0,
      bg: colors.dangerSoft,
      color: colors.danger,
    },
  ];

  const menuItems = [
    {
      icon: "person-outline" as keyof typeof Ionicons.glyphMap,
      label: "Edit Profile",
      subtitle: "Ubah informasi akun",
      onPress: () => router.push("/(no-tabs)/edit-profile"),
    },
    {
      icon: "lock-closed-outline" as keyof typeof Ionicons.glyphMap,
      label: "Keamanan",
      subtitle: "Password dan keamanan",
      onPress: () => router.push("/(no-tabs)/change-password"),
    },
    {
      icon: "information-circle-outline" as keyof typeof Ionicons.glyphMap,
      label: "Tentang Aplikasi",
      subtitle: `Versi ${APP_VERSION}`,
      onPress: () => setAboutModalVisible(true),
    },
  ];

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const latest = await getLatestVersion();
      if (!latest?.name) {
        Alert.alert(
          "Update Aplikasi",
          "Tidak dapat memeriksa update. Coba lagi nanti.",
          [{ text: "OK" }]
        );
        return;
      }
      if (latest.name !== APP_VERSION) {
        Alert.alert(
          "Update Tersedia",
          `Versi baru ${latest.name} tersedia. Versi Anda: ${APP_VERSION}.`,
          [
            { text: "Nanti", style: "cancel" },
            {
              text: "Download",
              onPress: () => {
                if (latest.url) Linking.openURL(latest.url);
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Update Aplikasi",
          `Anda sudah menggunakan versi terbaru.\n\nVersi: ${APP_VERSION}`,
          [{ text: "OK" }]
        );
      }
    } catch {
      Alert.alert(
        "Update Aplikasi",
        "Gagal memeriksa update. Periksa koneksi Anda.",
        [{ text: "OK" }]
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleLogout = async () => {
    try {
      await API.post('/auth/logout');
    } catch (apiError: any) {
      console.warn("Logout API call failed:", apiError?.message);
      // Continue with client-side cleanup even if API fails
    }
    await removeToken();
    showToast("Logout berhasil", "success");
    logout();
    router.replace("/auth");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <PersonFill color={colors.textStrong} {...styles.avatarIcon} />
        </View>
        <Text style={styles.userName}>{smartCapitalize(user?.name)}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={isDark ? "#38bdf8" : colors.primary}
          />
        }
      >
        {/* R-BL-4: Kartu Rekap Kehadiran Bulanan */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryCardHeader}>
            <View>
              <Text style={styles.summaryTitle}>Rekap Kehadiran</Text>
              <Text style={styles.summarySubtitle}>{currentMonthDisplay}</Text>
            </View>
            {summaryLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>

          {summaryError ? (
            <View style={styles.summaryErrorContainer}>
              <Text style={styles.summaryErrorText}>
                Gagal memuat ringkasan absensi
              </Text>
              <TouchableOpacity
                onPress={fetchSummary}
                style={styles.summaryRetryButton}
              >
                <Text style={styles.summaryRetryText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.summaryChipsGrid}>
              {summaryChips.map((chip, idx) => (
                <View
                  key={idx}
                  style={[styles.summaryChip, { backgroundColor: chip.bg }]}
                >
                  <Text style={[styles.summaryChipCount, { color: chip.color }]}>
                    {summaryLoading ? "-" : chip.count}
                  </Text>
                  <Text style={[styles.summaryChipLabel, { color: chip.color }]}>
                    {chip.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

          {/* Baris / Segment Pilihan Tema */}
          <View style={styles.themeItem}>
            <View style={styles.themeRow}>
              <View style={styles.menuIconWrap}>
                <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuLabel}>Tema</Text>
                <Text style={styles.menuSubtitle}>
                  {preference === "system"
                    ? "Mengikuti sistem perangkat"
                    : preference === "dark"
                    ? "Mode gelap aktif"
                    : "Mode terang aktif"}
                </Text>
              </View>
            </View>

            <View style={styles.themeSegmentContainer}>
              {THEME_OPTIONS.map((opt) => {
                const isSelected = preference === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.themeSegmentButton,
                      isSelected && styles.themeSegmentButtonActive,
                    ]}
                    onPress={() => setPreference(opt.key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Pilih tema ${opt.label}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    {isSelected && (
                      <View style={styles.themeCheckBadge}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={isSelected ? colors.primary : colors.textSecondary}
                      style={{ marginBottom: 4 }}
                    />
                    <Text
                      style={[
                        styles.themeSegmentLabel,
                        isSelected && styles.themeSegmentLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Keluar</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* About App Modal */}
      <Modal
        visible={aboutModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Handle */}
            <View style={styles.modalHandle} />

            {/* App Icon */}
            <View style={styles.modalAppIcon}>
              <Ionicons name="cube-outline" size={32} color={colors.primary} />
            </View>

            {/* App Name */}
            <Text style={styles.modalAppName}>Portal Tiketing & Operasional Pelindo</Text>
            <Text style={styles.modalAppDesc}>
              Sistem monitoring presensi, tiket kendala, dan daily routine operasional
            </Text>

            {/* Divider */}
            <View style={styles.modalDivider} />

            {/* Version Info */}
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>Versi Aplikasi</Text>
              <Text style={styles.modalInfoValue}>{APP_VERSION}</Text>
            </View>

            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>Build Number</Text>
              <Text style={styles.modalInfoValue}>{BUILD_NUMBER}</Text>
            </View>

            {/* Check Update Button */}
            <TouchableOpacity
              style={[styles.modalUpdateButton, checkingUpdate && { opacity: 0.7 }]}
              onPress={handleCheckUpdate}
              disabled={checkingUpdate}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.onGradient} style={{ marginRight: 8 }} />
              <Text style={styles.modalUpdateText}>
                {checkingUpdate ? "Memeriksa..." : "Periksa Update"}
              </Text>
            </TouchableOpacity>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setAboutModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ThemeColors, insets: EdgeInsets) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    paddingTop: Math.max(insets.top + 16, 32),
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: "center",
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarIcon: {
    width: 38,
    height: 38,
  },
  userName: {
    fontSize: 20,
    fontWeight: "bold",
    color: c.textStrong,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 13,
    color: c.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: c.textStrong,
  },
  summarySubtitle: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  summaryChipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  summaryChip: {
    width: "31%",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryChipCount: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  summaryChipLabel: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  summaryErrorContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  summaryErrorText: {
    fontSize: 13,
    color: c.danger,
    marginBottom: 10,
  },
  summaryRetryButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: c.primarySoft,
    borderRadius: 8,
  },
  summaryRetryText: {
    fontSize: 12,
    fontWeight: "600",
    color: c.primary,
  },
  menuCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: c.textStrong,
  },
  menuSubtitle: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  themeItem: {
    padding: 16,
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  themeSegmentContainer: {
    flexDirection: "row",
    gap: 8,
  },
  themeSegmentButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    position: "relative",
  },
  themeSegmentButtonActive: {
    borderColor: c.primary,
    backgroundColor: c.primarySoft,
  },
  themeSegmentLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: c.textSecondary,
    textAlign: "center",
  },
  themeSegmentLabelActive: {
    color: c.primary,
    fontWeight: "700",
  },
  themeCheckBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.danger,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
    color: c.danger,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: "center",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginBottom: 20,
  },
  modalAppIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: c.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  modalAppName: {
    fontSize: 18,
    fontWeight: "bold",
    color: c.textStrong,
    marginBottom: 4,
    textAlign: "center",
  },
  modalAppDesc: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 18,
  },
  modalDivider: {
    width: "100%",
    height: 1,
    backgroundColor: c.border,
    marginBottom: 16,
  },
  modalInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  modalInfoLabel: {
    fontSize: 14,
    color: c.textSecondary,
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textStrong,
  },
  modalUpdateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
    width: "100%",
    minHeight: 48,
    borderRadius: 12,
    marginTop: 20,
  },
  modalUpdateText: {
    fontSize: 15,
    fontWeight: "600",
    color: c.onGradient,
  },
  modalCloseButton: {
    marginTop: 12,
    padding: 10,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 14,
    color: c.textMuted,
    fontWeight: "500",
  },
});
