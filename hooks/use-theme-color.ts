/**
 * SATU sistem tema aplikasi (pola resmi Expo).
 * - `useThemeColor(props, name)` — satu warna token, dengan override per-mode (pola lama, dipertahankan).
 * - `useThemeColors()` — seluruh palet mode aktif; dipakai screen/komponen pengganti hardcode warna.
 * - `useIsDarkTheme()` — boolean mode gelap (untuk StatusBar, gradient, dsb.).
 * - `useThemePreference()` — hook baca dan ubah preferensi tema ('system' | 'light' | 'dark').
 * Data token: `constants/theme.ts`. `lib/theme.ts` hanyalah wrapper deprecated.
 */

import { useMemo } from 'react';
import { Colors, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeStore, type ThemePreference } from '@/stores/theme';

export type { ThemeColors, ThemePreference };

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  // RN types may include "unspecified" — treat anything not dark as light
  const theme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}

/** Seluruh palet untuk mode aktif — memoized per pergantian scheme. */
export function useThemeColors(): ThemeColors {
  const theme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => Colors[theme], [theme]);
}

/** true bila device berada dalam mode gelap. */
export function useIsDarkTheme(): boolean {
  return useColorScheme() === 'dark';
}

/**
 * Hook untuk membaca dan mengubah preferensi tema ('system' | 'light' | 'dark').
 */
export function useThemePreference() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const isHydrated = useThemeStore((s) => s.isHydrated);

  return {
    preference,
    setPreference,
    isHydrated,
  };
}