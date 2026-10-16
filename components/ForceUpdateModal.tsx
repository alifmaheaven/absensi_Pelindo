import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect , useMemo } from "react";
import {
  BackHandler,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { InfoOutlineRounded } from "./icon";

interface ForceUpdateModalProps {
  visible: boolean;
  latestVersion?: string;
  currentVersion?: string;
  updateUrl?: string;
  description?: string;
}

export default function ForceUpdateModal({
  visible,
  latestVersion,
  currentVersion,
  updateUrl,
  description,
}: ForceUpdateModalProps) {

  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  useEffect(() => {
    if (!visible) return;

    // Prevent Android hardware back button from dismissing modal
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true
    );

    return () => backHandler.remove();
  }, [visible]);

  const handleUpdate = () => {
    if (updateUrl) {
      Linking.openURL(updateUrl).catch((err) => {
        console.error("Failed to open update URL:", err);
      });
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Do not allow dismiss on back press
      }}
    >
      <View style={styles.container}>
        <LinearGradient
          colors={[colors.accentBlueDeep, colors.primary, colors.accentBlue]}
          style={styles.headerGradient}
        >
          <View style={styles.iconCircle}>
            <InfoOutlineRounded color={colors.primary} width={48} height={48} />
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={styles.title}>Pembaruan Wajib Tersedia</Text>
          <Text style={styles.subtitle}>
            Versi aplikasi yang Anda gunakan sudah tidak didukung. Harap perbarui aplikasi untuk melanjutkan akses layanan Tiketing & Absensi.
          </Text>

          <View style={styles.versionBox}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Versi Saat Ini</Text>
              <Text style={styles.versionValueCurrent}>{currentVersion || "1.0.0"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Versi Terbaru</Text>
              <Text style={styles.versionValueLatest}>{latestVersion || "Terbaru"}</Text>
            </View>
          </View>

          {description ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>Catatan Pembaruan:</Text>
              <Text style={styles.notesContent}>{description}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.updateButtonWrapper}
            activeOpacity={0.8}
            onPress={handleUpdate}
          >
            <LinearGradient
              colors={[colors.primaryAction, colors.primaryActionEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.updateButton}
            >
              <Text style={styles.updateButtonText}>Download & Update Sekarang</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors, isDark: boolean = false) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  headerGradient: {
    height: 240,
    justifyContent: "center",
    alignItems: "center",
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.glassSheet,
    borderWidth: 1,
    borderColor: c.glassOnGradientBorder,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: c.shadowGlass,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.45 : 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: c.textStrong,
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  versionBox: {
    flexDirection: "row",
    backgroundColor: c.glassCard,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: c.glassBorder,
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 20,
    shadowColor: c.shadowGlass,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.25 : 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  versionRow: {
    alignItems: "center",
  },
  versionLabel: {
    fontSize: 12,
    color: c.textSecondary,
    marginBottom: 4,
    fontWeight: "600",
  },
  versionValueCurrent: {
    fontSize: 16,
    fontWeight: "700",
    color: c.dangerText,
    fontVariant: ["tabular-nums"],
  },
  versionValueLatest: {
    fontSize: 16,
    fontWeight: "700",
    color: c.successText,
    fontVariant: ["tabular-nums"],
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: c.glassBorder,
  },
  notesBox: {
    width: "100%",
    backgroundColor: c.accentSoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: c.accentSoftBorder,
    borderLeftWidth: 4,
    borderLeftColor: c.primary,
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: c.primary,
    marginBottom: 4,
  },
  notesContent: {
    fontSize: 13,
    color: c.text,
    lineHeight: 18,
  },
  updateButtonWrapper: {
    width: "100%",
    marginTop: "auto",
    marginBottom: 36,
  },
  updateButton: {
    minHeight: 52,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.glassOnGradientBorder,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  updateButtonText: {
    color: c.onGradient,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
