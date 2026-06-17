import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function NetworkStatusBar() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
    });

    // Cek status awal
    NetInfo.fetch().then((state: NetInfoState) => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });

    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Tidak ada koneksi internet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#DC2626",
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
