/**
 * F3 — M-08 (UIUX r2, vonis koordinator jendela ini): kesegaran cache render-token.
 *
 * Bug terukur di lib/renderToken.ts (pra-fix):
 *   1. filter `wanted` memakai `!cache.has(key)` — KEBERADAAN, bukan
 *      kesegaran → entri expired tidak pernah di-mint ulang;
 *   2. tidak ada purge → entri expired duduk di cache selamanya;
 *   3. fileUrl/appendRenderToken melihat expired → mengembalikan URL POLOS →
 *      403 → gambar BLANK PERMANEN s/d restart app (TTL server 300 dtk).
 *   Web (Frontend V2 src/utils/imageToken.js:65 isFresh) sudah benar.
 * Ekstra yang dibuang di sini:
 *   4. extractFileKey tidak membuang `?query` → key "files/a.jpg?token=x"
 *      mencemari cache/mint (web membuang via split(/[?#]/) :62).
 *
 * Dua arah yang dipaku: entri SEGAR → tanpa refetch (jangan spam);
 * entri BASI → re-mint dan token BARU terpakai.
 */

// Holder mock BER-PREFIKS "mock" agar lolos hoisting babel-plugin-jest dan
// TETAP IDENTIK lintas-permintaan (resetModules membuat instance @/lib/axios
// baru; tanpa holder, assertions jatuh ke object mati).
const mockPost = jest.fn();
jest.mock("@/lib/axios", () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  },
}));

const postMock = mockPost as jest.Mock;

const T0 = 1_760_000_000_000; // epoch-ms bebas-DRU sebagai dasar jam palsu
let nowOffset = 0;
const now = () => T0 + nowOffset;

// jest.config proyek TIDAK mengaktifkan ESM (--experimental-vm-modules), jadi
// reload modul lewat require sinkron + resetModules, bukan `await import()`.
function freshModule() {
  jest.resetModules();
  return require("@/lib/renderToken") as typeof import("@/lib/renderToken");
}

function mintResponse(file: string, token: string, expiresIn = 300) {
  return {
    data: {
      data: {
        urls: { [file]: `/public/images/${file}?token=${token}` },
        expires_in: expiresIn,
      },
    },
  };
}

beforeAll(() => {
  jest.spyOn(Date, "now").mockImplementation(() => now());
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  nowOffset = 0;
  postMock.mockReset();
});

describe("M-08 arah-1: entri SEGAR tidak memicu refetch (anti-spam)", () => {
  it("ensure dua kali berdampingan utk key yang sama → SATU POST", async () => {
    postMock.mockResolvedValue(mintResponse("files/segara.jpg", "tok1"));
    const { ensureRenderTokens } = await freshModule();
    await ensureRenderTokens(["files/segara.jpg"]);
    await ensureRenderTokens(["files/segara.jpg"]);
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("pada 250 detik (dalam margin −15 dtk: kedaluwarsa dini di 285 dtk) → ensure tidak POST ulang", async () => {
    postMock.mockResolvedValue(mintResponse("files/250.jpg", "tok1"));
    const { ensureRenderTokens } = await freshModule();
    await ensureRenderTokens(["files/250.jpg"]);
    nowOffset = 250_000;
    await ensureRenderTokens(["files/250.jpg"]);
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});

describe("M-08 arah-2: entri BASI di-mint ulang dan token baru dipakai", () => {
  it("lewat TTL (301 dtk) → ensure POST lagi; fileUrl memuat token BARU", async () => {
    postMock.mockResolvedValueOnce(mintResponse("files/basi.jpg", "tokLama"));
    const mod = await freshModule();
    await mod.ensureRenderTokens(["files/basi.jpg"]);
    expect(mod.fileUrl("files/basi.jpg")).toContain("token=tokLama");

    // Kadaluarsa: margin 15 dtk → basi pada 286 dtk; pakai 301 utk aman.
    nowOffset = 301_000;
    postMock.mockResolvedValueOnce(mintResponse("files/basi.jpg", "tokBaru"));
    await mod.ensureRenderTokens(["files/basi.jpg"]);
    expect(postMock).toHaveBeenCalledTimes(2);

    nowOffset = 301_000; // tepat setelah mint ulang, entri segar relatif thd ini
    // expiresAt = now(301s) + (300-15)s → fileUrl pada saat sama wajib segar.
    expect(mod.fileUrl("files/basi.jpg")).toContain("token=tokBaru");
    expect(mod.fileUrl("files/basi.jpg")).not.toContain("tokLama");
  });

  it("PRA-fix regresi guard: setelah expired, fileUrl TIDAK mengembalikan url polos selamanya", async () => {
    postMock.mockResolvedValue(mintResponse("files/hidup.jpg", "tokA"));
    const mod = await freshModule();
    await mod.ensureRenderTokens(["files/hidup.jpg"]);
    nowOffset = 301_000;
    // ensure() harus menyapu entri expired (purge) DAN me-mint ulang:
    await mod.ensureRenderTokens(["files/hidup.jpg"]);
    expect(postMock).toHaveBeenCalledTimes(2);
    const u = mod.fileUrl("files/hidup.jpg");
    expect(u).toMatch(/[?&]token=tokA$|[?&]token=tokA&/);
    // (token sama krn response mock sama — yang dipaku: ADA token, bukan polos)
    expect(u).not.toBe(u.split("?")[0]);
  });
});

describe("kualitas kunci (ekstra M-08): query/fragment dibuang dari key", () => {
  it("ensure utk URL ber-token memakai key BERSIH 'files/a.jpg' (bukan 'files/a.jpg?token=…')", async () => {
    postMock.mockResolvedValue(mintResponse("files/a.jpg", "tok1"));
    const { ensureRenderTokens } = await freshModule();
    await ensureRenderTokens(["https://example.test/public/images/files/a.jpg?token=stale"]);
    expect(postMock).toHaveBeenCalledTimes(1);
    const body = postMock.mock.calls[0][1] as { keys: string[] };
    expect(body.keys).toEqual(["files/a.jpg"]);
  });

  it("appendRenderToken pada URL yang sudah berm_token tidak menambah token kedua", async () => {
    postMock.mockResolvedValue(mintResponse("files/d.jpg", "tokFresh"));
    const mod = await freshModule();
    await mod.ensureRenderTokens(["files/d.jpg"]);
    const sudah = mod.fileUrl("files/d.jpg");
    expect(sudah).toContain("token=tokFresh");
    expect(mod.appendRenderToken(sudah)).toBe(sudah); // idempoten
    expect(sudah.match(/[?&]token=/g) || []).toHaveLength(1);
  });
});
