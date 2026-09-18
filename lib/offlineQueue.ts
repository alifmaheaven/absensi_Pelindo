import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Alert } from "react-native";
import apiClient from "./axios";
import { getToken, saveCheckInId } from "./storage";
import { useAuthStore } from "@/stores/auth";
import {
  evidenceFileExists,
  isPersistedEvidence,
  persistEvidenceImage,
  removePersistedEvidence,
} from "./evidenceStorage";

const OFFLINE_QUEUE_KEY = "@offline_queue";
const FAILED_ATTENDANCE_KEY = "@failed_attendance_queue";
const CACHED_SITES_KEY = "@cached_attendance_sites";
const CACHED_STATUS_KEY = "@cached_attendance_statuses";

export interface FailedAttendanceItem {
  id: string;
  type: "ATTENDANCE_CHECKIN" | "ATTENDANCE_CHECKOUT";
  data: OfflineCheckInPayload | OfflineCheckOutPayload;
  timestamp: number;
  failedAt: number;
  errorCode: number;
  errorMessage: string;
  /** MOB-02: owner of the queued evidence; see {@link OfflineAction.owner_user_id}. */
  owner_user_id?: string;
}

/* ------------------------------------------------------------------------- *
 * MOB-02 — queue ownership (shared-device identity isolation)
 *
 * The queue is a single AsyncStorage key (`@offline_queue`) shared by every
 * user of the device. Before this change nothing tied an item to the user who
 * created it, so on a shared port terminal user A could queue an offline
 * check-in, log out, and have the item submitted under user B's bearer token
 * on B's next sync. The server (attendanceControllers.ts:468) *forces*
 * `user_id = req.auth_data.id` for callers without `attendance_create`, so the
 * record was silently written against B — a confused-identity payroll write.
 *
 * Two independent controls now prevent that:
 *   1. every item is stamped with `owner_user_id` when it is queued;
 *   2. `syncQueuedRequests()` refuses to submit an item whose owner (stamp or
 *      payload `user_id`) is not the currently authenticated identity.
 *
 * Items belonging to another user are left untouched in the queue rather than
 * deleted — see `logout()` in stores/auth.ts for why we preserve them.
 * ------------------------------------------------------------------------- */

/**
 * Decode the `id` claim out of a JWT without verifying the signature.
 *
 * We deliberately read the token rather than only the auth store: the token is
 * exactly what the server will use to attribute the write
 * (`req.user = { id: auth_data.id }`, middlewares/authentication.ts), and it is
 * available on cold start before `getProfile()` has populated the store.
 */
