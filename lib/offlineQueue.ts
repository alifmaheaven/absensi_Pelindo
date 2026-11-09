import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import apiClient from "./axios";
import { getToken, saveCheckInId } from "./storage";
import { useAuthStore } from "@/stores/auth";
import {
  cleanupOrphanedEvidence,
  evidenceFileExists,
  isPersistedEvidence,
  persistEvidenceImage,
  removePersistedEvidence,
} from "./evidenceStorage";

const OFFLINE_QUEUE_KEY = "@offline_queue";
const FAILED_ATTENDANCE_KEY = "@failed_attendance_queue";
const CACHED_SITES_KEY = "@cached_attendance_sites";
const CACHED_STATUS_KEY = "@cached_attendance_statuses";

/** Jendela retensi item retryable dalam antrean (keputusan 2026-09-18: tetap 48 jam). */
const QUEUE_RETENTION_MS = 48 * 60 * 60 * 1000;

/**
 * WAVE-0 item 2 — notifikasi lokal saat item attendance kedaluwarsa dari
 * antrean (sync bisa terjadi saat aplikasi di latar; Alert tidak cukup).
 */
async function notifyAttendanceExpired(count: number): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Absensi Offline Kadaluarsa",
        body: `${count} data absensi belum berhasil terkirim setelah 48 jam dan dipindahkan ke daftar gagal di aplikasi. Data bukti masih tersimpan di perangkat — hubungi pengawas atau administrator Anda.`,
        ...(Platform.OS === "android" ? { channelId: "shift-reminders" } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + 2000),
      },
    });
  } catch (err) {
    console.warn("[OfflineQueue] Notifikasi kadaluarsa gagal:", err);
  }
}

export interface FailedAttendanceItem {
  id: string;
  /**
   * F-03: `STANDARD_REQUEST` ikut diizinkan sejak item bertipe itu ke
   * `/attendance/` tidak lagi boleh dibuang senyap (lihat
   * `mustNeverBeDroppedSilently`). Nilainya adalah tipe ASLI item antrean,
   * bukan label palsu — jenisnya dibaca manusia dari `data`/`errorMessage`.
   */
  type:
    | "ATTENDANCE_CHECKIN"
    | "ATTENDANCE_CHECKOUT"
    | "ATTENDANCE_EVIDENCE"
    | "STANDARD_REQUEST";
  data: OfflineCheckInPayload | OfflineCheckOutPayload | OfflineEvidenceRetryPayload | any;
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

/**
 * F-03 residual — apakah item ini menyentuh RECORD ABSENSI?
 *
 * `STANDARD_REQUEST` diperlakukan "non-kritis" di dua tempat dan dibuang hanya
 * dengan `console.warn`. Itu benar untuk request umum, tapi SALAH untuk absensi:
 * versi aplikasi <= 1.0.33 masih bisa meng-queue `POST/PUT /api/v2/attendance/`
 * sebagai STANDARD_REQUEST (cabang NetInfo yang sudah dihapus di
 * `services/attendance.ts`). Perangkat yang sudah punya item semacam itu di
 * storage akan kehilangan presensinya tanpa jejak saat item kena 4xx/409 atau
 * melewati 48 jam. Predikat ini membuat item tersebut mendapat perlakuan
 * setara absensi — masuk keranjang gagal, terlihat di banner merah.
 *
 * Dicocokkan pada path, bukan host, supaya tetap benar untuk baseURL apa pun.
 */
function isAttendanceRecordRequest(action: OfflineAction): boolean {
  if (action.type !== "STANDARD_REQUEST") return false;
  const url = typeof action.url === "string" ? action.url : "";
  return /\/attendance(\/|$|\?)/.test(url);
}

/** Perlakuan "jangan hilang senyap": record absensi, atau request ke record absensi. */
function mustNeverBeDroppedSilently(action: OfflineAction): boolean {
  return (
    action.type === "ATTENDANCE_CHECKIN" ||
    action.type === "ATTENDANCE_CHECKOUT" ||
    action.type === "ATTENDANCE_EVIDENCE" ||
    isAttendanceRecordRequest(action)
  );
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
 *
 * M-1 (verdict reviewer G.3): FAILURE ≠ EMPTY. `null` menandai blob gagal
 * dibaca/diparse atau bukan array. Sweep bukti yatim WAJIB menganggap null
 * sebagai "keep-set tidak lengkap" — menafsirkan gagal-baca sebagai [] akan
 * menghapus SEMUA bukti keranjang gagal secara senyap.
 */
async function readFailedAttendanceBucket(): Promise<{
  list: FailedAttendanceItem[] | null;
  malformed: boolean;
}> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(FAILED_ATTENDANCE_KEY);
  } catch {
    return { list: null, malformed: false };
  }
  if (!raw) return { list: [], malformed: false };
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list)
      ? { list, malformed: false }
      : { list: null, malformed: true };
  } catch {
    return { list: null, malformed: true };
  }
}

async function readAllFailedAttendance(): Promise<FailedAttendanceItem[] | null> {
  return (await readFailedAttendanceBucket()).list;
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
  if (list === null) {
    // M-1: tampilan banner tetap 'kosong' seperti sebelumnya, tapi gagal-baca
    // kini TERBEDA dari benar-benar kosong — yang menelan konsekuensi delete
    // ada di sweep, bukan di sini.
    console.warn(
      "[OfflineQueue] Keranjang gagal tidak terbaca — daftar tampil kosong; sweep bukti dihambat (M-1)",
    );
    return [];
  }

  const currentUserId = await resolveCurrentUserId();
  if (!currentUserId) return list;

  return list.filter((item) => {
    const owner = item?.owner_user_id;
    return !owner || String(owner) === String(currentUserId);
  });
}

