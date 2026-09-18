/**
 * WAVE-0 CHECK-3 (UIUX-27) — komposisi integritas bukti pada jalur sync.
 *
 * Kunci permanen yang diminta UI/UX:
 *   1. "bukti hilang saat sync → record TIDAK dihitung synced": item
 *      ATTENDANCE_CHECKIN/ATTENDANCE_CHECKOUT yang sebagian fotonya sudah
 *      tidak ada di perangkat TETAP mengirim absensi (prioritas record),
 *      tapi hasilnya dilaporkan sebagai `evidenceLost`, masuk keranjang
 *      gagal, dan memunculkan Alert — BUKAN `synced++` yang melaporkan
 *      keberhasilan penuh.
 *   2. Kegagalan SEMENTARA (file ada, HTTP gagal) melahirkan anak antrean
 *      ATTENDANCE_EVIDENCE dengan owner stamp — retry latar, bukan dibuang.
 *   3. Jalur promosi uri cache lama (item ter-queue sebelum upgrade) ikut
 *      tercakup lewat klaim persistEvidenceImage.
 *   4. `cleanupOrphanedEvidence` punya tepat satu pemanggil produksi:
 *      dipanggil di akhir sync (CHECK-2b).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import apiClient from "../lib/axios";
import * as evidenceStorageMock from "../lib/evidenceStorage";
import {
  getFailedAttendance,
  getQueue,
  syncQueuedRequests,
  type OfflineAction,
} from "../lib/offlineQueue";

let mockToken: string | null = null;

// Notifikasi lokal utk item kedaluwarsa (item 2 WAVE-0) — divisikan lewat mock.
const mockScheduleNotification = jest.fn(async (_payload?: unknown): Promise<string> => "notif-1");

/** State filesystem tiruan yang bisa diatur per-skenario. */
const mockEvidenceState = {
  /** uri -> ada/tidaknya file di perangkat (default: ada). */
  exists: new Map<string, boolean>(),
  /** uri yang dipromosikan dari cache ke penyimpanan persisten. */
  promoted: [] as string[],
  /** uri yang dihapus (terkonfirmasi server / keputusan user). */
  removed: [] as string[],
  /** daftar `keep` setiap panggilan cleanup yatim. */
  cleanupKeep: [] as string[],
};

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(),
}));

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: (payload: unknown) => mockScheduleNotification(payload),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

jest.mock("../lib/axios", () => {
  const originalAxios = jest.requireActual("axios");
  const instance = originalAxios.create();
  instance.post = jest.fn();
  instance.put = jest.fn();
  instance.get = jest.fn();
  // offlineQueue memanggil instance itu sendiri utk STANDARD_REQUEST —
  // bungkus sebagai jest.fn (default: gagal jaringan) sambil mewarisi
  // post/put/get mock di atas.
  const callable = jest.fn(() =>
    Promise.reject(Object.assign(new Error("offline"), { code: "ERR_NETWORK" })),
  );
  Object.assign(callable, instance);
  return callable;
});

jest.mock("../lib/storage", () => ({
  getToken: jest.fn(async () => mockToken),
  saveToken: jest.fn(async (t: string) => {
    mockToken = t;
  }),
  removeToken: jest.fn(async () => {
    mockToken = null;
  }),
  saveCheckInId: jest.fn().mockResolvedValue(undefined),
  getCheckInId: jest.fn().mockResolvedValue(null),
  removeCheckInId: jest.fn().mockResolvedValue(undefined),
  saveVersionCode: jest.fn().mockResolvedValue(undefined),
  getVersionCode: jest.fn().mockResolvedValue(null),
  removeVersionCode: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/evidenceStorage", () => ({
  evidenceFileExists: jest.fn(async (uri: string) => {
    return mockEvidenceState.exists.get(uri) ?? true;
  }),
  isPersistedEvidence: jest.fn((uri?: string | null) =>
    Boolean(uri && uri.startsWith("file:///doc/attendance-evidence/")),
  ),
  persistEvidenceImage: jest.fn(async (uri: string) => {
    const durable = `file:///doc/attendance-evidence/${uri.split("/").pop()}`;
    mockEvidenceState.promoted.push(durable);
    return durable;
  }),
  removePersistedEvidence: jest.fn(async (uris: (string | null | undefined)[]) => {
    for (const u of uris || []) mockEvidenceState.removed.push(u as string);
  }),
  cleanupOrphanedEvidence: jest.fn(async (keep: (string | null | undefined)[]) => {
    for (const u of keep || []) {
      if (typeof u === "string") mockEvidenceState.cleanupKeep.push(u);
    }
  }),
}));