function decodeJwtSubject(token: string): string | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;

    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

    let text: string;
    if (typeof atob === "function") {
      const raw = atob(padded);
      try {
        // UTF-8 safe decode of the binary string returned by atob.
        text = decodeURIComponent(
          Array.prototype.map
            .call(raw, (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
      } catch {
        text = raw;
      }
    } else {
      // Hermes has atob; this branch covers a JS engine that does not (e.g. a
      // Node test runner older than v16). `buffer` is already a dependency.
      const NodeBuffer = (globalThis as any).Buffer;
      if (typeof NodeBuffer?.from !== "function") return null;
      text = NodeBuffer.from(padded, "base64").toString("utf-8");
    }

    const payload = JSON.parse(text);
    const id = payload?.id ?? payload?.user_id ?? payload?.sub;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The identity the next outbound request will be attributed to.
 *
 * Order matters: the bearer token is authoritative (it is what the server
 * trusts); the zustand store is only a fallback for the window before the
 * profile fetch lands, and for the web/mocked-token path.
 */
export async function resolveCurrentUserId(): Promise<string | null> {
  try {
    const token = await getToken();
    if (token) {
      const fromToken = decodeJwtSubject(token);
      if (fromToken) return fromToken;
    }
  } catch {}

  try {
    const user = useAuthStore.getState().user as { id?: string; user_id?: string } | null;
    const id = user?.id ?? user?.user_id;
    if (typeof id === "string" && id.trim()) return id.trim();
  } catch {}

  return null;
}

/** Whether any bearer token is stored at all. */
async function hasStoredToken(): Promise<boolean> {
  try {
    return Boolean(await getToken());
  } catch {
    return false;
  }
}

/** The owner stamped on a queue item, if any. Never derived from the payload. */
function getStampedOwner(action: OfflineAction): string | null {
  const owner = action.owner_user_id;
  return typeof owner === "string" && owner.trim() ? owner.trim() : null;
}

/** The `user_id` carried inside a check-in payload, if any. */
function getPayloadOwner(action: OfflineAction): string | null {
  if (action.type !== "ATTENDANCE_CHECKIN") return null;
  const id = (action.data as OfflineCheckInPayload | undefined)?.user_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * May this queued item be submitted by the session identified by
 * `currentUserId`?
 *
 * Pure and exported so the rule can be asserted directly. It is used both by
 * `syncQueuedRequests()` (to decide what to POST) and by `getPendingCount()`
 * (to decide what to display), so the banner can never claim a sync is pending
 * for an item that sync would refuse to send.
 *
 * - Known session + mismatching owner  → false (the non-negotiable case).
 * - Unknown session (token present but unreadable) + stamped item → false:
 *   we cannot prove ownership, so we fail closed and leave it queued.
 * - Unknown session + unstamped item → true: this is the pre-1.0.30 shape and
 *   the only path that keeps an already-queued legacy item recoverable.
 */
export function isActionEligibleFor(
  action: OfflineAction,
  currentUserId: string | null
): boolean {
  const stampedOwner = getStampedOwner(action);
  const payloadOwner = getPayloadOwner(action);

  if (!currentUserId) {
    return !stampedOwner;
  }

  const current = String(currentUserId);
  if (stampedOwner && stampedOwner !== current) return false;
  if (payloadOwner && payloadOwner !== current) return false;
  return true;
}

/**
 * Raw, unfiltered read of the failed-attendance bucket.
 *
 * Writers MUST use this: `saveFailedAttendance` appends to the stored list, so
 * reading through the owner-filtered `getFailedAttendance()` would drop another
 * user's abandoned evidence on the next write.
 */
async function readAllFailedAttendance(): Promise<FailedAttendanceItem[]> {
  try {
    const raw = await AsyncStorage.getItem(FAILED_ATTENDANCE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * MOB-02: read the failed-attendance bucket.
 *
 * When the current session identity is known, items owned by somebody else are
 * hidden — B must not be shown a banner counting A's abandoned evidence. When
 * the identity cannot be resolved (pre-login, malformed token) nothing is
 * filtered, which preserves the previous behaviour exactly.
 */
export async function getFailedAttendance(): Promise<FailedAttendanceItem[]> {
  const list = await readAllFailedAttendance();

  const currentUserId = await resolveCurrentUserId();
  if (!currentUserId) return list;

  return list.filter((item) => {
    const owner = item?.owner_user_id;
    return !owner || String(owner) === String(currentUserId);
  });
}

export async function saveFailedAttendance(item: FailedAttendanceItem): Promise<void> {
  try {
    const list = await readAllFailedAttendance();
    list.push(item);
    await AsyncStorage.setItem(FAILED_ATTENDANCE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("[OfflineQueue] Gagal menyimpan absensi gagal:", e);
  }
}

export async function clearFailedAttendance(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FAILED_ATTENDANCE_KEY);
  } catch {}
}

export async function getFailedAttendanceCount(): Promise<number> {
  const failed = await getFailedAttendance();
  return failed.length;
}

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
  /**
   * Optional: the attendance row's `contract_id` (NOT NULL in the DB).
   *
   * Optional on purpose — a device that queued a check-in before this field
   * existed will not have it, and older clients never sent it at all. When it is
   * absent the SERVER derives it from the site or the user
   * (`attendanceControllers.ts`, self-service branch), so the check-in still
   * succeeds. It is sent when known so the row carries the contract that was
   * active at check-in time rather than whatever the site points at later.
   */
  contract_id?: string | null;
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
  /**
   * MOB-02: identity of the user who queued this item.
   *
   * Optional on purpose. Items written by app versions <= 1.0.29 have no such
   * field, and their existing AsyncStorage records must keep deserialising
   * unchanged (backward compatibility, see `migrateLegacyQueueOwnership`).
   */
  owner_user_id?: string;
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
 * MOB-02: best-effort owner stamp for a newly queued item.
 *
 * Returns `undefined` when no identity can be resolved, in which case the item
 * is written unstamped and `isActionEligibleFor` falls back to the payload's
 * own `user_id` (check-ins) — never to "whoever happens to be logged in".
 */
async function currentOwnerStamp(): Promise<string | undefined> {
  try {
    return (await resolveCurrentUserId()) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * MOB-02 migration — adopt queue items written by app versions <= 1.0.29.
 *
 * Those records have no `owner_user_id`. We stamp them **in place**, under the
 * same AsyncStorage key and the same JSON shape, so no existing queued data is
 * moved, rewritten into a new key, or orphaned:
 *
 * - a check-in carries the authoritative `data.user_id` → adopt that, whatever
 *   session is currently open. This is what stops an A-owned legacy check-in
 *   from being adopted by B after an upgrade.
 * - a check-out / standard request carries no user id → adopt the session
 *   identity resolved from the *stored bearer token*, i.e. the last user this
 *   device authenticated as. With no token we leave the item unstamped rather
 *   than guess.
 *
 * Idempotent, and only writes when something actually changed.
 *
 * Deferred entirely while no session identity can be resolved: stamping is only
 * useful if we can later compare the stamp against a known session, and
 * stamping an item under an unreadable token would make it unsubmittable.
 */
async function migrateLegacyQueueOwnership(): Promise<void> {
  let queue: OfflineAction[];
  try {
    queue = await getQueue();
  } catch {
    return;
  }
  if (!queue.length) return;
  if (!queue.some((a) => !getStampedOwner(a))) return;

  const sessionUserId = await resolveCurrentUserId();
  if (!sessionUserId) return;

  let changed = false;

  for (const action of queue) {
    if (getStampedOwner(action)) continue;
    const owner = getPayloadOwner(action) ?? sessionUserId;
    if (!owner) continue;
    action.owner_user_id = owner;
    changed = true;
  }

  if (changed) {
    try {
      await saveQueue(queue);
    } catch (e) {
      console.error("[OfflineQueue] Gagal menandai kepemilikan antrean lama:", e);
    }
  }
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
    owner_user_id: await currentOwnerStamp(),
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
    owner_user_id: await currentOwnerStamp(),
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
    owner_user_id: await currentOwnerStamp(),
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
 * Upload single local image file to server and link to evidence.
 *
 * WAVE-0 P0-0.6 — sebelum membaca file, pastikan:
 *  - file BENAR-BENAR ADA (cache uri lama yang sudah di-evict OS → return null;
 *    pemanggil WAJIB menangani null secara LOUD, tidak boleh diam-diam);
 *  - bila uri masih menunjuk cache (item yang di-queue sebelum fix ini),
 *    salin dulu ke penyimpanan persisten agar tahan retry berikutnya.
 */
async function uploadLocalImage(
  img: { uri: string; name: string; type: string },
  groupId: string,
  userName: string,
  label: string
): Promise<string | null> {
  try {
    if (!(await evidenceFileExists(img.uri))) {
      console.warn("[OfflineQueue] File bukti tidak ditemukan di perangkat:", img.uri);
      return null;
    }
    let readUri = img.uri;
    if (!isPersistedEvidence(readUri)) {
      try {
        readUri = await persistEvidenceImage(readUri);
      } catch (e) {
        // cache uri masih ada tapi gagal dipromosikan — lanjut upload dari cache
        console.warn("[OfflineQueue] Gagal persistensi bukti lama:", e);
      }
    }

    const formData = new FormData();
    formData.append("files", {
      uri: readUri,
      name: img.name || `offline_${Date.now()}.jpg`,
      type: img.type || "image/jpeg",
    } as any);

    // 1. Upload temp
    const tempRes = await apiClient.post("/api/v2/attendance/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30000,
    });
    const tempLink = tempRes.data?.data?.[0]?.link || tempRes.data?.links?.[0];
    if (!tempLink) return null;

    // 2. Upload permanent
    const permRes = await apiClient.post("/api/v2/attendance/upload-permanent", {
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
    // MOB-02: with no bearer token nothing here can be authorised. Attempting
    // anyway would make the server answer 401 and quarantine real attendance
    // evidence into the "failed" bucket, so bail out before touching the queue.
    if (!(await hasStoredToken())) return 0;

    // MOB-02: stamp pre-1.0.30 records before deciding who may submit them.
    await migrateLegacyQueueOwnership();

    // MOB-02: the identity this sync's requests will actually be attributed to.
    const currentUserId = await resolveCurrentUserId();

    const queue = await getQueue();
    if (!queue.length) return 0;

    let synced = 0;
    const remaining: OfflineAction[] = [];
    const newlyFailedAttendance: FailedAttendanceItem[] = [];

    for (const action of queue) {
      // MOB-02 — the non-negotiable control.
      //
      // On a shared device user A can queue a check-in offline and log out. The
      // queue is a single AsyncStorage key, so B's session would otherwise pick
      // A's item up and POST it under B's bearer token. The backend forces
      // `user_id = req.auth_data.id` for callers without `attendance_create`
      // (attendanceControllers.ts:468), so the row would be written against B:
      // a confused-identity payroll record, and A's real check-in silently lost.
      //
      // We keep the item instead of deleting or failing it, so it is still there
      // when its rightful owner logs back in on this device.
      if (!isActionEligibleFor(action, currentUserId)) {
        remaining.push(action);
        console.warn(
          "[OfflineQueue] Melewati antrean milik pengguna lain (MOB-02):",
          action.type,
          "pemilik:",
          action.owner_user_id ?? getPayloadOwner(action) ?? "(tidak diketahui)",
          "sesi:",
          currentUserId ?? "(tidak diketahui)"
        );
        continue;
      }

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
          // OBS-V1 / MOB-01: the server contract for POST /attendance/ is
          // `latitude` / `longitude` (see backend/src/controllers/attendanceControllers.ts
          // and the online path in app/(no-tabs)/checkin.tsx). Sending
          // `checkin_latitude` / `checkin_longitude` made the server see
          // `latitude === undefined`, so the geofence gate never fired and the
          // row was written with no coordinates at all. Use the server keys here.
          //
          // NOTE: `checkin_latitude` remains the key of the *local* queue payload
          // type (OfflineCheckInPayload) and of the AsyncStorage record, so that
          // already-queued records on users' devices keep deserialising unchanged.
          // Only the outbound HTTP body is translated to the server contract.
          const attendancePayload: Record<string, any> = {
            user_id: payload.user_id,
            company_id: payload.company_id || null,
            site_id: payload.site_id,
            checkin: payload.checkin,
            latitude: payload.checkin_latitude,
            longitude: payload.checkin_longitude,
            attendance_status_id: payload.attendance_status_id,
            // W2 REGRESSION FIX (2026-09-15): the `attendance` table has NOT NULL
            // constraints on `name` and `code`, and the SERVER does not derive them
            // for a self-service caller — its defaults live inside the
            // `if (hasCreate)` branch, and the self-service `else` branch only forces
            // `user_id`. The online path supplies both (`checkin.tsx`); this offline
            // path did not, so a queued check-in failed with
            //   400 "null value in column \"name\" ... violates not-null constraint"
            // and then retried indefinitely — the same false "will sync
            // automatically" promise that OBS-V1 was raised to eliminate. Mirror the
            // online path exactly. Verified live against production before/after.
            name: "attendance",
            code: `CHK-${Date.now()}`,
            ...(payload.contract_id ? { contract_id: payload.contract_id } : {}),
            ...(payload.description ? { description: payload.description } : {}),
            ...(groupId ? { evidence_group_id: groupId } : {}),
          };

          const createRes = await apiClient.post("/api/v2/attendance/", attendancePayload, {
            timeout: 20000,
          });
          const createdId = createRes.data?.data?.id || createRes.data?.id;
          if (createdId) {
            await saveCheckInId(createdId);
          }
          // WAVE-0 P0-0.6 — server sudah menerima record; salinan persisten lokal
          // tidak diperlukan lagi.
          await removePersistedEvidence((payload.localImages || []).map((i) => i.uri));
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
            "/api/v2/attendance/",
            {
              id: payload.attendance_id,
              checkout: payload.checkout,
              ...(payload.checkout_latitude ? { checkout_latitude: payload.checkout_latitude } : {}),
              ...(payload.checkout_longitude ? { checkout_longitude: payload.checkout_longitude } : {}),
              ...(payload.description ? { description: payload.description } : {}),
            },
            { timeout: 20000 }
          );
          // WAVE-0 P0-0.6 — checkout diterima server; bersihkan salinan lokal.
          await removePersistedEvidence((payload.localImages || []).map((i) => i.uri));
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
      } catch (err: any) {
        // Drop non-retryable 4xx errors (409 Conflict, 403 Forbidden, 401 Unauthorized, 422 Unprocessable)
        // Request ini tidak akan pernah berhasil bila diulang tanpa perubahan izin di server / relogin / pergantian hari operasional.
        // Mencegah perulangan retry tak terbatas (infinite retry storm) yang membanjiri server dan menghabiskan baterai/kuota.
        const statusCode =
          err?.code ||
          err?.status ||
          err?.response?.status;

        const isNonRetryable =
          statusCode === 409 ||
          statusCode === 403 ||
          statusCode === 401 ||
          statusCode === 422;

        if (isNonRetryable) {
          if (action.type === "ATTENDANCE_CHECKIN" || action.type === "ATTENDANCE_CHECKOUT") {
            // JANGAN HAPUS BUKTI KERJA DIAM-DIAM!
            // Pindahkan ke penampung absensi gagal permanen agar data kehadiran lapangan tidak hilang
            // dan tidak di-retry berulang (mencegah retry storm).
            const defaultConflictMsg = "Presensi untuk Hari Operasional ini sudah terdaftar (cut-off pukul 04:00 WIB).";
            const failedItem: FailedAttendanceItem = {
              id: action.id,
              type: action.type,
              data: action.data,
              timestamp: action.timestamp,
              failedAt: Date.now(),
              errorCode: statusCode,
              errorMessage:
                statusCode === 409
                  ? err?.message || defaultConflictMsg
                  : err?.message || "Non-retryable 4xx error",
              // MOB-02: keep the failed bucket owner-scoped too, so B never reads
              // a count or a banner describing A's abandoned evidence.
              owner_user_id: getStampedOwner(action) ?? getPayloadOwner(action) ?? undefined,
            };
            await saveFailedAttendance(failedItem);
            newlyFailedAttendance.push(failedItem);
            console.error(
              `[OfflineQueue] Absensi offline gagal permanen (status ${statusCode}):`,
              action.type,
              failedItem.errorMessage
            );
          } else {
            // STANDARD_REQUEST: Request umum non-kritis dibuang dengan peringatan log
            // karena tidak menyangkut rekaman bukti kerja / payroll pekerja lapangan.
            console.warn(
              `[OfflineQueue] Menghapus aksi non-retryable dari antrean (status ${statusCode}):`,
              action.type,
              (action as any).url || ""
            );
          }
        } else {
          // Simpan item gagal untuk di-retry nanti (buang jika lebih tua dari 48 jam)
          const age = Date.now() - action.timestamp;
          if (age < 48 * 60 * 60 * 1000) {
            remaining.push(action);
          }
        }
      }
    }

    await saveQueue(remaining);

    if (newlyFailedAttendance.length > 0) {
      const count = newlyFailedAttendance.length;
      const first = newlyFailedAttendance[0];
      const jenis = first.type === "ATTENDANCE_CHECKIN" ? "Check-in" : "Check-out";
      const message =
        first.errorCode === 409
          ? `Data absensi (${jenis}) tidak dapat disinkronkan karena presensi untuk Hari Operasional ini sudah terdaftar di server (batas cut-off pukul 04:00 WIB). Bukti kerja Anda tetap tersimpan aman di perangkat.`
          : count === 1
          ? `Data absensi offline (${jenis}) gagal disinkronkan ke server (Error ${first.errorCode}: ${first.errorMessage}). Bukti kerja Anda tetap tersimpan aman di perangkat. Harap laporkan ke atasan/administrator.`
          : `${count} data absensi offline gagal disinkronkan ke server. Bukti kerja Anda tetap tersimpan aman di perangkat. Harap laporkan ke atasan/administrator.`;

      Alert.alert("Perhatian: Sinkronisasi Absensi Gagal", message, [
        { text: "Mengerti" },
      ]);
    }

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
 *
 * MOB-02: counts only the items this session is actually allowed to submit, so
 * the offline banner can never promise a sync that `syncQueuedRequests()` will
 * refuse to perform. With no resolvable identity we report the whole queue,
 * which is the pre-1.0.30 behaviour.
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  const currentUserId = await resolveCurrentUserId();
  if (!currentUserId) return queue.length;
  return queue.filter((action) => isActionEligibleFor(action, currentUserId)).length;
}
