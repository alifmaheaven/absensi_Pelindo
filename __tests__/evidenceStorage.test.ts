/**
 * WAVE-0 P0-0.6 — contract tests for lib/evidenceStorage.ts.
 *
 * The module is the single gateway between "photo exists on this device"
 * and "the offline queue / upload can still find it hours later". These
 * tests pin the three behaviours the fleet depends on:
 *   1. cache uris are COPIED into documentDirectory/attendance-evidence/;
 *   2. copy failure THROWS (callers must be loud — silent drop is the bug
 *      this wave exists to kill);
 *   3. removal only ever touches evidence-dir files (a cache uri can never
 *      be mass-deleted through this API).
 */
import {
  cleanupOrphanedEvidence,
  evidenceFileExists,
  getEvidenceDir,
  isPersistedEvidence,
  persistEvidenceImage,
  removePersistedEvidence,
} from "@/lib/evidenceStorage";

jest.mock("expo-file-system/legacy", () => {
  const documentDirectory = "file:///data/user/0/com.test/files/";
  const evidenceDir = `${documentDirectory}attendance-evidence/`;

  const state = {
    documentDirectory,
    evidenceDir,
    dirs: new Set<string>(),
    files: new Set<string>([
      `${documentDirectory}attendance-evidence/old-keep.jpg`,
      `${documentDirectory}attendance-evidence/old-orphan.jpg`,
      "file:///cache/ImagePicker/transient.jpg",
    ]),
    copies: [] as { from: string; to: string }[],
    deletions: [] as string[],
    failNextCopy: false,
    throwOnDelete: false,
  };

  return {
    __state: state,
    documentDirectory,
    getInfoAsync: jest.fn(async (uri: string) => ({
      exists: uri.endsWith("/") ? state.dirs.has(uri) : state.files.has(uri),
      uri,
    })),
    makeDirectoryAsync: jest.fn(async (uri: string) => {
      state.dirs.add(uri);
    }),
    copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
      if (state.failNextCopy) {
        state.failNextCopy = false;
        throw new Error("EIO: copy rejected by device");
      }
      if (!state.files.has(from)) {
        throw new Error(`copyAsync: source missing ${from}`);
      }
      state.files.add(to);
      state.copies.push({ from, to });
    }),
    deleteAsync: jest.fn(async (uri: string) => {
      if (state.throwOnDelete) {
        throw new Error("delete rejected");
      }
      state.files.delete(uri);
      state.deletions.push(uri);
    }),
    readDirectoryAsync: jest.fn(async (dir: string) =>
      Array.from(state.files)
        .filter((u) => u.startsWith(dir) && u !== dir)
        .map((u) => u.slice(dir.length)),
    ),
  };
});

// akses ke objek state internal mock (didistribusikan ulang lewat `__state`)
const state = (jest.requireMock("expo-file-system/legacy") as any).__state;

beforeEach(() => {
  // state.files dibagikan antar-test dalam file ini — kembalikan ke snapshot awal
  state.files = new Set([
    `${state.evidenceDir}old-keep.jpg`,
    `${state.evidenceDir}old-orphan.jpg`,
    "file:///cache/ImagePicker/transient.jpg",
  ]);
  state.dirs = new Set<string>();
  state.copies.length = 0;
  state.deletions.length = 0;
  state.failNextCopy = false;
  state.throwOnDelete = false;
});

