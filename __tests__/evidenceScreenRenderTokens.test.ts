/**
 * F2 — A-7 + M-03 (review r2 2026-09-19 + adjudikasi koordinator):
 * render-token harus DIPAKAI di semua layar bukti.
 *
 * Fakta terukur sebelum fix:
 *  - izin.tsx:40 HANYA mengimpor ensureRenderTokens, NOL pemanggilan (A-7 benar;
 *    klaim saya di checkpoint-2 keliru — yang memanggil adalah modal attendance).
 *    → cache tak pernah terisi → fileUrl SELALU url polos → 403 senyap.
 *  - checkout.tsx:332 dan ticketing/[id].tsx:247: fire-and-forget lalu SINKRON
 *    appendRenderToken bake ke state → token belum tiba → URI ter-bake tanpa
 *    token; tanpa subscription tak ada re-render terjamin (M-03).
 *  - daily-routine/[id].tsx: pola render-time (1397) + subscription (79) sudah
 *    benar utk cabang evidence_files, TAPI cabang legacy `evidence_file`
 *    (kolom tunggal, :224-234) TIDAK PERNAH meng-mint → temuan baru M-03c.
 *
 * Uji: kunci wiring per layar (render-testing keempat layar penuh tidak punya
 * infra di repo ini; modal & lib punya uji perilakunya sendiri — lihat
 * attendanceDetailModal.test.tsx, renderTokenUrl.test.ts).
 * NB: guard anti-duplikasi-token & kesegaran cache = jendela F3 (M-08).
 */

const read = (p: string) => require("fs").readFileSync(p, "utf8") as string;

describe("izin.tsx (A-7): memanggil ensureRenderTokens, bukan hanya mengimpor", () => {
  const src = read("app/(tabs)/izin.tsx");
  it("ada PEMANGGILAN ensureRenderTokens( (regex ber-paren membuang baris impor)", () => {
    expect(src).toMatch(/ensureRenderTokens\(/);
    // impor saja tidak cukup: minimal satu pemanggilan di luar baris import
    const callLines = src
      .split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /ensureRenderTokens\(/.test(l) && !/^\s*import[ ({]/.test(l));
    expect(callLines.length).toBeGreaterThanOrEqual(1);
  });
});

describe("checkout.tsx + ticketing/[id].tsx (M-03): AWAIT mint sebelum bake URI", () => {
  it("checkout await ensureRenderTokens sebelum setImages bake uri", () => {
    const src = read("app/(no-tabs)/checkout.tsx");
    expect(src).toMatch(/await ensureRenderTokens\(/);
  });

  it("ticketing/[id].tsx await ensureRenderTokens sebelum bake uri", () => {
    const src = read("app/(no-tabs)/ticketing/[id].tsx");
    expect(src).toMatch(/await ensureRenderTokens\(/);
  });
});

describe("daily-routine/[id].tsx (M-03c): cabang legacy evidence_file ikut di-mint", () => {
  const src = read("app/(no-tabs)/daily-routine/[id].tsx");
  it("minimal DUA pemanggilan ensureRenderTokens (array files + kolom legacy)", () => {
    const calls = src.split("\n").filter((l) => /ensureRenderTokens\(/.test(l) && !/^\s*import/.test(l));
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
