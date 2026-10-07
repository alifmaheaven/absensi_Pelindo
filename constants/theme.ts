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
    /** Contrast-checked fills for solid actions. */
    primaryAction: '#1D4ED8',
    primaryActionEnd: '#1E40AF',
    success: '#15803D',
    successText: '#166534',
    successSoft: '#E8F5E9',
    successAction: '#15803D',
    warning: '#B45309',
    warningSoft: '#FFF4E5',
    warningText: '#92400E',
    warningAction: '#B45309',
    danger: '#B91C1C',
    dangerSoft: '#FFE9E9',
    dangerText: '#B91C1C',
    dangerAction: '#B91C1C',
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
    /** Bright status accents stay separate from darker action fills. */
    primaryAction: '#1D4ED8',
    primaryActionEnd: '#1E40AF',
    success: '#4ade80',
    successText: '#4ADE80',
    successSoft: '#12321f',
    successAction: '#166534',
    warning: '#fbbf24',
    warningSoft: '#3a2a10',
    warningText: '#FCD34D',
    warningAction: '#92400E',
    danger: '#f87171',
    dangerSoft: '#3a1515',
    dangerText: '#FCA5A5',
    dangerAction: '#B91C1C',
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