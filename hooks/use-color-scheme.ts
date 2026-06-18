import { useColorScheme as RNUseColorScheme, Appearance } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@user_theme';

export function useColorScheme() {
  const systemTheme = RNUseColorScheme();
  const [userTheme, setUserTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') {
        setUserTheme(stored);
      }
    })();
  }, []);

  const activeTheme = userTheme || systemTheme || 'light';

  const setTheme = async (theme: 'light' | 'dark' | 'system') => {
    if (theme === 'system') {
      await AsyncStorage.removeItem(THEME_KEY);
      setUserTheme(null);
    } else {
      await AsyncStorage.setItem(THEME_KEY, theme);
      setUserTheme(theme);
    }
  };

  return { colorScheme: activeTheme, isDark: activeTheme === 'dark', setTheme, userTheme };
}
