import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
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
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

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
        <Ionicons name="notifications-off-outline" size={20} color={colors.warningText} />
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

const makeStyles = (c: ThemeColors, isDark: boolean = false) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: c.warningSoft,
      borderColor: c.warningBorder,
      borderWidth: 1,
      borderRadius: 20,
      padding: 12,
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
      shadowColor: c.shadowGlass,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.glassCardSubtle,
      borderWidth: 1,
      borderColor: c.glassBorder,
      marginRight: 10,
    },
    textWrap: {
      flex: 1,
      paddingRight: 8,
    },
    title: {
      fontSize: 14,
      fontWeight: "700",
      letterSpacing: -0.2,
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
      minHeight: 36,
      justifyContent: "center",
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: c.glassCardSubtle,
      borderColor: c.glassBorder,
      borderWidth: 1,
    },
    settingButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textStrong,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.insetFill,
      borderWidth: 1,
      borderColor: c.insetBorder,
    },
  });