describe("evidenceStorage (WAVE-0 P0-0.6)", () => {
  it("isPersistedEvidence hanya true untuk uri di direktori bukti", () => {
    expect(isPersistedEvidence(`${state.evidenceDir}a.jpg`)).toBe(true);
    expect(isPersistedEvidence("file:///cache/ImagePicker/a.jpg")).toBe(false);
    expect(isPersistedEvidence(undefined)).toBe(false);
    expect(isPersistedEvidence(null)).toBe(false);
  });

  it("getEvidenceDir berada di documentDirectory", () => {
    expect(getEvidenceDir()).toBe(state.evidenceDir);
  });

  describe("persistEvidenceImage", () => {
    it("menyalin uri cache ke direktori bukti persisten dan mengembalikan uri baru", async () => {
      const durable = await persistEvidenceImage("file:///cache/ImagePicker/transient.jpg");

      expect(durable.startsWith(state.evidenceDir)).toBe(true);
      expect(durable.endsWith(".jpg")).toBe(true);
      expect(state.copies).toHaveLength(1);
      expect(state.copies[0].from).toBe("file:///cache/ImagePicker/transient.jpg");
      expect(state.copies[0].to).toBe(durable);
      expect(await evidenceFileExists(durable)).toBe(true);
    });

    it("idempoten: uri yang sudah persisten dikembalikan apa adanya tanpa copy", async () => {
      const already = `${state.evidenceDir}old-keep.jpg`;
      const out = await persistEvidenceImage(already);
      expect(out).toBe(already);
      expect(state.copies).toHaveLength(0);
    });

    it("melempar (BUKAN mengembalikan null) saat copy gagal — kegagalan wajib terdengar", async () => {
      state.failNextCopy = true;
      await expect(
        persistEvidenceImage("file:///cache/ImagePicker/transient.jpg"),
      ).rejects.toThrow(/copy rejected by device/);
    });

    it("melempar untuk uri kosong", async () => {
      await expect(persistEvidenceImage("")).rejects.toThrow();
    });
  });

  describe("evidenceFileExists", () => {
    it("false untuk uri hilang/kosong", async () => {
      expect(await evidenceFileExists("file:///cache/lost.jpg")).toBe(false);
      expect(await evidenceFileExists(null)).toBe(false);
      expect(await evidenceFileExists("")).toBe(false);
    });
  });

  describe("removePersistedEvidence", () => {
    it("hanya menghapus file di direktori bukti; uri cache tidak pernah disentuh", async () => {
      const cacheUri = "file:///cache/ImagePicker/transient.jpg";
      const durableUri = `${state.evidenceDir}old-keep.jpg`;

      await removePersistedEvidence([cacheUri, durableUri, undefined, null]);

      expect(state.deletions).toEqual([durableUri]);
      expect(state.files.has(cacheUri)).toBe(true);
    });

    it("error hapus ditelan (best-effort) tanpa melempar", async () => {
      state.throwOnDelete = true;
      await expect(
        removePersistedEvidence([`${state.evidenceDir}old-orphan.jpg`]),
      ).resolves.toBeUndefined();
    });
  });

  describe("cleanupOrphanedEvidence", () => {
    it("menghapus file bukti tanpa rujukan, mempertahankan yang di-keep", async () => {
      const keep = `${state.evidenceDir}old-keep.jpg`;
      const orphan = `${state.evidenceDir}old-orphan.jpg`;

      await cleanupOrphanedEvidence([keep, "file:///cache/not-evidence.jpg"]);

      expect(state.deletions).toContain(orphan);
      expect(state.deletions).not.toContain(keep);
      expect(state.files.has(orphan)).toBe(false);
      expect(state.files.has(keep)).toBe(true);
    });

    it("M-1: keep KOSONG ditolak — nol hapus, direktori bukti utuh", async () => {
      await cleanupOrphanedEvidence([]);

      expect(state.deletions).toEqual([]);
      expect(state.files.has(`${state.evidenceDir}old-keep.jpg`)).toBe(true);
      expect(state.files.has(`${state.evidenceDir}old-orphan.jpg`)).toBe(true);
    });

    it("M-1: keep berisi nol uri bukti-persisten (hanya cache/null) = efektif kosong — juga ditolak", async () => {
      await cleanupOrphanedEvidence(["file:///cache/not-evidence.jpg", null, undefined]);

      expect(state.deletions).toEqual([]);
      expect(state.files.size).toBe(3);
    });

    it("M-1: opsi eksplisit allowEmptyKeep = 'sengaja kosong' — penyapuan berjalan", async () => {
      await cleanupOrphanedEvidence([], { allowEmptyKeep: true });

      expect(state.deletions).toContain(`${state.evidenceDir}old-keep.jpg`);
      expect(state.deletions).toContain(`${state.evidenceDir}old-orphan.jpg`);
    });
  });
});