/**
 * M-1: mengembalikan `true` bila blob lama harus dibuang/diganti (tidak
 * terbaca) ATAU penulisan itu sendiri gagal — artinya keep-set hasil
 * pembacaan berikutnya Parsial dan sweep bukti yatim wajib dilompati.
 * `false` = bucket sehat. Pemanggil lama yang mengabaikan nilai kembali
 * tetap kompil (boolean hanya berarti bagi sync yang menyapu).
 */
async function persistFailedAttendance(item: FailedAttendanceItem): Promise<{ incomplete: boolean; persisted: boolean }> {
  try {
    const { list: existing, malformed } = await readFailedAttendanceBucket();
    if (existing === null && !malformed) {
      console.error("[OfflineQueue] Keranjang gagal tidak dapat dibaca; write dibatalkan");
      return { incomplete: true, persisted: false };
    }
    if (malformed) {
      console.warn(
        "[OfflineQueue] Blob keranjang gagal korup — digantikan record baru; sweep bukti dilewati ronde ini (M-1)",
      );
    }
    const list = existing ?? [];
    list.push(item);
    await AsyncStorage.setItem(FAILED_ATTENDANCE_KEY, JSON.stringify(list));
    return { incomplete: malformed, persisted: true };
  } catch (e) {
    console.error("[OfflineQueue] Gagal menyimpan absensi gagal:", e);
    return { incomplete: true, persisted: false };
  }
}

export async function saveFailedAttendance(item: FailedAttendanceItem): Promise<boolean> {
  return (await persistFailedAttendance(item)).incomplete;
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
  localImages: { uri: string; name: string; type: string }[];
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
  /**
   * F-02 — grup bukti yang SUDAH dibuat untuk item ini (dibuat sekali, lalu
   * disimpan kembali ke record antrean).
   *
   * Sebelumnya grup dibuat ulang pada setiap percobaan: satu item yang gagal
   * N kali meninggalkan N grup + N salinan unggahan foto di server, dan
   * riwayat bukti satu absensi terpecah ke beberapa grup. Optional supaya
   * record lama (dan payload dari layar) tetap deserialisasi apa adanya.
   */
  evidence_group_id?: string;
}

export interface OfflineCheckOutPayload {
  attendance_id: string;
  user_name: string;
  evidence_group_id?: string;
  checkout: string; // WIB ISO timestamp
  checkout_latitude?: number;
  checkout_longitude?: number;
  description?: string;
  localImages: { uri: string; name: string; type: string }[];
}

export interface OfflineEvidenceRetryPayload {
  /** Nama untuk label evidence server-side. */
  user_name: string;
  /** Grup bukti SUDAH ada di server (dibuat jalur online/sync induk). */
  evidence_group_id: string;
  /** id attendance terkait (informasi pelaporan; bukan kunci link). */
  attendance_id?: string | null;
  /** Foto yang belum terkonfirmasi di server (uri persisten dari P0-0.6). */
  images: { uri: string; name: string; type: string }[];
}

