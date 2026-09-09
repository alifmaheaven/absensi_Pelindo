import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface NotificationPermissionBannerProps {
  onDismiss: () => void;
}

export default function NotificationPermissionBanner({
  onDismiss,
}: NotificationPermissionBannerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (err) {
      if (__DEV__) console.warn("Failed to open settings:", err);
    }
  };

  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications-off-outline" size={20} color={colors.warning} />
      </View>

      <View style={styles.textWrap}>
        <Text style={styles.title}>Pengingat Shift Nonaktif</Text>
        <Text style={styles.message}>
          Alarm jam masuk kerja tidak berbunyi di luar aplikasi.
        </Text>
        <TouchableOpacity
          style={styles.settingButton}
          onPress={handleOpenSettings}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.settingButtonText}>Buka Pengaturan</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.closeButton}
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: c.warningSoft,
      borderColor: c.warning,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
    },
    iconWrap: {
      marginTop: 2,
      marginRight: 10,
    },
    textWrap: {
      flex: 1,
      paddingRight: 8,
    },
    title: {
      fontSize: 14,
      fontWeight: "700",
      color: c.textStrong,
      marginBottom: 2,
    },
    message: {
      fontSize: 12,
      color: c.textSecondary,
      lineHeight: 17,
      marginBottom: 8,
    },
    settingButton: {
      alignSelf: "flex-start",
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: c.card,
      borderColor: c.borderStrong,
      borderWidth: 1,
    },
    settingButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textStrong,
    },
    closeButton: {
      padding: 2,
    },
  });
