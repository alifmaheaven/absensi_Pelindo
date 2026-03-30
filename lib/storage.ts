import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "user_token";
const CHECKIN_ID_KEY = "checkin_id";

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
