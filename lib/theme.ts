/**
 * @deprecated WRAPPER KOMPATIBILITAS — jangan dipakai untuk kode baru.
 *
 * Satu sistem tema aplikasi kini:
 * - data token : `constants/theme.ts` (`Colors`, `ThemeColors`)
 * - hook       : `hooks/use-theme-color.ts` (`useThemeColor`, `useThemeColors`, `useIsDarkTheme`)
 *
 * File ini hanya re-export agar konsumen lama (`app/_layout.tsx`) tetap berjalan.
 */

import { Colors, type ThemeColors } from '@/constants/theme';

export const lightTheme = Colors.light;
export const darkTheme = Colors.dark;

export type Theme = ThemeColors;