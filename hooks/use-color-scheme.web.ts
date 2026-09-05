import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeStore, type ThemePreference } from '@/stores/theme';

export type ColorScheme = 'light' | 'dark';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme(): ColorScheme {
  const [hasHydrated, setHasHydrated] = useState(false);
  const rnColorScheme = useRNColorScheme();
  const preference = useThemeStore((state) => state.preference);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasHydrated(true);
  }, []);

  if (preference === 'dark') {
    return 'dark';
  }
  if (preference === 'light') {
    return 'light';
  }

  if (hasHydrated) {
    return rnColorScheme === 'dark' ? 'dark' : 'light';
  }

  return 'light';
}

export { useThemeStore };
export type { ThemePreference };
