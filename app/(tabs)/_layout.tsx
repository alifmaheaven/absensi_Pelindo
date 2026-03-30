import { Tabs } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { Calender, DocumentCheck, Home, Person } from "@/components/icon";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { getToken } from "@/lib/storage";
import { getProfile } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { SvgProps } from "react-native-svg";

// Custom Tab Bar Icon Component
function TabIcon({
  icon,
  focused,
}: {
  icon: (props: SvgProps) => React.JSX.Element;
  focused: boolean;
}) {
  const Icon = icon;
  return (
    <View
      style={[styles.iconContainer, focused && styles.iconContainerFocused]}
    >
      <Icon color={"#fff"} />
    </View>
  );
}

export default function TabLayout() {
  const { checking } = useAuthGuard("auth");

  // Must be before any early returns (React Rules of Hooks)
  useEffect(() => {
    const initAuth = async () => {
      const token = await getToken();
      if (token) {
        const profile = await getProfile();
        if (profile.data) {
          useAuthStore.getState().setUser(profile.data);
        }
      }
    };
    initAuth();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#1e90ff",
        tabBarInactiveTintColor: "#999",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Home} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="jadwal"
        options={{
          title: "Jadwal",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Calender} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="izin"
        options={{
          title: "Izin/Cuti",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={DocumentCheck} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Person} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#fff",
    borderTopWidth: 0,
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    height: 75,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginVertical: 10,
  },
  iconContainer: {
    width: 40,
    height: 40,
    marginVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#999",
  },
  iconContainerFocused: {
    backgroundColor: "#1e90ff",
  },
  icon: {
    fontSize: 22,
  },
});
