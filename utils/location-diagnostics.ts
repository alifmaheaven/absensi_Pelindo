/**
 * WAVE-0 / rubrik UIUX C.2 — diagnosis kegagalan lokasi utk check-in/out.
 *
 * FUNGSI MURNI: tidak menyentuh native API, sehingga penyebab → pesan dapat
 * diuji tanpa simulator (pola __tests__/utils.test.ts). Layar hanya memetakan
 * hasil probe `expo-location` ke `LocationProbeResult` lalu memanggil sini.
 *
 * Empat penyebab yang dibedakan (kebijakan GPS WAJIB — owner 2026-09-18):
 *  A PERMISSION  — izin lokasi aplikasi belum/mati di sistem.
 *  B SERVICES    — izin OK tapi layanan lokasi perangkat mati (GPS/provider).
 *  C NO_FIX      — layanan hidup, tapi posisi tidak terkunci dalam timeout.
 *  D OUT_OF_RANGE— posisi ada, tapi di luar radius geofence site terpilih.
 *
 * Aturan copy (steer koordinator #2/#3):
 *  - Tiga pesan A/B/C BEDA kata-per-kata (gerbang U-16) — dijamin oleh konstanta
 *    teks berbeda + assertion di tes.
 *  - 'Hubungi Pengawas' HANYA prosa dalam pesan; tidak ada tombol kontak
 *    (aplikasi tidak punya data kontak atasan).
 *  - 'Coba Lagi' TIDAK ditawarkan pada kasus PERMISSION tanpa bukti field
 *    `canAskAgain` pada runtime — karena tidak terbukti, tombol utama kasus A
 *    hanya 'Buka Pengaturan'.
 *  - Angka timeout pada pesan C = satu sumber dengan kode (LOCATION_FIX_TIMEOUT_MS).
 */

/** Batas tunggu fix posisi; pesan C menampilkan nilai ini ("±15 detik"). */
export const LOCATION_FIX_TIMEOUT_MS = 15000;

export type LocationFailureCause = "PERMISSION" | "SERVICES" | "NO_FIX" | "OUT_OF_RANGE";

export type LocationAction = "RETRY" | "OPEN_SETTINGS" | "ENABLE_SERVICES";

export interface LocationProbeResult {
  /** Status perizinan expo-location: 'granted' | 'denied' | 'unnecessary' | ... */
  permissionStatus?: string;
  /** Hasil hasServicesEnabledAsync()/provider-status; undefined = probe gagal. */
  servicesEnabled?: boolean;
  /** true bila posisi berhasil diperoleh dalam timeout. */
  hasFix: boolean;
}

/**
 * Klasifikasi BERURUTAN A → B → C. Keluar null bila tidak ada kegagalan
 * (fix ada dan dalam radius — gerbang D dievaluasi terpisah oleh layar
 * terhadap site terpilih).
 */
export function classifyLocationFailure(
  probe: LocationProbeResult,
): Exclude<LocationFailureCause, "OUT_OF_RANGE"> | null {
  if (probe.permissionStatus !== "granted" && probe.permissionStatus !== "unnecessary") {
    return "PERMISSION";
  }
  if (probe.servicesEnabled === false) {
    return "SERVICES";
  }
  if (!probe.hasFix) {
    return "NO_FIX";
  }
  return null;
}

export interface LocationFailureCopy {
  title: string;
  /** Ambang UIUX-02 (diamandemen 2026-09-18): total ≤220 char SAH bila
   *  langkah dirender via `steps` (baris ≤40 char) dan kalimat pertama
   *  mandiri ≤80 char. */
  message: string;
  /** Rangkuman langkah utk dirender SEBAGAI LIST BARIS PENDEK (bukan paragraf). */
  steps?: string[];
  /** Aksi yang ditawarkan, berurutan. 'RETRY' sengaja tidak muncul utk A. */
  actions: LocationAction[];
}

const COPY_SECONDS = Math.round(LOCATION_FIX_TIMEOUT_MS / 1000);