export interface OfflineAction {
  id: string;
  type: "STANDARD_REQUEST" | "ATTENDANCE_CHECKIN" | "ATTENDANCE_CHECKOUT" | "ATTENDANCE_EVIDENCE";
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

/* ------------------------------------------------------------------------- *
 * F-01/F-02 (P0) — satu penulis antrean: mutex + commit PER ITEM
 *
 * `@offline_queue` adalah SATU kunci AsyncStorage yang dimutasi oleh empat
 * producer (`queueRequest`, `queueOfflineCheckIn`, `queueOfflineCheckOut`,
 * `queueOfflineEvidence`) dan oleh `syncQueuedRequests()`. Sebelum perubahan
 * ini setiap producer melakukan read-modify-write sendiri dan sync menulis
 * hasilnya SEKALI di akhir, dari snapshot yang diambil SEBELUM request HTTP
 * pertama. Item yang di-queue selagi sync berjalan (menit-an: 1 foto = 3
 * request) tidak ada di array yang ditulis-balik, jadi ia lenyap dari
 * perangkat tanpa log, tanpa error, tanpa banner — padahal pengguna sudah
 * melihat "Tersimpan Offline" dan pill sempat menghitung 1.
 *
 * Dua kontrol sekarang berlaku:
 *   1. `withQueueLock()` men-serialisasi setiap read-modify-write di konteks
 *      JS ini, sehingga tidak ada dua penulis yang saling menimpa;
 *   2. sync melakukan COMMIT PER ITEM (`commitQueueDelta`), bukan menulis
 *      snapshot seluruh antrean — jadi ia hanya bisa menyentuh item yang baru
 *      saja diselesaikannya. Apa pun yang di-queue selama ronde berjalan tidak
 *      tersentuh secara struktural, dan proses yang dibunuh di tengah sync
 *      tidak lagi memutar-ulang item yang sudah terkirim.
 *
 * `isSyncing` tetap ada dan tetap perlu: ia memblokir sync-vs-sync (dua ronde
 * paralel akan mem-POST dua kali), bukan producer-vs-sync.
 * ------------------------------------------------------------------------- */

/** Rantai tunggal yang men-serialisasi semua mutasi kunci antrean. */
let queueLock: Promise<unknown> = Promise.resolve();

/** Jalankan `fn` dengan kepemilikan eksklusif atas kunci antrean. */
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueLock.then(fn, fn);
  // Rantai harus selamat dari critical section yang reject; tanpa ini satu
  // kegagalan akan menyandera setiap penulis berikutnya di belakang promise
  // yang sudah rejected selamanya.
  queueLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * F-01/F-02 — satu-satunya penulisan yang dilakukan sync: sebuah DELTA, tidak
 * pernah snapshot.
 *
 * `removedIds` = item yang sudah selesai ronde ini (sukses / gagal / kedaluwarsa
 * / dibuang). `upsert` = item yang harus bertahan (item yang di-retry, atau
 * anak ATTENDANCE_EVIDENCE penggantinya). Sisanya di storage — item snapshot
 * yang belum diproses, item milik pengguna lain, dan terutama apa pun yang
 * di-queue SELAGI ronde ini berjalan — dipertahankan apa adanya.
 */
async function commitQueueDelta(delta: {
  removedIds: string[];
  upsert: OfflineAction[];
}): Promise<void> {
  await withQueueLock(async () => {
    const stored = await readQueueOrNull();
    if (stored === null) {
      // FAILURE ≠ EMPTY (disiplin yang sama dengan readAllFailedAttendance,
      // M-1): blob yang tidak terbaca TIDAK BOLEH ditulis-ulang menjadi
      // "hanya delta ini" — itu akan menghapus seluruh antrean.
      throw new Error("Antrean tidak terbaca — commit dibatalkan (FAILURE ≠ EMPTY)");
    }
    const removed = new Set(delta.removedIds);
    const upsertById = new Map(delta.upsert.map((a) => [a.id, a]));
    // URUTAN: item yang di-retry (ada di `removedIds` DAN di `upsert`) harus
    // TETAP DI POSISINYA, bukan dipindah ke belakang. Karena itu `upsert`
    // diperiksa LEBIH DULU daripada `removedIds` — kalau dibalik, item yang
    // di-retry akan terbuang lalu ditambahkan lagi di ujung antrean, dan urutan
    // presensi berubah dari perilaku pra-perbaikan.
    const next: OfflineAction[] = [];
    for (const storedItem of stored) {
      const replacement = upsertById.get(storedItem.id);
      if (replacement) {
        next.push(replacement); // bertahan, di posisi semula
        upsertById.delete(storedItem.id);
        continue;
      }
      if (removed.has(storedItem.id)) continue; // selesai ronde ini
      next.push(storedItem); // belum diproses / milik pengguna lain
    }
    // Anak bukti BARU (id belum ada di storage) masuk di belakang: ia pekerjaan
    // yang baru ditemukan ronde ini, jadi tidak menyalip item yang sudah menunggu.
    for (const item of delta.upsert) {
      if (upsertById.has(item.id)) next.push(item);
    }
    await saveQueue(next);
  });
}

/** Pembacaan mentah yang membedakan "kosong" dari "tidak terbaca". */
async function readQueueOrNull(): Promise<OfflineAction[] | null> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
      await withQueueLock(async () => {
        const stored = await readQueueOrNull();
        if (stored === null) return; // FAILURE ≠ EMPTY — jangan timpa blob rusak
        // F-01: stamping diterapkan ke storage TERKINI, bukan ke snapshot yang
        // dibaca sebelum lock — item yang lahir di sela itu tidak boleh hilang.
        // Aturannya identik dengan loop di atas; hanya basisnya yang bergeser.
        for (const action of stored) {
          if (getStampedOwner(action)) continue;
          const owner = getPayloadOwner(action) ?? sessionUserId;
          if (!owner) continue;
          action.owner_user_id = owner;
        }
        await saveQueue(stored);
      });
    } catch (e) {
      console.error("[OfflineQueue] Gagal menandai kepemilikan antrean lama:", e);
    }
  }
}

/**
 * Queue a standard HTTP request for later when offline
 */
export async function queueRequest(url: string, method: string, data?: any) {
  const owner = await currentOwnerStamp();
  const action: OfflineAction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "STANDARD_REQUEST",
    url,
    method: method.toUpperCase(),
    data,
    timestamp: Date.now(),
    owner_user_id: owner,
  };
  // F-01: read-modify-write di dalam mutex — tanpa ini sync yang sedang
  // berjalan dapat menulis-balik snapshot lamanya di atas item ini.
  await withQueueLock(async () => {
    const queue = await readQueueOrNull();
    if (queue === null) throw new Error("Antrean tidak terbaca — penyimpanan dibatalkan");
    queue.push(action);
    await saveQueue(queue);
  });
  return action.id;
}

/**
 * Queue an offline check-in with local images & coordinates
 */
export async function queueOfflineCheckIn(payload: OfflineCheckInPayload): Promise<string> {
  const owner = await currentOwnerStamp();
  const action: OfflineAction = {
    id: `checkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "ATTENDANCE_CHECKIN",
    data: payload,
    timestamp: Date.now(),
    owner_user_id: owner,
  };
  // F-01: lihat queueRequest — mutasi antrean WAJIB lewat mutex.
  await withQueueLock(async () => {
    const queue = await readQueueOrNull();
    if (queue === null) throw new Error("Antrean tidak terbaca — penyimpanan dibatalkan");
    queue.push(action);
    await saveQueue(queue);
  });
  return action.id;
}

/**
 * Queue an offline check-out with local images & coordinates
 */
export async function queueOfflineCheckOut(payload: OfflineCheckOutPayload): Promise<string> {
  const owner = await currentOwnerStamp();
  const action: OfflineAction = {
    id: `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "ATTENDANCE_CHECKOUT",
    data: payload,
    timestamp: Date.now(),
    owner_user_id: owner,
  };
  // F-01: lihat queueRequest — mutasi antrean WAJIB lewat mutex.
  await withQueueLock(async () => {
    const queue = await readQueueOrNull();
    if (queue === null) throw new Error("Antrean tidak terbaca — penyimpanan dibatalkan");
    queue.push(action);
    await saveQueue(queue);
  });
  return action.id;
}