/**
 * tsconfig men-pin `types: ["jest"]` (tanpa @types/node); deklarasi simbol
 * tunggal ini menjaga `tsc --noEmit` bersih untuk helper JWT saja.
 */
declare const Buffer: {
  from(input: string, encoding: string): { toString(encoding: string): string };
};

function makeToken(userId: string): string {
  const b64url = (value: object) =>
    Buffer.from(JSON.stringify(value), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ id: userId, role: "user" })}.sig`;
}

async function seedQueue(actions: OfflineAction[]): Promise<void> {
  await AsyncStorage.setItem("@offline_queue", JSON.stringify(actions));
}

function checkInAction(images: { uri: string; name: string; type: string }[]): OfflineAction {
  return {
    id: "checkin_t1",
    type: "ATTENDANCE_CHECKIN",
    data: {
      user_id: "u1",
      user_name: "Teknisi Satu",
      company_id: "company-1",
      site_id: "site-1",
      checkin: "2026-09-18 02:30:00",
      checkin_latitude: -6.175,
      checkin_longitude: 106.827,
      attendance_status_id: "st-1",
      localImages: images,
    },
    timestamp: Date.now(),
    owner_user_id: "u1",
  };
}

function evidenceAction(images: { uri: string; name: string; type: string }[]): OfflineAction {
  return {
    id: "evidence_t1",
    type: "ATTENDANCE_EVIDENCE",
    data: {
      user_name: "Teknisi Satu",
      evidence_group_id: "group-existing",
      attendance_id: "att-existing",
      images,
    },
    timestamp: Date.now(),
    owner_user_id: "u1",
  };
}

/**
 * Router POST tiruan. `tempUploadPlan[i]` menentukan hasil unggahan temp
 * ke-i (ok|fail). Permintaan attendance-create selalu sukses (kecuali
 * di-override lewat `createAttendanceImpl`).
 */
function routePosts(tempUploadPlan: Array<"ok" | "fail">, createAttendanceImpl?: () => Promise<any>) {
  let tempCall = 0;
  (apiClient.post as jest.Mock).mockImplementation(async (url: string, body?: any) => {
    if (url.includes("/evidence-group/")) {
      return { data: { data: { id: "group-1" } } };
    }
    if (url.includes("/api/v2/attendance/upload-permanent")) {
      return { data: { data: { links: ["perm-1.jpg"] } } };
    }
    if (url.includes("/api/v2/attendance/upload")) {
      const mode = tempUploadPlan[Math.min(tempCall++, tempUploadPlan.length - 1)];
      if (mode === "fail") throw Object.assign(new Error("upload timeout"), { code: "ECONNABORTED" });
      return { data: { data: [{ link: "tmp-1" }] } };
    }
    if (url === "/evidence/") {
      return { data: { data: {} } };
    }
    if (url === "/api/v2/attendance/") {
      if (createAttendanceImpl) return createAttendanceImpl();
      return { data: { data: { id: "att-new" } } };
    }
    return { data: {} };
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockToken = makeToken("u1");
  mockEvidenceState.exists.clear();
  mockEvidenceState.promoted = [];
  mockEvidenceState.removed = [];
  mockEvidenceState.cleanupKeep = [];
  (apiClient.put as jest.Mock).mockResolvedValue({ data: { data: { id: "att-existing" } } });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("WAVE-0 CHECK-3 — integritas bukti saat sync antrean", () => {
  it("bukti hilang dari perangkat: absensi TETAP terkirim, item TIDAK dihitung synced, masuk keranjang gagal + Alert", async () => {
    await seedQueue([
      checkInAction([
        { uri: "file:///cache/a.jpg", name: "a.jpg", type: "image/jpeg" },
        { uri: "file:///cache/b-lost.jpg", name: "b.jpg", type: "image/jpeg" },
      ]),
    ]);
    mockEvidenceState.exists.set("file:///cache/b-lost.jpg", false);
    routePosts(["ok"]); // hanya a yang sempat upload

    const outcome = await syncQueuedRequests();

    // record prioritas: POST attendance terjadi
    const attendancePosts = (apiClient.post as jest.Mock).mock.calls.filter(
      (c) => c[0] === "/api/v2/attendance/",
    );
    expect(attendancePosts).toHaveLength(1);

    // TAPI tidak dilaporkan "synced penuh"
    expect(outcome.synced).toBe(0);
    expect(outcome.evidenceLost).toBe(1);
    expect(outcome.evidenceRetrying).toBe(0);

    // keranjang gagal + LOUD
    const failed = await getFailedAttendance();
    expect(failed).toHaveLength(1);
    expect(failed[0].type).toBe("ATTENDANCE_CHECKIN");
    expect(failed[0].errorCode).toBe(0);
    expect(failed[0].errorMessage).toMatch(/hilang dari perangkat/);
    expect(Alert.alert).toHaveBeenCalled();

    // tak ada retry yang bisa diharapkan utk file yang sudah tidak ada
    expect(await getQueue()).toHaveLength(0);

    // CHECK-2b: sweep yatim dipanggil SETELAH sync
    expect(evidenceStorageMock.cleanupOrphanedEvidence).toHaveBeenCalled();

    // jalur promosi (uri cache lama dipromosikan sebelum upload)
    expect(evidenceStorageMock.persistEvidenceImage).toHaveBeenCalledWith(
      "file:///cache/a.jpg",
    );
  });

  it("bukti gagal sementara: absensi terkirim, anak antrean ATTENDANCE_EVIDENCE disimpan dengan owner stamp, tidak dihitung synced", async () => {
    await seedQueue([
      checkInAction([
        { uri: "file:///doc/attendance-evidence/a.jpg", name: "a.jpg", type: "image/jpeg" },
        { uri: "file:///doc/attendance-evidence/b.jpg", name: "b.jpg", type: "image/jpeg" },
      ]),
    ]);
    routePosts(["fail", "ok"]); // a gagal HTTP, b sukses

    const outcome = await syncQueuedRequests();

    expect(outcome.synced).toBe(0);
    expect(outcome.evidenceRetrying).toBe(1);
    expect(outcome.evidenceLost).toBe(0);

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    const child = queue[0];
    expect(child.type).toBe("ATTENDANCE_EVIDENCE");
    expect(child.data.evidence_group_id).toBe("group-1");
    expect(child.data.attendance_id).toBe("att-new");
    expect(child.data.images).toHaveLength(1);
    expect(child.data.images[0].uri).toBe("file:///doc/attendance-evidence/a.jpg");
    // owner stamp diwarisi — anak TIDAK boleh bisa dikirim user lain (MOB-02)
    expect(child.owner_user_id).toBe("u1");

    // hanya foto yang TERKONFIRMASI server yang salinannya dibuang
    expect(evidenceStorageMock.removePersistedEvidence).toHaveBeenCalledWith([
      "file:///doc/attendance-evidence/b.jpg",
    ]);
  });

  it("retry anak bukti: tuntas → item hilang & terhitung evidenceResynced; masih gagal → bertahan dengan daftar menyusut", async () => {
    await seedQueue([
      evidenceAction([
        { uri: "file:///doc/attendance-evidence/a.jpg", name: "a.jpg", type: "image/jpeg" },
        { uri: "file:///doc/attendance-evidence/b.jpg", name: "b.jpg", type: "image/jpeg" },
      ]),
    ]);

    // putaran 1: a gagal, b sukses → anak bertahan dengan [a]
    routePosts(["fail", "ok"]);
    const r1 = await syncQueuedRequests();
    expect(r1.evidenceRetrying).toBe(1);
    expect(r1.synced).toBe(0);
    let queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].data.images).toHaveLength(1);
    expect(queue[0].data.images[0].uri).toBe("file:///doc/attendance-evidence/a.jpg");

    // putaran 2: a sukses → anak tuntas. BUKAN `synced` (record induk sudah
    // dihitung saat dibuat); dihitung sebagai bukti pulih.
    routePosts(["ok"]);
    const r2 = await syncQueuedRequests();
    expect(r2.synced).toBe(0);
    expect(r2.evidenceResynced).toBe(1);
    expect(await getQueue()).toHaveLength(0);
  });

  it("item attendance gagal-retryable melewati 48 jam: TIDAK dibuang senyap — keranjang gagal + notifikasi lokal + expired di outcome", async () => {
    const stale = checkInAction([
      { uri: "file:///doc/attendance-evidence/a.jpg", name: "a.jpg", type: "image/jpeg" },
    ]);
    stale.timestamp = Date.now() - 49 * 60 * 60 * 1000; // melewati jendela
    await seedQueue([stale]);
    // grup dibuat OK, tapi POST attendance gagal karena jaringan murni (retryable)
    (apiClient.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes("/evidence-group/")) return { data: { data: { id: "group-1" } } };
      if (url === "/api/v2/attendance/") {
        throw Object.assign(new Error("network down"), { code: "ERR_NETWORK" });
      }
      return { data: {} };
    });

    const outcome = await syncQueuedRequests();

    expect(outcome.synced).toBe(0);
    expect(outcome.expired).toBe(1);
    const failed = await getFailedAttendance();
    expect(failed).toHaveLength(1);
    expect(failed[0].errorMessage).toMatch(/48 jam/);
    // SURFACE: notifikasi lokal dijadwalkan
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const notifArg = mockScheduleNotification.mock.calls[0][0] as {
      content: { title: string; body: string };
    };
    expect(notifArg.content.title).toMatch(/kadaluarsa/i);
    // antrean bersih (item dipindah ke keranjang, bukan di-retry selamanya)
    expect(await getQueue()).toHaveLength(0);
  });

  it("STANDARD_REQUEST kedaluwarsa 48 jam: dibuang dengan log, TIDAK masuk keranjang attendance", async () => {
    const stale: OfflineAction = {
      id: "std_t1",
      type: "STANDARD_REQUEST",
      url: "/some/non-attendance/endpoint",
      method: "POST",
      data: {},
      timestamp: Date.now() - 49 * 60 * 60 * 1000,
      owner_user_id: "u1",
    };
    await seedQueue([stale]);
    // callable mock axios sudah default reject ERR_NETWORK utk pemanggilan
    // langsung (jalur STANDARD_REQUEST)

    const outcome = await syncQueuedRequests();

    expect(outcome.expired).toBe(0);
    expect(await getFailedAttendance()).toHaveLength(0);
    expect(await getQueue()).toHaveLength(0);
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it("grup bukti gagal dibuat (respons tanpa id): item check-in TIDAK dibakar diam-diam — retryable, tidak synced", async () => {
    await seedQueue([
      checkInAction([
        { uri: "file:///doc/attendance-evidence/a.jpg", name: "a.jpg", type: "image/jpeg" },
      ]),
    ]);
    (apiClient.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes("/evidence-group/")) return { data: { data: {} } }; // tanpa id
      return { data: { data: { id: "x" } } };
    });

    const outcome = await syncQueuedRequests();

    expect(outcome.synced).toBe(0);
    // attendance TIDAK di-POST tanpa grup — tidak ada "sukses" tanpa bukti
    expect(
      (apiClient.post as jest.Mock).mock.calls.some((c) => c[0] === "/api/v2/attendance/"),
    ).toBe(false);
    const queue = await getQueue();
    expect(queue).toHaveLength(1); // item utuh utk dicoba lagi
    expect(queue[0].type).toBe("ATTENDANCE_CHECKIN");
  });

  /**
   * D-2 CHECK-2(b) — promosi uri cache→persisten dulu hanya hidup di variabel
   * lokal `readUri`: file hasil promosi tidak pernah dihapus setelah upload
   * sukses (removePersistedEvidence menunjuk uri cache lama → skip) dan tidak
   * pernah dirujuk ulang saat retry (anak menunjuk cache yang bisa di-evict OS
   * → bukti hilang padahal salinan persisten ada, lalu sweep memandangnya
   * yatim). Fix: tulis-balik readUri ke elemen record.
   */
  it("D-2 CHECK-2b: upload sukses dari uri cache — salinan persisten yang dihapus, bukan tak tersentuh", async () => {
    await seedQueue([
      checkInAction([{ uri: "file:///cache/a.jpg", name: "a.jpg", type: "image/jpeg" }]),
    ]);
    routePosts(["ok"]);

    const outcome = await syncQueuedRequests();
    expect(outcome.synced).toBe(1);

    // Pra-fix: removePersistedEvidence menerima uri cache lama → salinan
    // persisten hasil promosi jadi yatim permanen. Kini: uri persisten.
    expect(evidenceStorageMock.removePersistedEvidence).toHaveBeenCalledWith([
      "file:///doc/attendance-evidence/a.jpg",
    ]);
  });

  it("D-2 CHECK-2b: upload gagal (retryable) dari uri cache — anak retry menunjuk salinan persisten", async () => {
    await seedQueue([
      checkInAction([{ uri: "file:///cache/a.jpg", name: "a.jpg", type: "image/jpeg" }]),
    ]);
    routePosts(["fail"]);

    const outcome = await syncQueuedRequests();
    expect(outcome.evidenceRetrying).toBe(1);

    const queue = await getQueue();
    const child = queue.find((a) => a.type === "ATTENDANCE_EVIDENCE");
    expect(child).toBeTruthy();
    // Record anak WAJIB membawa uri hasil promosi — kalau masih uri cache,
    // eviksi OS memutus bukti padahal salinan persisten tersedia.
    expect(child!.data.images[0].uri).toBe("file:///doc/attendance-evidence/a.jpg");
    // Sweep keep-set ikut menunjuk persisten (tidak lagi menandai promosi sbg yatim):
    expect(mockEvidenceState.cleanupKeep).toContain("file:///doc/attendance-evidence/a.jpg");
    // Belum terkonfirmasi → salinan persisten TIDAK boleh dibuang:
    expect(evidenceStorageMock.removePersistedEvidence).not.toHaveBeenCalledWith(
      expect.arrayContaining(["file:///doc/attendance-evidence/a.jpg"]),
    );

    // Putaran berikutnya memakai anak yang sudah menulis-balik → sukses:
    routePosts(["ok"]);
    const r2 = await syncQueuedRequests();
    expect(r2.evidenceResynced).toBe(1);
    expect(await getQueue()).toHaveLength(0);
    expect(evidenceStorageMock.removePersistedEvidence).toHaveBeenCalledWith([
      "file:///doc/attendance-evidence/a.jpg",
    ]);
  });

  /**
   * M-1 (verdict reviewer G.3, papan H-2) — sweep bukti yatim harus GAGAL
   * SAFE: satu pembacaan keranjang gagal yang rusak (tekanan penyimpanan,
   * korusi pasca-crash) tidak boleh diterjemahkan sebagai "tidak ada bukti
   * dirujuk" lalu menyapu direktori bukti milik keranjang gagal.
   */
  it("M-1: baca failed-bucket gagal → sweep TIDAK berjalan → NOL unlink", async () => {
    // Bucket korup: JSON.parse melempar saat sweep menyusun keep-set.
    await AsyncStorage.setItem("@failed_attendance_queue", "{korupsi-pasca-crash");
    // Satu item yang sync-nya SUKSES penuh (tanpa tulis ke keranjang gagal)
    // — queue non-empty membuka gerbang sync, jadi sweep pasti disinggahi.
    await seedQueue([
      checkInAction([{ uri: "file:///cache/a.jpg", name: "a.jpg", type: "image/jpeg" }]),
    ]);
    routePosts(["ok"]);

    const outcome = await syncQueuedRequests();
    expect(outcome.synced).toBe(1); // sync normal berjalan — bukan test kegagalan sync

    // Komposisi yang diuji: cleanupOrphanedEvidence TIDAK PERNAH dipanggil —
    // nol berkas bukti hilang. Kode pra-M-1 memanggilnya dengan keep=[] dan
    // (produksi asli) menyapu SELURUH direktori.
    expect(evidenceStorageMock.cleanupOrphanedEvidence).not.toHaveBeenCalled();
  });

  it("M-1: bucket korup + repair-write saat sync → keep parsial → sweep tetap DILEWAT, record tetap tersimpan", async () => {
    await AsyncStorage.setItem("@failed_attendance_queue", "{korupsi-pasca-crash");
    const stale = checkInAction([
      { uri: "file:///doc/attendance-evidence/a.jpg", name: "a.jpg", type: "image/jpeg" },
    ]);
    stale.timestamp = Date.now() - 49 * 60 * 60 * 1000;
    await seedQueue([stale]);
    // kegagalan jaringan murni pada POST attendance → jalur retryable >48 jam
    // → pindah ke keranjang gagal lewat saveFailedAttendance (yang akan
    // menimpa blob korup = repair parsial).
    (apiClient.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes("/evidence-group/")) return { data: { data: { id: "group-1" } } };
      if (url === "/api/v2/attendance/") {
        throw Object.assign(new Error("network down"), { code: "ERR_NETWORK" });
      }
      return { data: {} };
    });

    const outcome = await syncQueuedRequests();
    expect(outcome.expired).toBe(1);

    // Record baru tetap tersimpan (banner pulih): blob korup digantikan.
    const failed = await getFailedAttendance();
    expect(failed).toHaveLength(1);

    // TAPI bukti milik record lama yang tak terbaca tidak boleh dianggap
    // tak-dirujuk: keep-set hasil repair = PARSIAL → sweep dilewati.
    expect(evidenceStorageMock.cleanupOrphanedEvidence).not.toHaveBeenCalled();
  });
});
