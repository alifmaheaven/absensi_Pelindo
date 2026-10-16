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
    // — Kunci bawaan template Expo —
    text: '#0F172A',
    background: '#F8FAFC',
    tint: '#2563EB',
    icon: '#64748B',
    tabIconDefault: '#64748B',
    tabIconSelected: '#2563EB',
    // — Palet aplikasi Apple Liquid Glass (Light) —
    textStrong: '#020617',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    textFaint: '#CBD5E1',
    /** Teks di atas gradient/permukaan berwarna — selalu putih di kedua mode */
    onGradient: '#ffffff',
    surface: '#F1F5F9',
    card: '#ffffff',
    inputBg: '#F8FAFC',
    border: 'rgba(226, 232, 240, 0.85)',
    borderStrong: '#CBD5E1',
    primary: '#2563EB',
    primaryText: '#1E40AF',
    primarySoft: '#EFF6FF',
    /** Contrast-checked fills for solid actions (WCAG >= 4.5). */
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
    overlay: 'rgba(15, 23, 42, 0.45)',
    tabBar: 'rgba(255, 255, 255, 0.94)',
    // — Liquid Glass Tokens —
    // Permukaan
    glassCard: '#FFFFFF',
    glassCardSubtle: '#F8FAFC',
    glassSheet: '#FFFFFF',
    glassChip: '#F1F5F9',
    glassBar: '#FFFFFF',
    glassBarBlur: 'rgba(255, 255, 255, 0.75)',
    // Garis tepi
    glassBorder: 'rgba(226, 232, 240, 0.65)',
    glassBorderSubtle: 'rgba(226, 232, 240, 0.45)',
    glassSheetBorder: 'rgba(226, 232, 240, 0.65)',
    glassSpecular: 'rgba(255, 255, 255, 1.0)',
    // Kontrol di atas gradient header (selalu di atas biru)
    glassOnGradient: 'rgba(255, 255, 255, 0.22)',
    glassOnGradientBorder: 'rgba(255, 255, 255, 0.40)',
    // Aksen biru
    glassGlow: 'rgba(37, 99, 235, 0.12)',
    accentBlue: '#2563EB',
    accentBlueGlow: 'rgba(37, 99, 235, 0.22)',
    accentBlueDeep: '#1E40AF',
    accentPill: 'rgba(37, 99, 235, 0.12)',
    accentPillBorder: 'rgba(37, 99, 235, 0.28)',
    accentSoft: 'rgba(37, 99, 235, 0.10)',
    accentSoftBorder: 'rgba(37, 99, 235, 0.15)',
    // Status
    dangerGlass: 'rgba(254, 242, 242, 0.90)',
    dangerGlassBorder: 'rgba(239, 68, 68, 0.22)',
    warningBorder: '#D97706',
    // Lain-lain
    insetFill: 'rgba(0, 0, 0, 0.04)',
    insetBorder: 'rgba(0, 0, 0, 0.06)',
    shadowGlass: '#0F275A',
    refreshTint: '#2563EB',
    // Viewer foto layar penuh: latar selalu hitam di kedua tema
    viewerBackdrop: '#000000',
    viewerScrim: 'rgba(0, 0, 0, 0.95)',
    dangerOnDark: '#FF4D4F',
  },
  dark: {
    // — Kunci bawaan template Expo —
    text: '#F1F5F9',
    background: '#070D18', // Deep Midnight Sapphire
    tint: '#60A5FA',
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: '#60A5FA',
    // — Palet aplikasi Apple Liquid Glass (Dark) —
    textStrong: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textFaint: '#334155',
    onGradient: '#ffffff',
    surface: '#0F1B2E',
    card: '#132238',
    inputBg: '#0D182A',
    border: 'rgba(255, 255, 255, 0.09)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    primary: '#3B82F6',
    primaryText: '#93C5FD',
    primarySoft: '#1E3A8A',
    /** Bright status accents stay separate from darker action fills (WCAG >= 4.5). */
    primaryAction: '#1D4ED8',
    primaryActionEnd: '#1E40AF',
    success: '#4ADE80',
    successText: '#4ADE80',
    successSoft: '#12321F',
    successAction: '#166534',
    warning: '#FCD34D',
    warningSoft: '#3A2A10',
    warningText: '#FCD34D',
    warningAction: '#92400E',
    danger: '#FCA5A5',
    dangerSoft: '#3A1515',
    dangerText: '#FCA5A5',
    dangerAction: '#B91C1C',
    overlay: 'rgba(3, 7, 18, 0.78)',
    tabBar: 'rgba(11, 20, 35, 0.94)',
    // — Liquid Glass Tokens —
    // Permukaan
    glassCard: 'rgba(15, 27, 46, 0.72)',
    glassCardSubtle: 'rgba(9, 18, 33, 0.65)',
    glassSheet: 'rgba(15, 27, 46, 0.96)',
    glassChip: 'rgba(255, 255, 255, 0.08)',
    glassBar: 'rgba(7, 13, 24, 0.94)',
    glassBarBlur: 'rgba(7, 13, 24, 0.50)',
    // Garis tepi
    glassBorder: 'rgba(255, 255, 255, 0.12)',
    glassBorderSubtle: 'rgba(59, 130, 246, 0.18)',
    glassSheetBorder: 'rgba(255, 255, 255, 0.14)',
    glassSpecular: 'rgba(255, 255, 255, 0.24)',
    // Kontrol di atas gradient header (selalu di atas biru)
    glassOnGradient: 'rgba(255, 255, 255, 0.12)',
    glassOnGradientBorder: 'rgba(255, 255, 255, 0.22)',
    // Aksen biru
    glassGlow: 'rgba(59, 130, 246, 0.24)',
    accentBlue: '#3B82F6',
    accentBlueGlow: 'rgba(59, 130, 246, 0.35)',
    accentBlueDeep: '#1D4ED8',
    accentPill: 'rgba(59, 130, 246, 0.22)',
    accentPillBorder: 'rgba(96, 165, 250, 0.40)',
    accentSoft: 'rgba(59, 130, 246, 0.16)',
    accentSoftBorder: 'rgba(59, 130, 246, 0.30)',
    // Status
    dangerGlass: 'rgba(239, 68, 68, 0.12)',
    dangerGlassBorder: 'rgba(248, 113, 113, 0.30)',
    warningBorder: '#B45309',
    // Lain-lain
    insetFill: 'rgba(255, 255, 255, 0.06)',
    insetBorder: 'rgba(255, 255, 255, 0.12)',
    shadowGlass: '#000000',
    refreshTint: '#38BDF8',
    // Viewer foto layar penuh: latar selalu hitam di kedua tema
    viewerBackdrop: '#000000',
    viewerScrim: 'rgba(0, 0, 0, 0.95)',
    dangerOnDark: '#FF4D4F',
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