/** Pemetaan tunggal penyebab → copy. Layar TIDAK menulis pesan sendiri. */
export function getLocationFailureCopy(cause: LocationFailureCause): LocationFailureCopy {
  switch (cause) {
    case "PERMISSION":
      return {
        title: "Izin Lokasi Belum Diberikan",
        message:
          "Aplikasi belum punya izin lokasi, padahal presensi wajib lokasi. " +
          "Buka Pengaturan dan aktifkan izin lokasi, lalu kembali ke sini. " +
          "Jika tetap gagal, hubungi pengawas Anda.",
        actions: ["OPEN_SETTINGS"],
      };
    case "SERVICES":
      return {
        title: "Layanan Lokasi Perangkat Mati",
        message:
          "Izin aplikasi sudah aktif, tetapi GPS perangkat Anda sedang mati. " +
          "Nyalakan layanan lokasi, lalu tekan tombol di bawah. " +
          "Jika tetap gagal, hubungi pengawas Anda.",
        actions: ["ENABLE_SERVICES", "OPEN_SETTINGS", "RETRY"],
      };
    case "NO_FIX":
      return {
        title: "Sinyal GPS Tidak Ditemukan",
        message:
          `Posisi Anda belum terkunci setelah ±${COPY_SECONDS} detik. ` +
          "Lakukan langkah ini, lalu tekan Coba Lagi. " +
          "Jika tetap gagal, presensi tidak bisa dilanjutkan — hubungi pengawas Anda.",
        steps: [
          "Pindah ke area terbuka/dekat jendela",
          "Matikan mode pesawat, nyalakan Wi-Fi",
          "Matikan lalu nyalakan kembali GPS",
        ],
        actions: ["RETRY", "OPEN_SETTINGS"],
      };
    case "OUT_OF_RANGE":
      // dipakai lewat formatOutOfRangeCopy; pesan generik ini fallback.
      return {
        title: "Di Luar Area Presensi",
        message:
          "Posisi Anda masih di luar radius lokasi presensi yang dipilih. Mendekatlah ke titik lokasi. " +
          "Bila Anda sudah berada di lokasi namun tetap ditolak, hubungi pengawas Anda.",
        actions: ["RETRY"],
      };
  }
}

export interface OutOfRangeInfo {
  /** Jarak aktual meter (sudah dihitung layar via sitesList). */
  distanceMeters: number;
  /** Radius site (tolerance). null/undefined = admin belum mengisi radius. */
  toleranceMeters?: number | null;
  siteName?: string | null;
}

/**
 * Copy gerbang radius (menggantikan Alert bahasa Inggris mentah). Jarak
 * aktual SELALU ditampilkan — angka yang sama dengan kartu site.
 *
 * Ambang UIUX-02 (diamandemen): kalimat pertama ≤80 char berdiri sendiri
 * ("Posisi Anda N m dari <site>."), total ≤220 char — dipegang oleh
 * assertion CI di __tests__/locationDiagnostics.test.ts.
 */
export function formatOutOfRangeCopy(info: OutOfRangeInfo): LocationFailureCopy {
  const base = getLocationFailureCopy("OUT_OF_RANGE");
  const distance = Number.isFinite(info.distanceMeters)
    ? Math.round(info.distanceMeters)
    : null;
  const where = info.siteName ? `"${info.siteName}"` : "site terpilih";
  const first = `Posisi Anda ${distance == null ? "?" : distance} m dari ${where}.`;
  const rest =
    info.toleranceMeters == null
      ? "Radius presensi lokasi ini belum diatur administrator sehingga absensi ditolak. " +
        "Mendekatlah lalu tekan Coba Lagi, atau hubungi pengawas Anda."
      : `Batas radius presensi ${Math.round(info.toleranceMeters)} m. ` +
        "Mendekatlah ke titik lokasi. Bila tetap ditolak padahal sudah di lokasi, hubungi pengawas Anda.";
  return {
    ...base,
    message: `${first} ${rest}`,
  };
}

/** False bila teks masih mengandung sisa copy template lama (gerbang tes). */
export function containsLegacyEnglish(text: string): boolean {
  return /must be within range|location permission/i.test(text);
}
