/**
 * Watermark teks — fungsi MURNI (tanpa native/Skia) agar dapat di-jest.
 *
 * Keputusan user 2026-09-19 (brief team/2026-09-19-mobile-photo-watermark-brief.md):
 * isi watermark = tanggal/jam + GPS. Skema zona waktu mengikuti aplikasi:
 * WIB (Asia/Jakarta), sama dengan `getWIBDateString` di utils.ts.
 *
 * Format yang dipilih:
 *   - Tanggal/jam : `dd-MM-yyyy HH:mm:ss` WIB  →  contoh `19-09-2026 14:30:05 WIB`
 *   - GPS         : `-6.123456, 106.123456` (6 desimal ≈ 0,11 m, cukup untuk
 *                   jejak audit dan tidak mengklaim presisi berlebih)
 *
 * GPS 6 desimal dipilih (bukan 7-8) karena akurasi GPS ponsel di lapangan
 * realistis 3–10 m; digit tambahan hanya menyesatkan pembaca laporan.
 */

/** Label zona waktu yang selalu ditampilkan (keputusan: seluruh app memakai WIB). */
export const WATERMARK_TIMEZONE_LABEL = "WIB";

/** Jumlah desimal koordinat GPS pada watermark. */
export const WATERMARK_GPS_DECIMALS = 6;

/**
 * Format tanggal+jam WIB sebagai `dd-MM-yyyy HH:mm:ss`.
 *
 * Memakai `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", ... })`
 * lalu menyusun ulang bagian-bagiannya secara eksplisit — bukan
 * `toLocaleString` round-trip, yang tidak andal di Hermes (lihat catatan
 * `getWIBDateString` di utils.ts). Opsi `date` dapat diinjeksi untuk tes.
 */
export function formatWatermarkDateTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const dd = get("day");
  const mm = get("month");
  const yyyy = get("year");
  // Hermes kadang mengembalikan "24" untuk tengah malam pada hour12:false.
  const rawHour = get("hour");
  const hh = rawHour === "24" ? "00" : rawHour;
  const mi = get("minute");
  const ss = get("second");

  return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss} ${WATERMARK_TIMEZONE_LABEL}`;
}

/**
 * Format koordinat GPS sebagai `lat, lon` dengan 6 desimal.
 * Mengembalikan `null` bila koordinat tidak valid — pemanggil menampilkan
 * watermark waktu saja (bukan "null, null" yang menyesatkan).
 */
export function formatWatermarkGps(
  latitude?: number | null,
  longitude?: number | null,
): string | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  // Rentang valid bumi; di luar ini data GPS rusak dan lebih baik tidak ditampilkan.
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  const lat = latitude.toFixed(WATERMARK_GPS_DECIMALS);
  const lon = longitude.toFixed(WATERMARK_GPS_DECIMALS);
  return `${lat}, ${lon}`;
}

/**
 * CATATAN (2026-09-28): `buildWatermarkLines` (menyusun baris GPS+waktu untuk
 * kotak kecil lama) dihapus saat panel bergaya peta menggantikan desain lama —
 * `watermark.ts` kini menyusun barisnya sendiri lewat helper watermarkLayout.
 * Fungsi format di ATAS tetap dipakai panel (formatWatermarkDateTime/Gps).
 */
