import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const TOKEN_KEY = "user_token";
const CHECKIN_ID_KEY = "checkin_id";
const VERSION_CODE_KEY = "last_version_code";

export async function saveToken(token: string) {
  if (Platform.OS === "web") {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function removeToken() {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function saveCheckInId(checkInId: string) {
  if (Platform.OS === "web") {
    try { localStorage.setItem(CHECKIN_ID_KEY, checkInId); } catch (e) {}
    return;
  }
  await SecureStore.setItemAsync(CHECKIN_ID_KEY, checkInId);
}

export async function getCheckInId(): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(CHECKIN_ID_KEY); } catch (e) { return null; }
  }
  return await SecureStore.getItemAsync(CHECKIN_ID_KEY);
}

export async function removeCheckInId() {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(CHECKIN_ID_KEY); } catch (e) {}
    return;
  }
  await SecureStore.deleteItemAsync(CHECKIN_ID_KEY);
}

export async function saveVersionCode(code: string) {
  if (Platform.OS === "web") {
    try { localStorage.setItem(VERSION_CODE_KEY, code); } catch (e) {}
    return;
  }
  await SecureStore.setItemAsync(VERSION_CODE_KEY, code);
}

export async function getVersionCode(): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(VERSION_CODE_KEY); } catch (e) { return null; }
  }
  return await SecureStore.getItemAsync(VERSION_CODE_KEY);
}

export async function removeVersionCode() {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(VERSION_CODE_KEY); } catch (e) {}
    return;
  }
  await SecureStore.deleteItemAsync(VERSION_CODE_KEY);
}

export type ThemePreference = "system" | "light" | "dark";
const THEME_PREFERENCE_KEY = "@app_theme_mode";

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(THEME_PREFERENCE_KEY, preference); } catch {}
    return;
  }
  try {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch (e) {
    console.error("[Storage] Failed to save theme preference:", e);
  }
}

export async function getThemePreference(): Promise<ThemePreference> {
  if (Platform.OS === "web") {
    try {
      const val = localStorage.getItem(THEME_PREFERENCE_KEY);
      if (val === "system" || val === "light" || val === "dark") return val;
    } catch {}
    return "system";
  }
  try {
    const val = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
    if (val === "system" || val === "light" || val === "dark") {
      return val;
    }
    return "system";
  } catch {
    return "system";
  }
}
