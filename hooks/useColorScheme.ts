import { useState, useEffect, useCallback } from 'react';
import { useColorScheme as useRNColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColorScheme } from '@/lib/theme';

const THEME_KEY = '@theme_scheme';

export function useColorScheme() {
  const [scheme, setScheme] = useState<ThemeColorScheme>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setScheme(stored);
      } else {
        setScheme(useRNColorScheme() === 'dark' ? 'dark' : 'light');
      }
    });
  }, []);

  const toggleScheme = useCallback(async () => {
    const next = scheme === 'light' ? 'dark' : 'light';
    setScheme(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  }, [scheme]);

  const colorScheme = scheme;
  const isDark = scheme === 'dark';

  return { colorScheme, isDark, toggleScheme };
}
