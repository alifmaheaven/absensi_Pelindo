/**
 * F1 / temuan M-02 (review 2026-09-19 r2):
 * `DELETE /evidence/` kini RequirePermission(['ticketing_delete','attendance_delete',
 * 'daily_routine_delete']) (backend 07e210e + e817480, ada di image prod 42cef67).
 * Role `user` lapangan tidak memegang satupun (header seed 20260904; OBSERVER-LOG:331)
 * → 403. Loop `deleteEvid` di submit ticketing/[id].tsx MENGIKAT error ke seluruh
 * submit → "Gagal edit ticket!" = edit dengan hapus foto tak mungkin tersimpan.
 *
 * Vonis koordinator (T-3): patch mobile 403-tolerant — hapus-lokal-terus-submit +
 * toast jujur. Grant BE *_delete DILARANG (baru dibekukan).
 *
 * Dua arah yang dipaku di sini:
 *  1. PERILAKU helper `deleteRemovedEvidence` (services/ticket.ts).
 *  2. KUNCI SUMBER layar ticketing/[id].tsx: submit memakai helper (bukan
 *     `deleteEvid` langsung) dan ada percabangan toast jujur utk retained>0.
 */

// services/ticket → lib/cache → async-storage butuh mock native (pola
// __tests__/attendanceDetailModal.test.tsx).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// services/ticket mengimpor lib/axios (statik) → seret expo-router/ESM ke jest.
// Pola stub sama persis dengan __tests__/attendanceDetailModal.test.tsx.
jest.mock("@/lib/axios", () => ({
  __esModule: true,
  default: {
    post: jest.fn().mockResolvedValue({ data: { data: { urls: {}, expires_in: 300 } } }),
    get: jest.fn(),
    delete: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  },
}));

import { deleteRemovedEvidence } from "@/services/ticket";

const httpErr = (code: number) => ({ code, title: "x", message: "y" });

describe("deleteRemovedEvidence (M-02: 403-tolerant, non-blocking)", () => {
  it("semua sukses → deleted terhitung, retained 0, tidak melempar", async () => {
    const calls: string[] = [];
    const del = jest.fn(async ({ id }: { id: string }) => {
      calls.push(id);
      return { code: 200 };
    });
    const out = await deleteRemovedEvidence([{ id: "a" }, { id: "b" }], del);
    expect(out).toEqual({ deleted: 2, retained: 0 });
    expect(calls).toEqual(["a", "b"]);
  });

  it("403 (role user tanpa *_delete) → DITOLERIR: retained++, submit berlanjut, tidak melempar", async () => {
    const del = jest.fn(async ({ id }: { id: string }) => {
      if (id === "x") throw httpErr(403);
      return { code: 200 };
    });
    const out = await deleteRemovedEvidence([{ id: "x" }, { id: "y" }], del);
    expect(out).toEqual({ deleted: 1, retained: 1 });
    // baris yang ditolak TIDAK membuat baris lain ikut batal: keduanya dicoba.
    expect(del).toHaveBeenCalledTimes(2);
  });

  it("beberapa 403 sekaligus → retained mengakumulasi", async () => {
    const del = jest.fn(async () => {
      throw httpErr(403);
    });
    const out = await deleteRemovedEvidence([{ id: "p" }, { id: "q" }, { id: "r" }], del);
    expect(out).toEqual({ deleted: 0, retained: 3 });
  });

  it("non-403 (500 server) → TETAP melempar: submit gagal seperti sebelumnya (jangan sembunyikan insiden)", async () => {
    const del = jest.fn(async () => {
      throw httpErr(500);
    });
    await expect(deleteRemovedEvidence([{ id: "z" }], del)).rejects.toEqual(
      expect.objectContaining({ code: 500 }),
    );
  });

  it("error tanpa shape code (mis. Error murni) → melempar (fail-loud, bukan diam-diam lanjut)", async () => {
    const del = jest.fn(async () => {
      throw new Error("boom");
    });
    await expect(deleteRemovedEvidence([{ id: "z" }], del)).rejects.toThrow("boom");
  });

  it("id kosong/undefined → dilewati, tidak memanggil API", async () => {
    const del = jest.fn();
    const out = await deleteRemovedEvidence([{ id: "" }, {}, { id: "ok" }], del);
    expect(del).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ deleted: 1, retained: 0 });
  });
});

describe("kunci sumber ticketing/[id].tsx (wiring M-02)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  const src = fs.readFileSync(
    // jest berjalan dengan cwd = akar Mobile (lihat jest.config.js rootDir).
    "app/(no-tabs)/ticketing/[id].tsx",
    "utf8",
  ) as string;

  it("submit memakai deleteRemovedEvidence, bukan deleteEvid langsung", () => {
    expect(src).toContain("deleteRemovedEvidence");
    // loop lama `await deleteEvid({ id: img?.id` harus sudah hilang dari jalur submit.
    expect(src).not.toMatch(/await deleteEvid\(\{\s*id:\s*img\?\.id/);
  });

  it("ada toast jujur saat retained > 0 (bukan klaim sukses penuh)", () => {
    expect(src).toMatch(/retained\s*>\s*0/);
    expect(src).toMatch(/warning|tidak dapat dihapus|masih tampil/i);
  });
});
