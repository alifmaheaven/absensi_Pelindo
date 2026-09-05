import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeStore, type ThemePreference } from '@/stores/theme';

export type ColorScheme = 'light' | 'dark';

/**
 * Hook to resolve active color scheme ('light' | 'dark')
 * - 'system': follows OS color scheme via useRNColorScheme()
 * - 'light': forces light mode
 * - 'dark': forces dark mode
 */
export function useColorScheme(): ColorScheme {
  const rnColorScheme = useRNColorScheme();
  const preference = useThemeStore((state) => state.preference);

  if (preference === 'dark') {
    return 'dark';
  }
  if (preference === 'light') {
    return 'light';
  }
  return rnColorScheme === 'dark' ? 'dark' : 'light';
}

export { useThemeStore };
export type { ThemePreference };
