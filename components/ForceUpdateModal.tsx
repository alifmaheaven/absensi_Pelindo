import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
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
          colors={["#0052cc", "#1e90ff", "#4fc3f7"]}
          style={styles.headerGradient}
        >
          <View style={styles.iconCircle}>
            <InfoOutlineRounded color="#1e90ff" width={48} height={48} />
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
              colors={["#1e90ff", "#0052cc"]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
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
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
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
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  versionBox: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 20,
  },
  versionRow: {
    alignItems: "center",
  },
  versionLabel: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 4,
    fontWeight: "500",
  },
  versionValueCurrent: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ef4444",
  },
  versionValueLatest: {
    fontSize: 16,
    fontWeight: "700",
    color: "#10b981",
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: "#cbd5e1",
  },
  notesBox: {
    width: "100%",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#1e90ff",
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 4,
  },
  notesContent: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 18,
  },
  updateButtonWrapper: {
    width: "100%",
    marginTop: "auto",
    marginBottom: 36,
  },
  updateButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#1e90ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  updateButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
