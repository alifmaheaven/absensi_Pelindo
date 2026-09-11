/**
 * SINGLE SOURCE OF TRUTH untuk warna aplikasi (light & dark).
 * Bagian dari sistem tema resmi Expo: data di sini, hook di `hooks/use-theme-color.ts`.
 * Jangan hardcode warna di screen/komponen — pakai `useThemeColors()` / `useThemeColor()`.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    // — Kunci bawaan template Expo (dipakai ThemedText/ThemedView/modal) —
    text: '#333333',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // — Palet aplikasi (light = nilai literal yang sudah berjalan) —
    textStrong: '#1a1a1a',
    textSecondary: '#666666',
    textMuted: '#999999',
    textFaint: '#cccccc',
    /** Teks di atas gradient/permukaan berwarna — selalu putih di kedua mode */
    onGradient: '#ffffff',
    surface: '#f8f9fa',
    card: '#ffffff',
    inputBg: '#fafafa',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    primary: '#1D4ED8',
    primaryText: '#1E40AF',
    primarySoft: '#eff6ff',
    success: '#22c55e',
    successSoft: '#E8F5E9',
    warningSoft: '#FFF4E5',
    dangerSoft: '#FFE9E9',
    warning: '#f59e0b',
    danger: '#ef4444',
    overlay: 'rgba(0,0,0,0.5)',
    tabBar: '#ffffff',
  },
  dark: {
    // — Kunci bawaan template Expo —
    text: '#e0e0e0',
    background: '#121212',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // — Palet aplikasi (dark) —
    textStrong: '#ffffff',
    textSecondary: '#b3b3b3',
    textMuted: '#8f8f8f',
    textFaint: '#666666',
    onGradient: '#ffffff',
    surface: '#1e1e1e',
    card: '#2a2a2a',
    inputBg: '#2a2a2a',
    border: '#334155',
    borderStrong: '#475569',
    primary: '#60A5FA',
    primaryText: '#93C5FD',
    primarySoft: '#1E3A8A',
    success: '#4ade80',
    successSoft: '#12321f',
    warningSoft: '#3a2a10',
    dangerSoft: '#3a1515',
    warning: '#fbbf24',
    danger: '#f87171',
    overlay: 'rgba(0,0,0,0.7)',
    tabBar: '#1e1e1e',
  },
};

export type ThemeColors = typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});