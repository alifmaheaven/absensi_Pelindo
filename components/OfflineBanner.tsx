import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { getPendingCount, startOfflineSync } from "@/lib/offlineQueue";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

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
    if (!isOffline) return;
    const interval = setInterval(async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    }, 3000);
    return () => clearInterval(interval);
  }, [isOffline]);

  if (!isOffline && pendingCount === 0) return null;

  return (
    <View
      style={{
        backgroundColor: isOffline ? "#f59e0b" : "#22c55e",
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 12, textAlign: "center", fontWeight: "600" }}>
        {isOffline
          ? `Offline Mode${pendingCount > 0 ? ` (${pendingCount} data menunggu sync)` : " — data akan dikirim saat online"}`
          : `Syncing ${pendingCount} queued requests...`}
      </Text>
    </View>
  );
}
