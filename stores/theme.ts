import { create } from "zustand";
import { Appearance } from "react-native";
import {
  getThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@/lib/storage";

export type { ThemePreference };

export interface ThemeStore {
  preference: ThemePreference;
  isHydrated: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
  initTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: "system",
  isHydrated: false,
  setPreference: async (preference: ThemePreference) => {
    set({ preference });

    // Sync to Appearance native module so React Native's useColorScheme also reflects change
    try {
      if (typeof Appearance !== "undefined" && typeof Appearance.setColorScheme === "function") {
        Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
      }
    } catch {
      // Ignored if unsupported on specific platform
    }

    await saveThemePreference(preference);
  },
  initTheme: async () => {
    try {
      const saved = await getThemePreference();
      set({ preference: saved, isHydrated: true });
      if (typeof Appearance !== "undefined" && typeof Appearance.setColorScheme === "function") {
        Appearance.setColorScheme(saved === "system" ? "unspecified" : saved);
      }
    } catch {
      set({ isHydrated: true });
    }
  },
}));

// Hydrate preference from persistent storage immediately upon module load
useThemeStore.getState().initTheme();