/**
 * WAVE-0 P0-0.6 / CHECK-1 — antrean ULANG BUKTI (retry latar).
 *
 * Dipakai ketika record absensi SUDAH ada di server (atau grupnya sudah ada)
 * tetapi sebagian foto bukti gagal terunggah. Ini bukan request generik:
 * item-nya menyimpan daftar foto yang belum terkonfirmasi dan akan dicoba
 * ulang setiap sinkronisasi sampai tuntas atau kedaluwarsa (kebijakan 48 jam
 * yang sama, dengan SURFACING di A3).
 */
export async function queueOfflineEvidence(payload: OfflineEvidenceRetryPayload): Promise<string> {
  const owner = await currentOwnerStamp();
  const action: OfflineAction = {
    id: `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "ATTENDANCE_EVIDENCE",
    data: payload,
    timestamp: Date.now(),
    owner_user_id: owner,
  };
  // F-01: lihat queueRequest — mutasi antrean WAJIB lewat mutex.
  await withQueueLock(async () => {
    const queue = await readQueueOrNull();
    if (queue === null) throw new Error("Antrean tidak terbaca — penyimpanan dibatalkan");
    queue.push(action);
    await saveQueue(queue);
  });
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
 * WAVE-0 P0-0.6 / CHECK-1 — hasil bertipe tiga-arah agar pemanggil TIDAK
 * bisa lagi membedakan "berhasil" dari "bukti hilang di perangkat" secara
 * diam-diam:
 *  - ok      : file terunggah & ter-link ke grup bukti;
 *  - missing : file sudah tidak ada di perangkat (uri cache ter-evict) —
 *              tidak dapat di-retry, harus masuk keranjang gagal + LOUD;
 *  - error   : gagal upload (HTTP/timeout) — file masih ada, retry berguna.
 *
 * D-2 CHECK-2b: `ok`/`error` membawa `readUri` — uri HASIL promosi cache→
 * persisten bila promosi terjadi. Pemanggil WAJIB menulis-balikkannya ke
 * record antrean; menyimpannya di variabel lokal saja membuat file hasil
 * promosi yatim permanen (retry-child dan removePersistedEvidence tetap
 * menunjuk uri cache lama). `missing` tidak memuat readUri — tidak ada
 * file yang bisa dipromosikan.
 */
export type EvidenceUploadOutcome =
  | { status: "ok"; file: string; readUri: string }
  | { status: "missing" }
  | { status: "error"; readUri: string };

async function uploadLocalImage(
  img: { uri: string; name: string; type: string },
  groupId: string,
  userName: string,
  label: string
): Promise<EvidenceUploadOutcome> {
  if (!(await evidenceFileExists(img.uri))) {
    console.warn("[OfflineQueue] File bukti tidak ditemukan di perangkat:", img.uri);
    return { status: "missing" };
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

  try {
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
    if (!tempLink) return { status: "error", readUri };

    // 2. Upload permanent
    const permRes = await apiClient.post("/api/v2/attendance/upload-permanent", {
      links: [tempLink],
    });
    const permFile = permRes.data?.data?.links?.[0] || permRes.data?.links?.[0];
    if (!permFile) return { status: "error", readUri };

    // 3. Link to evidence group
    await apiClient.post("/evidence/", {
      name: `Attendance ${userName}`,
      description: label,
      file: permFile,
      evidence_group_id: groupId,
    });

    return { status: "ok", file: permFile, readUri };
  } catch (error) {
    if (__DEV__) console.debug("Error uploading offline image:", error);
    return { status: "error", readUri };
  }
}

/**
 * Accounting hasil upload bukti sebuah item (WAVE-0 CHECK-1).
 * TIDAK ada jalur "diam-diam": tiap foto berakhir di tepat satu keranjang —
 * uploaded (terkonfirmasi server), retry (gagal sementara, file masih ada),
 * atau lost (file sudah tidak ada di perangkat, tak dapat dipulihkan).
 */
async function uploadImagesWithAccounting(
  images: { uri: string; name: string; type: string }[],
  groupId: string,
  userName: string,
  label: string,
): Promise<{
  uploadedUris: string[];
  retryImages: { uri: string; name: string; type: string }[];
  lostImages: { uri: string; name: string; type: string }[];
}> {
  const uploadedUris: string[] = [];
  const retryImages: { uri: string; name: string; type: string }[] = [];
  const lostImages: { uri: string; name: string; type: string }[] = [];
  for (const img of images) {
    const outcome = await uploadLocalImage(img, groupId, userName, label);
    // D-2 CHECK-2b — TULIS-BALIK hasil promosi ke elemen record (referensi
    // yang sama dengan payload.localImages / images anak): tanpa ini, uri
    // persisten hanya hidup di variabel lokal → retry-child menunjuk cache
    // yang bisa ter-evict, dan salinan hasil promosi tidak pernah
    // di-removePersistedEvidence (file yatim permanen).
    if (outcome.status !== "missing" && outcome.readUri !== img.uri) {
      img.uri = outcome.readUri;
    }
    if (outcome.status === "ok") uploadedUris.push(img.uri);
    else if (outcome.status === "missing") lostImages.push(img);
    else retryImages.push(img);
  }
  return { uploadedUris, retryImages, lostImages };
}

function buildEvidenceAction(
  payload: OfflineEvidenceRetryPayload,
  ownerUserId?: string,
): OfflineAction {
  return {
    id: `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "ATTENDANCE_EVIDENCE",
    data: payload,
    timestamp: Date.now(),
    owner_user_id: ownerUserId,
  };
}

