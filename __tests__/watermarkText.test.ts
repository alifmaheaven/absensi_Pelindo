/**
 * Tes fungsi MURNI watermark (utils/watermarkText.ts).
 *
 * Modul ini sengaja dipisah dari utils/watermark.ts (yang menyentuh Skia
 * native) supaya logika format dapat diuji tanpa modul native.
 *
 * Tanggal referensi dipilih dengan hati-hati:
 *   2026-09-19T07:30:05Z  →  14:30:05 WIB (UTC+7) pada tanggal yang SAMA,
 * sehingga tes tidak bergantung pada zona waktu mesin yang menjalankan Jest.
 */
import {
  formatWatermarkDateTime,
  formatWatermarkGps,
  WATERMARK_TIMEZONE_LABEL,
} from "../utils/watermarkText";

describe("watermarkText — formatWatermarkDateTime", () => {
  it("memformat waktu UTC ke WIB (UTC+7) dengan dd-MM-yyyy HH:mm:ss", () => {
    const date = new Date("2026-09-19T07:30:05Z");
    expect(formatWatermarkDateTime(date)).toBe(
      `19-09-2026 14:30:05 ${WATERMARK_TIMEZONE_LABEL}`,
    );
  });

  it("menggeser tanggal dengan benar saat WIB melewati tengah malam", () => {
    // 18:00Z = 01:00 WIB H+1 — kesalahan zona waktu paling sering muncul di sini.
    const date = new Date("2026-09-19T18:00:00Z");
    expect(formatWatermarkDateTime(date)).toBe("20-09-2026 01:00:00 WIB");
  });

  it("memakai 2 digit untuk hari/bulan/jam (padding)", () => {
    const date = new Date("2026-01-05T02:03:04Z"); // 09:03:04 WIB
    expect(formatWatermarkDateTime(date)).toBe("05-01-2026 09:03:04 WIB");
  });

  it("tidak menghasilkan jam '24' pada tengah malam WIB", () => {
    // 17:00Z = 00:00 WIB — sebagian engine mengembalikan "24" alih-alih "00".
    const date = new Date("2026-09-19T17:00:00Z");
    expect(formatWatermarkDateTime(date)).toBe("20-09-2026 00:00:00 WIB");
  });
});

describe("watermarkText — formatWatermarkGps", () => {
  it("memformat koordinat dengan 6 desimal", () => {
    expect(formatWatermarkGps(-6.1234567, 106.9876543)).toBe(
      "-6.123457, 106.987654",
    );
  });

  it("mengembalikan null bila koordinat tidak diberikan", () => {
    expect(formatWatermarkGps(undefined, undefined)).toBeNull();
    expect(formatWatermarkGps(null, null)).toBeNull();
    expect(formatWatermarkGps(-6.2, null)).toBeNull();
    expect(formatWatermarkGps(null, 106.8)).toBeNull();
  });

  it("mengembalikan null untuk nilai non-finite (NaN/Infinity)", () => {
    expect(formatWatermarkGps(NaN, 106.8)).toBeNull();
    expect(formatWatermarkGps(-6.2, NaN)).toBeNull();
    expect(formatWatermarkGps(Infinity, 106.8)).toBeNull();
  });

  it("menolak koordinat di luar rentang bumi (data GPS rusak)", () => {
    expect(formatWatermarkGps(91, 106.8)).toBeNull();
    expect(formatWatermarkGps(-91, 106.8)).toBeNull();
    expect(formatWatermarkGps(-6.2, 181)).toBeNull();
    expect(formatWatermarkGps(-6.2, -181)).toBeNull();
  });

  it("menerima nilai batas yang sah", () => {
    expect(formatWatermarkGps(90, 180)).toBe("90.000000, 180.000000");
    expect(formatWatermarkGps(-90, -180)).toBe("-90.000000, -180.000000");
  });
});
// CATATAN: describe buildWatermarkLines dihapus bersama fungsinya (2026-09-28)
// — panel peta baru menyusun barisnya sendiri (lihat utils/watermarkLayout.ts).
