import React, { useMemo } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
import { useTabBarInset } from "@/hooks/use-tab-bar-inset";

export interface ScreenContainerProps {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentPadding?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export default function ScreenContainer({
  title,
  subtitle,
  showBackButton = false,
  onBackPress,
  rightAction,
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  contentPadding = 16,
  style,
  contentContainerStyle,
}: ScreenContainerProps) {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const handleRefresh = () => {
    if (!onRefresh) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // safe fallback on unsupported hardware
    }
    onRefresh();
  };

  const hasHeader = Boolean(title || showBackButton || rightAction);

  return (
    <View style={[styles.container, style]}>
      {hasHeader && (
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: 12,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            {showBackButton && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={onBackPress}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Kembali"
              >
                <Ionicons name="arrow-back" size={22} color={colors.textStrong} />
              </TouchableOpacity>
            )}
            <View style={styles.titleWrap}>
              {title && <Text style={styles.titleText}>{title}</Text>}
              {subtitle && <Text style={styles.subtitleText}>{subtitle}</Text>}
            </View>
          </View>
          {rightAction && <View style={styles.rightActionWrap}>{rightAction}</View>}
        </View>
      )}

      {scrollable ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: contentPadding,
              paddingTop: hasHeader ? 12 : Math.max(insets.top, 12),
              paddingBottom: 24 + (tabInset || Math.max(insets.bottom, 16)),
            },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
                tintColor={colors.refreshTint}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.nonScrollContent,
            {
              paddingHorizontal: contentPadding,
              paddingTop: hasHeader ? 12 : Math.max(insets.top, 12),
              paddingBottom: 24 + (tabInset || Math.max(insets.bottom, 16)),
            },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors, isDark: boolean = false) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      backgroundColor: c.glassBar,
      borderBottomWidth: 1,
      borderBottomColor: c.glassBorder,
      shadowColor: c.shadowGlass,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.insetFill,
      borderWidth: 1,
      borderColor: c.insetBorder,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    titleWrap: {
      flex: 1,
    },
    titleText: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
      color: c.textStrong,
    },
    subtitleText: {
      fontSize: 12.5,
      color: c.textSecondary,
      marginTop: 2,
      fontWeight: "500",
    },
    rightActionWrap: {
      marginLeft: 12,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    nonScrollContent: {
      flex: 1,
    },
  });
