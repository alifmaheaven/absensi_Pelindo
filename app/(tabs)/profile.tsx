import { useThemeColors, useThemePreference, type ThemeColors, type ThemePreference } from "@/hooks/use-theme-color";
import { PersonFill } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { removeToken } from "@/lib/storage";
import { useAuthStore } from "@/stores/auth";
import { smartCapitalize } from "@/utils/utils";
import API from "@/lib/axios";
import { getLatestVersion } from "@/services/version";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState , useMemo } from "react";
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_NUMBER = Constants.expoConfig?.extra?.eas?.buildNumber ?? "-";

const THEME_OPTIONS: {
  key: ThemePreference;
  label: string;
  icon: string;
}[] = [
  { key: "system", label: "Sistem", icon: "📱" },
  { key: "light", label: "Terang", icon: "☀️" },
  { key: "dark", label: "Gelap", icon: "🌙" },
];

export default function ProfileScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { showToast } = useToast();
  const { preference, setPreference } = useThemePreference();
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const menuItems = [
    { icon: "👤", label: "Edit Profile", subtitle: "Ubah informasi akun", onPress: () => router.push("/(no-tabs)/edit-profile") },
    { icon: "🔒", label: "Keamanan", subtitle: "Password dan keamanan", onPress: () => router.push("/(no-tabs)/change-password") },
    { icon: "ℹ️", label: "Tentang Aplikasi", subtitle: `Versi ${APP_VERSION}`, onPress: () => setAboutModalVisible(true) },
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
      <LinearGradient
        colors={["#1e90ff", "#4dabf7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.avatarContainer}>
          <PersonFill color="#fff" {...styles.avatarIcon} />
        </View>
        <Text style={styles.userName}>{smartCapitalize(user?.name)}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.menuItem} onPress={item.onPress}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <View style={styles.menuContent}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}

          {/* Baris / Segment Pilihan Tema */}
          <View style={styles.themeItem}>
            <View style={styles.themeRow}>
              <Text style={styles.menuIcon}>🌓</Text>
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
                        <Text style={styles.themeCheckText}>✓</Text>
                      </View>
                    )}
                    <Text style={styles.themeSegmentIcon}>{opt.icon}</Text>
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

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutIcon}>🚪</Text>
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
              <Text style={styles.modalAppIconText}>📋</Text>
            </View>

            {/* App Name */}
            <Text style={styles.modalAppName}>EOS Monitoring System</Text>
            <Text style={styles.modalAppDesc}>Sistem monitoring dan manajemen daily routine operasional</Text>

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
            >
              <Text style={styles.modalUpdateIcon}>🔄</Text>
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
    alignItems: "center",
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  avatarIcon: {
    width: 50,
    height: 50,
  },
  userName: {
    fontSize: 22,
    fontWeight: "bold",
    color: c.onGradient,
    marginBottom: 5,
  },
  userEmail: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  menuCard: {
    backgroundColor: c.card,
    borderRadius: 16,
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
  menuIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: c.text,
  },
  menuSubtitle: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 24,
    color: c.textFaint,
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
  themeSegmentIcon: {
    fontSize: 22,
    marginBottom: 4,
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
  themeCheckText: {
    fontSize: 10,
    fontWeight: "bold",
    color: c.onGradient,
    lineHeight: 12,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.danger,
  },
  logoutIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  logoutText: {
    fontSize: 16,
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
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
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
  modalAppIconText: {
    fontSize: 30,
  },
  modalAppName: {
    fontSize: 20,
    fontWeight: "bold",
    color: c.textStrong,
    marginBottom: 4,
  },
  modalAppDesc: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: "center",
    marginBottom: 16,
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
    paddingVertical: 8,
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
    color: c.text,
  },
  modalUpdateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
    width: "100%",
    padding: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  modalUpdateIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  modalUpdateText: {
    fontSize: 15,
    fontWeight: "600",
    color: c.onGradient,
  },
  modalCloseButton: {
    marginTop: 12,
    padding: 10,
  },
  modalCloseText: {
    fontSize: 14,
    color: c.textMuted,
    fontWeight: "500",
  },
});
