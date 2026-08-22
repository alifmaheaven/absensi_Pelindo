import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import apiClient from "./axios";
import { saveCheckInId } from "./storage";

const OFFLINE_QUEUE_KEY = "@offline_queue";
const CACHED_SITES_KEY = "@cached_attendance_sites";
const CACHED_STATUS_KEY = "@cached_attendance_statuses";

export interface OfflineCheckInPayload {
  user_id: string;
  user_name: string;
  company_id?: string | null;
  site_id: string;
  checkin: string; // WIB ISO timestamp
  checkin_latitude: number;
  checkin_longitude: number;
  attendance_status_id: string;
  description?: string;
  localImages: Array<{ uri: string; name: string; type: string }>;
  tolerance?: number;
}

export interface OfflineCheckOutPayload {
  attendance_id: string;
  user_name: string;
  evidence_group_id?: string;
  checkout: string; // WIB ISO timestamp
  checkout_latitude?: number;
  checkout_longitude?: number;
  description?: string;
  localImages: Array<{ uri: string; name: string; type: string }>;
}

export interface OfflineAction {
  id: string;
  type: "STANDARD_REQUEST" | "ATTENDANCE_CHECKIN" | "ATTENDANCE_CHECKOUT";
  url?: string;
  method?: string;
  data?: any;
  timestamp: number;
}

let isSyncing = false;

export async function getQueue(): Promise<OfflineAction[]> {
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
 * Queue a standard HTTP request for later when offline
 */
export async function queueRequest(url: string, method: string, data?: any) {
  const queue = await getQueue();
  const action: OfflineAction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "STANDARD_REQUEST",
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
 * Queue an offline check-in with local images & coordinates
 */
export async function queueOfflineCheckIn(payload: OfflineCheckInPayload): Promise<string> {
  const queue = await getQueue();
  const action: OfflineAction = {
    id: `checkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "ATTENDANCE_CHECKIN",
    data: payload,
    timestamp: Date.now(),
  };
  queue.push(action);
  await saveQueue(queue);
  return action.id;
}

/**
 * Queue an offline check-out with local images & coordinates
 */
export async function queueOfflineCheckOut(payload: OfflineCheckOutPayload): Promise<string> {
  const queue = await getQueue();
  const action: OfflineAction = {
    id: `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "ATTENDANCE_CHECKOUT",
    data: payload,
    timestamp: Date.now(),
  };
  queue.push(action);
  await saveQueue(queue);
  return action.id;
}

/**
 * Cache and retrieve attendance sites locally for offline geofencing
 */
export async function cacheSites(sites: any[]) {
  try {
    if (sites && sites.length) {
      await AsyncStorage.setItem(CACHED_SITES_KEY, JSON.stringify(sites));
    }
  } catch {}
}

export async function getCachedSites(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_SITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Cache and retrieve attendance statuses locally
 */
export async function cacheAttendanceStatuses(statuses: any[]) {
  try {
    if (statuses && statuses.length) {
      await AsyncStorage.setItem(CACHED_STATUS_KEY, JSON.stringify(statuses));
    }
  } catch {}
}

export async function getCachedAttendanceStatuses(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_STATUS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Upload single local image file to server and link to evidence
 */
async function uploadLocalImage(
  img: { uri: string; name: string; type: string },
  groupId: string,
  userName: string,
  label: string
): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("files", {
      uri: img.uri,
      name: img.name || `offline_${Date.now()}.jpg`,
      type: img.type || "image/jpeg",
    } as any);

    // 1. Upload temp
    const tempRes = await apiClient.post("/attendance/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30000,
    });
    const tempLink = tempRes.data?.data?.[0]?.link || tempRes.data?.links?.[0];
    if (!tempLink) return null;

    // 2. Upload permanent
    const permRes = await apiClient.post("/attendance/upload-permanent", {
      links: [tempLink],
    });
    const permFile = permRes.data?.data?.links?.[0] || permRes.data?.links?.[0];
    if (!permFile) return null;

    // 3. Link to evidence group
    await apiClient.post("/evidence/", {
      name: `Attendance ${userName}`,
      description: label,
      file: permFile,
      evidence_group_id: groupId,
    });

    return permFile;
  } catch (error) {
    if (__DEV__) console.debug("Error uploading offline image:", error);
    return null;
  }
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
        if (action.type === "ATTENDANCE_CHECKIN") {
          const payload = action.data as OfflineCheckInPayload;

          // 1. Create Evidence Group
          let groupId = "";
          try {
            const groupRes = await apiClient.post("/evidence-group/", {
              name: `Attendance ${payload.user_name}`,
              description: "Attendance evidence (Offline Sync)",
            });
            groupId = groupRes.data?.data?.id || groupRes.data?.id || "";
          } catch {}

          // 2. Upload all offline images
          if (groupId && payload.localImages && payload.localImages.length) {
            for (const img of payload.localImages) {
              await uploadLocalImage(img, groupId, payload.user_name, "Checkin Evidence (Offline Sync)");
            }
          }

          // 3. Submit Attendance
          const attendancePayload: Record<string, any> = {
            user_id: payload.user_id,
            company_id: payload.company_id || null,
            site_id: payload.site_id,
            checkin: payload.checkin,
            checkin_latitude: payload.checkin_latitude,
            checkin_longitude: payload.checkin_longitude,
            attendance_status_id: payload.attendance_status_id,
            ...(payload.description ? { description: payload.description } : {}),
            ...(groupId ? { evidence_group_id: groupId } : {}),
          };

          const createRes = await apiClient.post("/attendance/", attendancePayload, {
            timeout: 20000,
          });
          const createdId = createRes.data?.data?.id || createRes.data?.id;
          if (createdId) {
            await saveCheckInId(createdId);
          }
          synced++;
        } else if (action.type === "ATTENDANCE_CHECKOUT") {
          const payload = action.data as OfflineCheckOutPayload;

          // 1. Upload new checkout images to existing evidence group if present
          if (payload.evidence_group_id && payload.localImages && payload.localImages.length) {
            for (const img of payload.localImages) {
              await uploadLocalImage(img, payload.evidence_group_id, payload.user_name, "Checkout Evidence (Offline Sync)");
            }
          }

          // 2. Update Attendance
          await apiClient.put(
            "/attendance/",
            {
              id: payload.attendance_id,
              checkout: payload.checkout,
              ...(payload.checkout_latitude ? { checkout_latitude: payload.checkout_latitude } : {}),
              ...(payload.checkout_longitude ? { checkout_longitude: payload.checkout_longitude } : {}),
              ...(payload.description ? { description: payload.description } : {}),
            },
            { timeout: 20000 }
          );
          synced++;
        } else {
          // STANDARD_REQUEST
          await apiClient({
            url: action.url,
            method: action.method,
            data: action.data,
            timeout: 15000,
          });
          synced++;
        }
      } catch (err) {
        // Keep failed items for retry (drop if older than 48h)
        const age = Date.now() - action.timestamp;
        if (age < 48 * 60 * 60 * 1000) {
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
