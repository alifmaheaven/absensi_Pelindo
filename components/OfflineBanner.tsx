import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { getPendingCount, getFailedAttendanceCount, startOfflineSync } from "@/lib/offlineQueue";

export default function OfflineBanner() {
  const colors = useThemeColors();
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    startOfflineSync();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(offline);
      if (!offline) {
        setPendingCount(0);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const checkCounts = async () => {
      if (isOffline) {
        const count = await getPendingCount();
        setPendingCount(count);
      }
      const failed = await getFailedAttendanceCount();
      setFailedCount(failed);
    };

    checkCounts();
    const interval = setInterval(checkCounts, 3000);
    return () => clearInterval(interval);
  }, [isOffline]);

  if (failedCount > 0) {
    return (
      <View
        style={{
          backgroundColor: colors.danger,
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: colors.onGradient, fontSize: 12, textAlign: "center", fontWeight: "600" }}>
          {`⚠️ ${failedCount} data absensi offline gagal kirim. Bukti tersimpan, harap lapor atasan.`}
        </Text>
      </View>
    );
  }

  if (!isOffline && pendingCount === 0) return null;

  return (
    <View
      style={{
        backgroundColor: isOffline ? colors.warning : colors.success,
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: colors.onGradient, fontSize: 12, textAlign: "center", fontWeight: "600" }}>
        {isOffline
          ? `Offline Mode${pendingCount > 0 ? ` (${pendingCount} data menunggu sync)` : " — data akan dikirim saat online"}`
          : `Syncing ${pendingCount} queued requests...`}
      </Text>
    </View>
  );
}
