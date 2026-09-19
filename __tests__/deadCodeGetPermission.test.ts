/**
 * F4 — M-05 (vonis: hapus, bukan comment-documented).
 * Alasan: 0 call-site TERUKUR (grep repo, 2026-09-19); kontrak rute berubah
 * SEJALAN (GET /permission kini RequirePermission('role_read') — backend
 * caa4872) sehingga kode mati ini bukan lagi "siap pakai" bila dihidupkan;
 * komentar dokumentasi tetap mengundang impor-pakai-rusak. Riwayat git sudah
 * menyimpannya. Test ini mengunci anti-kehidupan-kembali.
 */

const read = (p: string) => require("fs").readFileSync(p, "utf8") as string;

describe("M-05: getPermission/IPermission dipensiunkan penuh", () => {
  it("services/auth.ts tidak lagi mendeklarasikan getPermission", () => {
    // NB: `const getPermission = ...` di hooks/useImagePicker.ts adalah
    // variabel LOKAL kamera (tak Terkait layanan ini) — pola di sini khusus
    // simbol deklarasi/impor, bukan substring bebas.
    expect(read("services/auth.ts")).not.toMatch(/function getPermission/);
  });

  it("tidak ada rujukan simbol IPermission/getPermission() di source (di luar test pengunci ini)", () => {
    const { execSync } = require("child_process");
    // Sengaja TIDAK menyusisir hooks/: `getPermission` di sana adalah variabel
    // LOKAL kamera useImagePicker (tak berhubungan dengan service ini).
    const out = execSync(
      "grep -rn --include='*.ts' --include='*.tsx' -E 'IPermission|function getPermission|import.*\\bgetPermission\\b' app components lib services stores types utils constants || true",
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });
});
