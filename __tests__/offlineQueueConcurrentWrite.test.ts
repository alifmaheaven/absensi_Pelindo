/**
 * F-01 (P0) — antrean offline kehilangan item senyap saat sync.
 *
 * Kenapa file ini ada: suite yang sudah ada TIDAK menangkap cacat ini.
 * `offlineQueueEvidenceIntegrity.test.ts` selalu meng-await sync sampai selesai
 * sebelum menyentuh antrean lagi, jadi tidak pernah ada penulis kedua di tengah
 * ronde. Cacatnya baru muncul ketika pengguna meng-queue sesuatu SELAGI sync
 * berjalan — dan jendela itu lebar (satu item berfoto = 3 request HTTP, timeout
 * 30 s/20 s; antrean 50 item = menit-an).
 *
 * Tiga perilaku yang dipaku di sini:
 *   1. item yang di-queue selagi sync TETAP ADA setelah sync selesai (dulu
 *      dihapus oleh `saveQueue(remaining)` yang menulis snapshot lama);
 *   2. foto item tersebut TIDAK dianggap yatim oleh sweep bukti (dulu keep-set
 *      disusun dari array ronde, bukan dari storage, sehingga file dihapus);
 *   3. item yang SUDAH terkirim tidak diputar ulang setelah proses dibunuh.
 *
 * ⚠️ BELUM DIJALANKAN. `Mobile/node_modules` tidak ada di sesi ini dan
 * `npm install` dilarang (lockfile). Perilaku di atas sudah dibuktikan dengan
 * menjalankan SUMBER ASLI yang dikompilasi terhadap stub AsyncStorage di
 * `team/tmp-probe/offline-queue-race/` (lihat laporan EXEC-09), tapi file ini
 * sendiri belum pernah dieksekusi oleh jest.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import apiClient from "../lib/axios";
import * as evidenceStorageMock from "../lib/evidenceStorage";
import {
  getQueue,
  queueOfflineCheckIn,
  syncQueuedRequests,
  type OfflineAction,
} from "../lib/offlineQueue";

let mockToken: string | null = null;

const mockEvidenceState = {
  removed: [] as string[],
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
  scheduleNotificationAsync: jest.fn().mockResolvedValue("notif-1"),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

jest.mock("../lib/axios", () => {
  const originalAxios = jest.requireActual("axios");
  const instance = originalAxios.create();
  instance.post = jest.fn();
  instance.put = jest.fn();
  instance.get = jest.fn();
  const callable = jest.fn(() =>
    Promise.reject(Object.assign(new Error("offline"), { code: "ERR_NETWORK" })),
  );
  Object.assign(callable, instance);
  return callable;
});

jest.mock("../lib/storage", () => ({
  getToken: jest.fn(async () => mockToken),
  saveToken: jest.fn(async (t: string) => { mockToken = t; }),
  removeToken: jest.fn(async () => { mockToken = null; }),
  saveCheckInId: jest.fn().mockResolvedValue(undefined),
  getCheckInId: jest.fn().mockResolvedValue(null),
  removeCheckInId: jest.fn().mockResolvedValue(undefined),
  saveVersionCode: jest.fn().mockResolvedValue(undefined),
  getVersionCode: jest.fn().mockResolvedValue(null),
  removeVersionCode: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/evidenceStorage", () => ({
  evidenceFileExists: jest.fn(async () => true),
  isPersistedEvidence: jest.fn((uri?: string | null) =>
    Boolean(uri && uri.startsWith("file:///doc/attendance-evidence/")),
  ),
  persistEvidenceImage: jest.fn(async (uri: string) => uri),
  removePersistedEvidence: jest.fn(async (uris: (string | null | undefined)[]) => {
    for (const u of uris || []) mockEvidenceState.removed.push(u as string);
  }),
  // TIDAK di-mock jadi no-op: yang diuji justru APA yang diterima sweep.
  cleanupOrphanedEvidence: jest.fn(async (keep: (string | null | undefined)[]) => {
    for (const u of keep || []) {
      if (typeof u === "string") mockEvidenceState.cleanupKeep.push(u);
    }
  }),
}));

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

function checkInPayload(description: string, images: { uri: string; name: string; type: string }[] = []) {
  return {
    user_id: "u1",
    user_name: "Teknisi Satu",
    company_id: "company-1",
    site_id: "site-1",
    checkin: "2026-10-15 08:00:00",
    checkin_latitude: -6.175,
    checkin_longitude: 106.827,
    attendance_status_id: "st-1",
    description,
    localImages: images,
  };
}

function seededAction(description: string): OfflineAction {
  return {
    id: "checkin_seed",
    type: "ATTENDANCE_CHECKIN",
    data: checkInPayload(description),
    timestamp: Date.now(),
    owner_user_id: "u1",
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockToken = makeToken("u1");
  mockEvidenceState.removed = [];
  mockEvidenceState.cleanupKeep = [];
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("F-01 — penulisan antrean saat sync berjalan", () => {
  it.each([
    ["queueRequest", async () => {
      const { queueRequest } = require("../lib/offlineQueue");
      await queueRequest("/api/v2/later", "post", { description: "later" });
    }],
    ["queueOfflineCheckIn", async () => {
      await queueOfflineCheckIn(checkInPayload("later"));
    }],
    ["queueOfflineCheckOut", async () => {
      const { queueOfflineCheckOut } = require("../lib/offlineQueue");
      await queueOfflineCheckOut({ user_id: "u1", checkout: "2026-10-15 17:00:00" } as any);
    }],
    ["queueOfflineEvidence", async () => {
      const { queueOfflineEvidence } = require("../lib/offlineQueue");
      await queueOfflineEvidence({ attendance_id: "att-1", images: [] } as any);
    }],
  ])("enqueue %s rejects without overwriting an unreadable existing queue", async (_name, enqueue) => {
    const existingAction = seededAction("preserve-me");
    existingAction.id = "preserve-me";
    const existing = JSON.stringify([existingAction]);
    await AsyncStorage.setItem("@offline_queue", existing);
    const originalGetItem = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
    try {
      (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
        if (key === "@offline_queue") throw new Error("Transient storage failure");
        return originalGetItem?.(key);
      });
      await expect(enqueue()).rejects.toThrow("Antrean tidak terbaca");
    } finally {
      (AsyncStorage.getItem as jest.Mock).mockImplementation(originalGetItem!);
    }
    expect(await AsyncStorage.getItem("@offline_queue")).toBe(existing);
    expect((await getQueue()).map((action) => action.id)).toEqual(["preserve-me"]);
  });

  it("item yang di-queue SELAGI sync TIDAK hilang (dulu: saveQueue(remaining) menimpanya)", async () => {
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((resolve) => { releaseSlow = resolve; });

    (apiClient.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url === "/api/v2/attendance/") {
        await slowGate; // item pertama lambat: inilah jendela race-nya
        return { data: { data: { id: "att-seed" } } };
      }
      return { data: { data: { id: "group-1" } } };
    });

    await AsyncStorage.setItem("@offline_queue", JSON.stringify([seededAction("seed")]));

    const syncP = syncQueuedRequests();
    await new Promise((resolve) => setTimeout(resolve, 0)); // sync sudah memegang snapshot

    // Pengguna menekan Check In lagi sementara sync masih berjalan.
    await queueOfflineCheckIn(checkInPayload("queued-during-sync"));

    releaseSlow();
    const outcome = await syncP;

    const queue = await getQueue();
    expect(outcome.synced).toBe(1); // item lama memang terkirim
    // ...dan item BARU harus tetap ada. Pra-fix: queue kosong, item lenyap
    // tanpa log, tanpa keranjang gagal, tanpa banner.
    expect(queue).toHaveLength(1);
    expect(queue[0].data.description).toBe("queued-during-sync");
  });

  it("foto item yang di-queue SELAGI sync TIDAK dianggap yatim oleh sweep bukti", async () => {
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((resolve) => { releaseSlow = resolve; });

    (apiClient.post as jest.Mock).mockImplementation(async (url: string) => {
      if (url === "/api/v2/attendance/") {
        await slowGate;
        return { data: { data: { id: "att-seed" } } };
      }
      return { data: { data: { id: "group-1" } } };
    });

    await AsyncStorage.setItem("@offline_queue", JSON.stringify([seededAction("seed")]));

    const syncP = syncQueuedRequests();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await queueOfflineCheckIn(
      checkInPayload("late-photo", [
        { uri: "file:///doc/attendance-evidence/LATE.jpg", name: "LATE.jpg", type: "image/jpeg" },
      ]),
    );

    releaseSlow();
    await syncP;

    // Pra-fix keep-set disusun dari array ronde -> foto ini tidak ada di
    // dalamnya -> cleanupOrphanedEvidence MENGHAPUSNYA dari perangkat.
    expect(mockEvidenceState.cleanupKeep).toContain("file:///doc/attendance-evidence/LATE.jpg");
  });

  it("item yang di-retry TETAP di posisinya (urutan antrean tidak berubah)", async () => {
    // Ditemukan saat verifikasi: kalau `removedIds` diperiksa sebelum `upsert`,
    // item yang di-retry terbuang lalu ditambahkan lagi di UJUNG antrean.
    // Tidak ada test lama yang meng-assert urutan, jadi regresi ini lolos.
    (apiClient.post as jest.Mock).mockImplementation(async (url: string, body?: any) => {
      if (url === "/api/v2/attendance/") {
        if (body?.description === "flaky") {
          throw Object.assign(new Error("net"), { code: "ERR_NETWORK" }); // retryable
        }
        return { data: { data: { id: `att-${body?.description}` } } };
      }
      return { data: { data: { id: "group-1" } } };
    });

    await AsyncStorage.setItem(
      "@offline_queue",
      JSON.stringify([
        { ...seededAction("ok-first"), id: "ok1" },
        { ...seededAction("flaky"), id: "flaky1" },
        { ...seededAction("ok-last"), id: "ok2" },
      ]),
    );

    await syncQueuedRequests();

    // ok1/ok2 selesai; flaky1 bertahan DI POSISI SEMULA (di antara keduanya),
    // bukan terdorong ke belakang.
    const queue = await getQueue();
    expect(queue.map((a) => a.id)).toEqual(["flaky1"]);
  });

  it("item yang SUDAH terkirim tidak diputar ulang setelah proses dibunuh di tengah sync", async () => {
    let hangSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => { hangSecond = resolve; });

    (apiClient.post as jest.Mock).mockImplementation(async (url: string, body?: any) => {
      if (url === "/api/v2/attendance/") {
        const description = body?.description;
        if (description === "second") await secondGate; // proses "dibunuh" di sini
        return { data: { data: { id: `att-${description}` } } };
      }
      return { data: { data: { id: "group-1" } } };
    });

    await AsyncStorage.setItem(
      "@offline_queue",
      JSON.stringify([
        { ...seededAction("first"), id: "i1" },
        { ...seededAction("second"), id: "i2" },
      ]),
    );

    const syncP = syncQueuedRequests();
    // Tunggu sampai item pertama benar-benar selesai dan item kedua menggantung.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Inilah state di disk pada saat proses dibunuh — yang akan dibaca ronde
    // berikutnya setelah app dibuka kembali.
    const onDisk = JSON.parse((await AsyncStorage.getItem("@offline_queue")) || "[]");
    hangSecond();
    await syncP.catch(() => undefined);

    // Pra-fix: antrean hanya ditulis di AKHIR ronde -> "first" masih ada di
    // disk dan akan di-POST ulang (409 -> "gagal" palsu + grup bukti ganda).
    expect(onDisk.map((a: OfflineAction) => a.id)).not.toContain("i1");
    expect(onDisk.map((a: OfflineAction) => a.id)).toContain("i2");
  });
});
