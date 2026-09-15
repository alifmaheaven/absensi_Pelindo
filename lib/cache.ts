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

/**
 * MOB-02 sibling-leak sweep: remove every AsyncStorage key starting with any of
 * the given prefixes.
 *
 * `clearCache()` above only knows the `@cache_` namespace, so any user-specific
 * data written under a different prefix survives logout on a shared device.
 * This helper exists so `logout()` can purge those namespaces without knowing
 * the exact keys (several are keyed dynamically, e.g. `@dr_draft_<id>_<date>`).
 *
 * It removes only keys that match a prefix it was explicitly given — it is not
 * a blanket wipe, so device-level preferences (theme, notification rationale)
 * and non-user-specific reference caches (sites, attendance statuses) survive.
 */
export async function clearStorageByPrefixes(prefixes: string[]) {
  if (!prefixes.length) return;
  const keys = (await AsyncStorage.getAllKeys()).filter(k =>
    prefixes.some(p => k.startsWith(p))
  );
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
