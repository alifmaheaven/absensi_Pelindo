import { Tabs } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
import { HapticTab } from "@/components/haptic-tab";
import GlassSurface from "@/components/ui/GlassSurface";
import { Calender, DocumentCheck, GalleryIcon, Home, Person, CheckRounded } from "@/components/icon";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { getToken } from "@/lib/storage";
import { getProfile } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { SvgProps } from "react-native-svg";

const iconStyles = StyleSheet.create({
  container: {
    width: 40,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
});

// Custom Tab Bar Icon Component - Apple Liquid Glass Pod
function TabIcon({
  icon: Icon,
  focused,
}: {
  icon: (props: SvgProps) => React.JSX.Element;
  focused: boolean;
}) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();

  return (
    <View
      style={[
        iconStyles.container,
        focused && {
          backgroundColor: colors.accentPill,
          borderWidth: 1,
          borderColor: colors.accentPillBorder,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 2,
        },
      ]}
    >
      <Icon
        color={focused ? colors.primaryText : colors.textSecondary}
        width={21}
        height={21}
      />
    </View>
  );
}

export default function TabLayout() {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
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

  const styles = useMemo(() => makeStyles(colors, insets, isDark), [colors, insets, isDark]);

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
        tabBarItemStyle: styles.tabBarItem,
        tabBarBackground: () => <GlassSurface style={StyleSheet.absoluteFill} />,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Beranda",
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

const makeStyles = (c: ThemeColors, insets?: { bottom: number }, isDark: boolean = false) => {
  const bottomInset = (insets?.bottom ?? 0) > 0 ? insets!.bottom : 10;
  return StyleSheet.create({
    tabBar: {
      position: "absolute",
      backgroundColor: "transparent",
      borderTopWidth: 1,
      borderTopColor: c.glassBorder,
      elevation: 10,
      shadowColor: c.shadowGlass,
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      height: 60 + bottomInset,
      paddingTop: 6,
      paddingBottom: Math.max(bottomInset, 6),
    },
    tabBarItem: {
      paddingHorizontal: 0,
    },
    tabBarLabel: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: -0.2,
      marginTop: 2,
    },
  });
};
