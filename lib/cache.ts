import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@cache_';
const DEFAULT_TTL = 300_000; // 5 min

export async function writeCache<T>(key: string, data: T, ttl = DEFAULT_TTL) {
  await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, ttl, ts: Date.now() }));
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > entry.ttl) {
      await AsyncStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.data as T;
  } catch { return null; }
}

export async function clearCache(key?: string) {
  if (key) { await AsyncStorage.removeItem(PREFIX + key); return; }
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX));
  await AsyncStorage.multiRemove(keys);
}