/** Ringkasan satu putaran sinkronisasi (WAVE-0: hasil tidak lagi sekadar angka). */
export interface SyncOutcome {
  /** Item yang TERKONFIRMASI PENUH oleh server (absensi + bukti, atau tanpa bukti). */
  synced: number;
  /** Foto bukti yang masih menunggu retry latar (item ATTENDANCE_EVIDENCE aktif). */
  evidenceRetrying: number;
  /** Foto bukti yang hilang permanen dari perangkat (masuk keranjang gagal). */
  evidenceLost: number;
  /** Foto retry yang akhirnya TUNTAS terkirim pada putaran ini. */
  evidenceResynced: number;
  /** Item attendance yang kedaluwarsa dari jendela 48 jam (masuk keranjang gagal). */
  expired: number;
}

/**
 * Sync queued requests when back online
 */
export async function syncQueuedRequests(): Promise<SyncOutcome> {
  const EMPTY: SyncOutcome = {
    synced: 0,
    evidenceRetrying: 0,
    evidenceLost: 0,
    evidenceResynced: 0,
    expired: 0,
  };
  if (isSyncing) return EMPTY;
  isSyncing = true;

  try {
    // MOB-02: with no bearer token nothing here can be authorised. Attempting
    // anyway would make the server answer 401 and quarantine real attendance
    // evidence into the "failed" bucket, so bail out before touching the queue.
    if (!(await hasStoredToken())) return EMPTY;

    // MOB-02: stamp pre-1.0.30 records before deciding who may submit them.
    await migrateLegacyQueueOwnership();

    // MOB-02: the identity this sync's requests will actually be attributed to.
    const currentUserId = await resolveCurrentUserId();

    const queue = await getQueue();
    if (!queue.length) return EMPTY;

    let synced = 0;
    let evidenceRetrying = 0;
    let evidenceLost = 0;
    let evidenceResynced = 0;
    let expiredAttendance = 0;
    // M-1: flag keep-set parsial — true bila ada penulisan keranjang gagal
    // yang harus mengganti blob tak terbaca / gagal tulis. Sweep yatim wajib
    // dilompati saat true (arah aman = SIMPAN).
    let failedBucketPartial = false;
    const newlyFailedAttendance: FailedAttendanceItem[] = [];

    for (const action of queue) {
      // F-01/F-02 — hasil ronde UNTUK ITEM INI, di-reset setiap iterasi.
      // `remaining` bukan lagi "seluruh isi antrean", melainkan "item yang
      // harus BERTAHAN dari aksi yang baru diproses ini": item yang di-retry
      // (id sama, payload sudah menyusut) dan anak bukti penggantinya (id baru).
      let remaining: OfflineAction[] = [];
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
        // TIDAK ada commit untuk item ini: `continue` melewati blok commit di
        // bawah, sehingga storage dibiarkan apa adanya. Item milik pengguna lain
        // harus tetap ada sampai pemiliknya masuk kembali (MOB-02).
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
        // Uri bukti yang terunggah putaran ini; baru boleh dihapus dari
        // perangkat SETELAH record induk dikonfirmasi server (lihat akhir
        // cabang check-in/check-out).
        let deferredEvidenceCleanup: string[] = [];

        if (action.type === "ATTENDANCE_CHECKIN") {
          const payload = action.data as OfflineCheckInPayload;
          const images = payload.localImages || [];

          // 1. Create Evidence Group — WAVE-0 CHECK-1: kegagalan TIDAK lagi
          // ditelan `catch {}`. Tanpa grup, POST attendance akan menghasilkan
          // "sukses" tanpa bukti sama sekali — biarkan error naik ke kebijakan
          // error umum di bawah (retryable / keranjang gagal), item tidak dibakar.
          let groupId = "";
          if (images.length) {
            // F-02 — percobaan ULANG memakai grup yang sudah dibuat, tidak
            // membuat grup baru. Tanpa ini setiap percobaan meninggalkan satu
            // grup + satu set unggahan duplikat di server.
            groupId = payload.evidence_group_id || "";
            if (!groupId) {
              const groupRes = await apiClient.post("/evidence-group/", {
                name: `Attendance ${payload.user_name}`,
                description: "Attendance evidence (Offline Sync)",
              });
              groupId = groupRes.data?.data?.id || groupRes.data?.id || "";
              if (!groupId) {
                throw new Error("Gagal membuat grup bukti (respons tanpa id)");
              }
              // Tulis-balik ke payload = objek yang sama dengan action.data,
              // jadi id ini ikut tersimpan pada jalur retry maupun keranjang
              // gagal (keduanya membawa action.data apa adanya).
              payload.evidence_group_id = groupId;
            }
          }

          // 2. Upload semua foto offline dengan akuntansi penuh (ok / retry / lost)
          let retryImages: OfflineEvidenceRetryPayload["images"] = [];
          let evidenceIssue = false; // ada bukti yang TIDAK terkonfirmasi putaran ini
          if (groupId && images.length) {
            const acc = await uploadImagesWithAccounting(
              images,
              groupId,
              payload.user_name,
              "Checkin Evidence (Offline Sync)",
            );
            // HAPUS HANYA SETELAH RECORD TERKONFIRMASI (lihat POST di bawah):
            // bila POST gagal, item parent di-requeue utuh dan fotonya masih
            // harus ada di perangkat untuk percobaan berikutnya.
            deferredEvidenceCleanup = acc.uploadedUris;
            retryImages = acc.retryImages;
            if (acc.lostImages.length) {
              evidenceIssue = true;
              const lostItem: FailedAttendanceItem = {
                id: `${action.id}_evidence`,
                type: "ATTENDANCE_CHECKIN",
                data: { ...payload, localImages: acc.lostImages },
                timestamp: action.timestamp,
                failedAt: Date.now(),
                errorCode: 0,
                errorMessage: `${acc.lostImages.length} foto bukti hilang dari perangkat sebelum sempat terunggah`,
                owner_user_id: getStampedOwner(action) ?? undefined,
              };
              const saved = await persistFailedAttendance(lostItem);
              failedBucketPartial = saved.incomplete || failedBucketPartial;
              if (!saved.persisted) remaining.push(action);
              else newlyFailedAttendance.push(lostItem);
              evidenceLost += acc.lostImages.length;
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
            // W2 regression fix: the `attendance` table requires `name`; the
            // backend supplies safe defaults for self-service callers. `code` is
            // deliberately omitted: PostgreSQL code_seq_attendance owns numbering
            // (AT001...), including offline retries. Old queued records may still
            // contain CHK-Date.now(); the server strips client code before INSERT.
            name: "attendance",
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
          // Record TERKONFIRMASI server — salinan lokal yang sudah terunggah
          // boleh dibuang sekarang (foto gagal tetap dipertahankan utk retry).
          await removePersistedEvidence(deferredEvidenceCleanup);
          // WAVE-0 CHECK-1 — record sudah diterima server, tapi bila masih ada
          // foto retry atau foto hilang, item TIDAK dihitung `synced`: bukti
          // yang bisa dipulihkan diserahkan ke anak ATTENDANCE_EVIDENCE dan
          // user diberi tahun LOUD ("absensi terkirim tanpa sebagian bukti").
          if (retryImages.length) {
            remaining.push(
              buildEvidenceAction(
                {
                  user_name: payload.user_name,
                  evidence_group_id: groupId,
                  attendance_id: createdId ?? null,
                  images: retryImages,
                },
                getStampedOwner(action) ?? undefined,
              ),
            );
            evidenceRetrying += retryImages.length;
          } else if (!evidenceIssue) {
            synced++;
          }
        } else if (action.type === "ATTENDANCE_CHECKOUT") {
          const payload = action.data as OfflineCheckOutPayload;
          const images = payload.localImages || [];

          // 1. Upload images ke grup bukti yang sudah ada (atau tanpa grup utk
          // baris lama: anak retry akan membuat grupnya saat sync).
          let retryImages: OfflineEvidenceRetryPayload["images"] = [];
          let evidenceIssue = false;
          if (images.length && payload.evidence_group_id) {
            const acc = await uploadImagesWithAccounting(
              images,
              payload.evidence_group_id,
              payload.user_name,
              "Checkout Evidence (Offline Sync)",
            );
            // HAPUS HANYA SETELAH RECORD TERKONFIRMASI (lihat PUT di bawah)
            deferredEvidenceCleanup = acc.uploadedUris;
            retryImages = acc.retryImages;
            if (acc.lostImages.length) {
              evidenceIssue = true;
              const lostItem: FailedAttendanceItem = {
                id: `${action.id}_evidence`,
                type: "ATTENDANCE_CHECKOUT",
                data: { ...payload, localImages: acc.lostImages },
                timestamp: action.timestamp,
                failedAt: Date.now(),
                errorCode: 0,
                errorMessage: `${acc.lostImages.length} foto bukti hilang dari perangkat sebelum sempat terunggah`,
                owner_user_id: getStampedOwner(action) ?? undefined,
              };
              const saved = await persistFailedAttendance(lostItem);
              failedBucketPartial = saved.incomplete || failedBucketPartial;
              if (!saved.persisted) remaining.push(action);
              else newlyFailedAttendance.push(lostItem);
              evidenceLost += acc.lostImages.length;
            }
          } else if (images.length) {
            // baris tanpa grup bukti (legacy) — semua foto ditahan utk grup baru
            retryImages = images;
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
          // Checkout TERKONFIRMASI server — buang salinan lokal yang sudah
          // terkonfirmasi (foto gagal dipertahankan utk retry anak).
          await removePersistedEvidence(deferredEvidenceCleanup);
          // WAVE-0 CHECK-1 — sama seperti check-in: checkout tercatat, bukti
          // susulan lewat anak antrean; tidak dilaporkan "synced" penuh bila
          // ada bukti yang belum terkonfirmasi server.
          if (retryImages.length) {
            remaining.push(
              buildEvidenceAction(
                {
                  user_name: payload.user_name,
                  evidence_group_id: payload.evidence_group_id || "",
                  attendance_id: payload.attendance_id,
                  images: retryImages,
                },
                getStampedOwner(action) ?? undefined,
              ),
            );
            evidenceRetrying += retryImages.length;
          } else if (!evidenceIssue) {
            synced++;
          }
        } else if (action.type === "ATTENDANCE_EVIDENCE") {
          const payload = action.data as OfflineEvidenceRetryPayload;
          let groupId = payload.evidence_group_id || "";
          const images = payload.images || [];

          if (!images.length) {
            // item kosong — tidak ada yang ditunggu; drop AMAN (tak ada bukti
            // yang dirujuk). BUKAN record absensi, jadi tidak menambah `synced`.
            // (sudah dihitung sebagai "bersih" oleh call-site lewat queue kosong)
          } else {
            if (!groupId) {
              const groupRes = await apiClient.post("/evidence-group/", {
                name: `Attendance ${payload.user_name}`,
                description: "Attendance evidence (Retry)",
              });
              groupId = groupRes.data?.data?.id || groupRes.data?.id || "";
              if (!groupId) {
                throw new Error("Gagal membuat grup bukti retry (respons tanpa id)");
              }
              payload.evidence_group_id = groupId;
            }
            const acc = await uploadImagesWithAccounting(
              images,
              groupId,
              payload.user_name,
              "Bukti Absensi (Unggah Ulang)",
            );
            await removePersistedEvidence(acc.uploadedUris);
            if (acc.lostImages.length) {
              const lostItem: FailedAttendanceItem = {
                id: `${action.id}_lost`,
                type: "ATTENDANCE_EVIDENCE",
                data: { ...payload, images: acc.lostImages },
                timestamp: action.timestamp,
                failedAt: Date.now(),
                errorCode: 0,
                errorMessage: `${acc.lostImages.length} foto bukti hilang dari perangkat sebelum sempat terunggah`,
                owner_user_id: getStampedOwner(action) ?? undefined,
              };
              const saved = await persistFailedAttendance(lostItem);
              failedBucketPartial = saved.incomplete || failedBucketPartial;
              if (!saved.persisted) remaining.push(action);
              else newlyFailedAttendance.push(lostItem);
              evidenceLost += acc.lostImages.length;
            }
            if (acc.retryImages.length) {
              payload.images = acc.retryImages; // coba lagi putaran sync berikutnya
              remaining.push(action);
              evidenceRetrying += acc.retryImages.length;
            } else if (acc.uploadedUris.length) {
              // seluruh foto retry tuntas — dihitung sebagai bukti pulih,
              // BUKAN `synced` (record absensi induk sudah dihitung saat itu)
              evidenceResynced += acc.uploadedUris.length;
            }
          }
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
          if (mustNeverBeDroppedSilently(action)) {
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
            const saved = await persistFailedAttendance(failedItem);
            failedBucketPartial = saved.incomplete || failedBucketPartial;
            if (!saved.persisted) remaining.push(action);
            else newlyFailedAttendance.push(failedItem);
            console.error(
              `[OfflineQueue] Absensi offline gagal permanen (status ${statusCode}):`,
              action.type,
              failedItem.errorMessage
            );
          } else {
            // STANDARD_REQUEST: Request umum non-kritis dibuang dengan peringatan log
            // karena tidak menyangkut rekaman bukti kerja / payroll pekerja lapangan.
            // (F-03: yang menyentuh /attendance/ sudah ditangani cabang di atas.)
            console.warn(
              `[OfflineQueue] Menghapus aksi non-retryable dari antrean (status ${statusCode}):`,
              action.type,
              (action as any).url || ""
            );
          }
        } else {
          // Retry bila masih dalam jendela retensi. WAVE-0 item 2 (keputusan
          // koordinator 2026-09-18): retensi TETAP 48 jam, tapi item attendance
          // yang melewatinya TIDAK dibuang senyap — SURFACE lewat keranjang
          // gagal + notifikasi lokal + field `expired` di outcome.
          const age = Date.now() - action.timestamp;
          if (age < QUEUE_RETENTION_MS) {
            remaining.push(action);
          } else if (mustNeverBeDroppedSilently(action)) {
            // WAVE-0 item 2 (keputusan koordinator 2026-09-18): jendela 48 jam
            // TETAP ada, tapi kejadiannya SURFACE — tidak pernah hilang senyap.
            // Jalur surfacing: (1) keranjang gagal -> banner OfflineBanner
            // (sudah menampilkan jumlah), (2) notifikasi lokal untuk saat sync
            // berjalan di latar, (3) Alert ringkasan di akhir putaran ini.
            const expiredItem: FailedAttendanceItem = {
              id: action.id,
              type: action.type,
              data: action.data,
              timestamp: action.timestamp,
              failedAt: Date.now(),
              errorCode: 0,
              errorMessage:
                "Belum berhasil terkirim setelah 48 jam — perangkat tidak terhubung kembali ke server",
              owner_user_id: getStampedOwner(action) ?? getPayloadOwner(action) ?? undefined,
            };
            const saved = await persistFailedAttendance(expiredItem);
            failedBucketPartial = saved.incomplete || failedBucketPartial;
            if (!saved.persisted) remaining.push(action);
            else newlyFailedAttendance.push(expiredItem);
            expiredAttendance++;
            console.error(
              "[OfflineQueue] Item attendance kadaluarsa 48 jam → keranjang gagal:",
              action.type,
            );
          } else {
            console.warn(
              "[OfflineQueue] STANDARD_REQUEST kadaluarsa 48 jam dibuang (non-critical):",
              action.url || "",
            );
          }
        }
      }

      // F-01/F-02 — COMMIT PER ITEM (bukan satu penulisan di akhir ronde).
      //
      // Hanya id item ini yang boleh hilang dari storage, dan hanya item ini
      // yang boleh ditulis ulang. Karena itu, apa pun yang di-queue pengguna
      // SELAGI ronde ini berjalan tidak dapat tersentuh: ia tidak ada di
      // `removedIds`, dan commitQueueDelta bekerja dari isi storage terkini.
      //
      // Ini juga yang membuat "sudah terkirim" tidak bisa diputar ulang: begitu
      // sebuah item selesai, ia langsung hilang dari storage. Proses yang
      // dibunuh setelah commit ini tidak akan mem-POST-nya lagi (sisa F-02 yang
      // menuntut idempotensi server-side dicatat di laporan, backend di luar
      // lingkup perubahan ini).
      try {
        await commitQueueDelta({ removedIds: [action.id], upsert: remaining });
      } catch (commitErr) {
        // FAILURE ≠ EMPTY: kegagalan menulis antrean TIDAK ditelan. Item ini
        // tetap ada di storage (akan dicoba lagi) dan jejaknya terlihat.
        console.error("[OfflineQueue] Commit antrean gagal:", commitErr);
      }
    }

    // WAVE-0 CHECK-2b — sapu file bukti yatim (hasil promosi uri lama / crash
    // sebelum upload) SETELAH antrean final tersimpan. keep = semua uri yang
    // masih dirujuk item aktif + keranjang gagal (bukti tinjauan admin).
    //
    // F-01: keep-set WAJIB dibaca dari STORAGE, bukan dari array yang disusun
    // ronde ini. Dua alasan, keduanya kehilangan data:
    //   1. item yang di-queue pengguna SELAGI sync berjalan tidak pernah lewat
    //      array ini — fotonya akan dianggap yatim lalu DIHAPUS dari perangkat;
    //   2. item milik pengguna lain (MOB-02) sengaja tidak disentuh ronde ini,
    //      jadi rujukannya juga tidak ada di array tersebut.
    // Baca-gagal (null) diperlakukan seperti M-1: arah aman = SIMPAN.
    try {
      const referenced: string[] = [];
      const storedQueue = await readQueueOrNull();
      const failedList = await readAllFailedAttendance();
      if (storedQueue === null) {
        console.warn("[OfflineQueue] Sweep bukti yatim DILEWAT — antrean tidak terbaca (FAILURE ≠ EMPTY)");
      } else if (failedList === null || failedBucketPartial) {
        // M-1: keranjang gagal gagal-terbaca (null) ATAU baru saja direpair
        // dari blob tak terbaca/gagal-tulis (parsial) ⇒ keep-set TIDAK
        // dipercaya. Arah aman = SIMPAN: lewati seluruh sweep, jangan pernah
        // menafsirkan 'gagal baca' sebagai 'kosong'.
        console.warn("[OfflineQueue] Sweep bukti yatim DILEWAT — keep-set tidak lengkap (M-1)");
      } else {
        for (const item of storedQueue) {
          const d: any = item.data || {};
          for (const img of d.localImages || d.images || []) referenced.push(img.uri);
        }
        for (const f of failedList) {
          const d: any = f?.data || {};
          for (const img of d.localImages || d.images || []) referenced.push(img.uri);
        }
        // Di titik ini masukan keep TERBUKTI lengkap: fungsi ini hanya lewat
        // gerbang queue non-empty (queue terbaca) dan bucket terbaca array.
        // referenced=[] berarti memang tidak ada rujukan sama sekali — 'sengaja
        // kosong' yang diizinkan lewat opsi eksplisit, bukan default buta.
        await cleanupOrphanedEvidence(referenced, { allowEmptyKeep: true });
      }
    } catch (cleanupErr) {
      if (__DEV__) console.debug("[OfflineQueue] cleanup bukti yatim gagal:", cleanupErr);
    }

    if (newlyFailedAttendance.length > 0) {
      const count = newlyFailedAttendance.length;
      const first = newlyFailedAttendance[0];
      // F-03: label harus JUJUR. Sebelumnya setiap tipe selain check-in/check-out
      // dilabeli "Bukti absensi"; untuk item STANDARD_REQUEST yang menyentuh
      // /attendance/ itu salah — yang gagal adalah RECORD ABSENSINYA, bukan
      // bukti. Label "Antrean lama" sekaligus menunjuk jalur yang melahirkannya
      // (cabang NetInfo pra-1.0.34), supaya admin tahu ini bukan jalur normal.
      const jenis =
        first.type === "ATTENDANCE_CHECKIN"
          ? "Check-in"
          : first.type === "ATTENDANCE_CHECKOUT"
            ? "Check-out"
            : first.type === "ATTENDANCE_EVIDENCE"
              ? "Bukti absensi"
              : "Antrean lama";
      const message =
        first.errorCode === 409
          ? `Data absensi (${jenis}) tidak dapat disinkronkan karena presensi untuk Hari Operasional ini sudah terdaftar di server (batas cut-off pukul 04:00 WIB). Bukti kerja Anda tetap tersimpan aman di perangkat.`
          : first.errorCode === 0
            ? count === 1
              ? `Data absensi offline (${jenis}) tidak dapat dikirim: ${first.errorMessage}. Bukti kerja tetap tersimpan di perangkat dan ditandai pada banner merah. Harap laporkan ke atasan/administrator.`
              : `${count} data absensi offline tidak dapat dikirim. Bukti kerja tetap tersimpan di perangkat dan ditandai pada banner merah. Harap laporkan ke atasan/administrator.`
            : count === 1
              ? `Data absensi offline (${jenis}) gagal disinkronkan ke server (Error ${first.errorCode}: ${first.errorMessage}). Bukti kerja Anda tetap tersimpan aman di perangkat. Harap laporkan ke atasan/administrator.`
              : `${count} data absensi offline gagal disinkronkan ke server. Bukti kerja Anda tetap tersimpan aman di perangkat. Harap laporkan ke atasan/administrator.`;

      Alert.alert("Perhatian: Sinkronisasi Absensi Gagal", message, [
        { text: "Mengerti" },
      ]);
    } else if (evidenceLost > 0) {
      // jalur LOUD khusus "terkirim tanpa sebagian bukti" tanpa kegagalan record
      Alert.alert(
        "Perhatian: Sebagian Bukti Belum Terkirim",
        `${evidenceLost} foto bukti tidak dapat diunggah (absensi tetap tercatat). Daftar tunggu tersimpan di perangkat; sebagian mungkin hilang permanen — cek kembali riwayat absensi Anda di layar Absensi.`,
        [{ text: "Mengerti" }],
      );
    }

    // WAVE-0 item 2 — kedaluwarsa 48 jam harus terdengar walau app di latar.
    // Di-AWAIT (bukan fire-and-forget) agar deterministic & teruji.
    if (expiredAttendance > 0) {
      await notifyAttendanceExpired(expiredAttendance);
    }

    return { synced, evidenceRetrying, evidenceLost, evidenceResynced, expired: expiredAttendance };
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
