import { Tabs } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { HapticTab } from "@/components/haptic-tab";
import { Calender, DocumentCheck, GalleryIcon, Home, Person, CheckRounded } from "@/components/icon";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { getToken } from "@/lib/storage";
import { getProfile } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { SvgProps } from "react-native-svg";

const iconStyles = StyleSheet.create({
  container: {
    width: 36,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
});

// Custom Tab Bar Icon Component
function TabIcon({
  icon: Icon,
  focused,
}: {
  icon: (props: SvgProps) => React.JSX.Element;
  focused: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        iconStyles.container,
        focused && {
          backgroundColor: colors.primarySoft,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderStrong,
        },
      ]}
    >
      <Icon
        color={focused ? colors.primaryText : colors.textSecondary}
        width={22}
        height={22}
      />
    </View>
  );
}

export default function TabLayout() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
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

  const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

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
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textSecondary,
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
        name="gallery"
        options={{
          title: "Gallery",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={GalleryIcon} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Absensi",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={CheckRounded} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
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

const makeStyles = (c: ThemeColors, insets?: { bottom: number }) => {
  const bottomInset = (insets?.bottom ?? 0) > 0 ? insets!.bottom : 10;
  return StyleSheet.create({
    tabBar: {
      backgroundColor: c.tabBar,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      elevation: 8,
      shadowColor: c.textStrong,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      height: 58 + bottomInset,
      paddingTop: 5,
      paddingBottom: Math.max(bottomInset, 6),
    },
    tabBarLabel: {
      fontSize: 11,
      fontWeight: "600",
      marginTop: 2,
    },
  });
};
