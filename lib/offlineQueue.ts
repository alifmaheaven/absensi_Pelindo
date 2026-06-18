import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import apiClient from "./axios";

const OFFLINE_QUEUE_KEY = "@offline_queue";

interface OfflineAction {
  id: string;
  url: string;
  method: string;
  data?: any;
  timestamp: number;
}

let isSyncing = false;

async function getQueue(): Promise<OfflineAction[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: OfflineAction[]) {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Queue a request for later when offline
 */
export async function queueRequest(url: string, method: string, data?: any) {
  const queue = await getQueue();
  const action: OfflineAction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    method: method.toUpperCase(),
    data,
    timestamp: Date.now(),
  };
  queue.push(action);
  await saveQueue(queue);
  return action.id;
}

/**
 * Sync queued requests when back online
 */
export async function syncQueuedRequests(): Promise<number> {
  if (isSyncing) return 0;
  isSyncing = true;

  try {
    const queue = await getQueue();
    if (!queue.length) return 0;

    let synced = 0;
    const remaining: OfflineAction[] = [];

    for (const action of queue) {
      try {
        await apiClient({
          url: action.url,
          method: action.method,
          data: action.data,
          timeout: 15000,
        });
        synced++;
      } catch {
        // Keep failed items for retry (but drop if older than 24h)
        const age = Date.now() - action.timestamp;
        if (age < 24 * 60 * 60 * 1000) {
          remaining.push(action);
        }
      }
    }

    await saveQueue(remaining);
    return synced;
  } finally {
    isSyncing = false;
  }
}

/**
 * Start listening for connectivity changes and auto-sync
 */
export function startOfflineSync() {
  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      syncQueuedRequests();
    }
  });
}

/**
 * Get current offline queue length
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}
