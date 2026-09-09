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
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
              paddingBottom: 80 + Math.max(insets.bottom, 16),
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
                tintColor={isDark ? "#38bdf8" : colors.primary}
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
              paddingBottom: Math.max(insets.bottom, 16),
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

const makeStyles = (c: ThemeColors) =>
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
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    backButton: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 8,
    },
    titleWrap: {
      flex: 1,
    },
    titleText: {
      fontSize: 18,
      fontWeight: "700",
      color: c.textStrong,
    },
    subtitleText: {
      fontSize: 12,
      color: c.textSecondary,
      marginTop: 2,
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
