/**
 * Logika murni untuk peta presensi (check-in / check-out / radius geofence).
 *
 * SENGAJA dipisah dari `AttendanceMapView.tsx` supaya dapat diuji tanpa
 * me-render WebView Leaflet (jsdom tidak menjalankan WebView sungguhan).
 *
 * Jarak memakai `getDistanceInMeters` (Haversine) yang sudah ada di
 * `utils/utils.ts` — TIDAK ada implementasi jarak kedua di sini.
 */
import { getDistanceInMeters } from "@/utils/utils";

/** Status posisi sebuah titik terhadap radius geofence site. */
export type GeofenceStatus = "inside" | "outside" | "unknown";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface AttendanceMapViewProps {
  /** Koordinat check-in. Boleh null/kosong bila tidak terekam. */
  checkinLocation?: GeoPoint | null;
  /** Koordinat check-out. Boleh null/kosong bila belum check-out. */
  checkoutLocation?: GeoPoint | null;
  /**
   * Koordinat pusat site (titik acuan geofence). Boleh null bila kolom
   * site belum terisi atau join belum membawa koordinat.
   */
  siteLocation?: GeoPoint | null;
  /** Radius geofence site dalam meter (`site.tolerance`). */
  radiusMeters?: number | null;
  /** Tinggi area peta dalam piksel. Default 220. */
  height?: number;
  /** Label opsional yang ditampilkan di kartu fallback. */
  siteName?: string | null;
}

export interface GeofencePointEvaluation {
  /** Titik yang dievaluasi, sudah ternormalisasi; null bila tidak valid. */
  point: GeoPoint | null;
  /** Jarak aktual dari pusat site (meter); null bila tidak dapat dihitung. */
  distanceMeters: number | null;
  /** Keputusan di dalam / di luar radius, atau unknown bila data kurang. */
  status: GeofenceStatus;
}

export interface AttendanceMapEvaluation {
  checkin: GeofencePointEvaluation;
  checkout: GeofencePointEvaluation;
  /** Pusat site yang valid, atau null. */
  site: GeoPoint | null;
  /** Radius valid (> 0), atau null. */
  radiusMeters: number | null;
  /** True bila peta Leaflet layak dirender (minimal 1 titik koordinat ada). */
  canRenderMap: boolean;
}

/** True bila nilai adalah angka hingga (bukan NaN/Infinity/null/undefined). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Normalisasi pasangan koordinat menjadi `GeoPoint`, atau null bila tidak valid.
 * Menolak NaN, Infinity, null, undefined, dan nilai non-angka — sekaligus
 * menolak rentang di luar bumi agar `L.marker` tidak menerima nilai sampah.
 */
export function toGeoPoint(
  lat?: number | null,
  lng?: number | null
): GeoPoint | null {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Normalisasi radius. Radius harus angka hingga dan > 0 agar `L.circle`
 * tidak menggambar lingkaran tak terlihat / error.
 */
export function toRadiusMeters(radius?: number | null): number | null {
  if (!isFiniteNumber(radius) || radius <= 0) return null;
  return radius;
}

/**
 * Evaluasi satu titik terhadap geofence.
 *
 * Aturan (konsisten dengan `app/(no-tabs)/checkin.tsx:209`):
 *   inRange === getDistanceInMeters(...) <= tolerance
 * Perbandingan memakai `<=` sehingga tepat di tepi radius dihitung DI DALAM.
 * Ini penting: peta tidak boleh menyatakan "Di Luar Area Presensi" untuk titik
 * yang diterima sebagai sah oleh gerbang check-in.
 */
export function evaluateGeofencePoint(
  point: GeoPoint | null,
  site: GeoPoint | null,
  radiusMeters: number | null
): GeofencePointEvaluation {
  if (!point || !site || radiusMeters == null) {
    return { point, distanceMeters: null, status: "unknown" };
  }

  const distanceMeters = getDistanceInMeters(
    point.lat,
    point.lng,
    site.lat,
    site.lng
  );

  if (!Number.isFinite(distanceMeters)) {
    return { point, distanceMeters: null, status: "unknown" };
  }

  return {
    point,
    distanceMeters,
    status: distanceMeters <= radiusMeters ? "inside" : "outside",
  };
}

/**
 * Evaluasi lengkap peta presensi: menormalkan input mentah, menghitung jarak
 * check-in/check-out terhadap pusat site, dan memutuskan apakah peta layak
 * dirender atau harus jatuh ke kartu fallback koordinat numerik.
 */
export function evaluateAttendanceMap(params: {
  checkinLocation?: GeoPoint | null;
  checkoutLocation?: GeoPoint | null;
  siteLocation?: GeoPoint | null;
  radiusMeters?: number | null;
}): AttendanceMapEvaluation {
  // SEMUA titik WAJIB melewati toGeoPoint() di sini. Tanpa ini, validasi
  // rentang (lat ±90, lng ±180) hanya hidup di test dan koordinat rusak
  // (mis. 999) lolos ke HTML Leaflet sebagai `Invalid LatLng` → peta kosong.
  const site = toGeoPoint(params.siteLocation?.lat, params.siteLocation?.lng);
  const radiusMeters = toRadiusMeters(params.radiusMeters ?? null);
  const checkinPoint = toGeoPoint(
    params.checkinLocation?.lat,
    params.checkinLocation?.lng
  );
  const checkoutPoint = toGeoPoint(
    params.checkoutLocation?.lat,
    params.checkoutLocation?.lng
  );

  return {
    checkin: evaluateGeofencePoint(checkinPoint, site, radiusMeters),
    checkout: evaluateGeofencePoint(checkoutPoint, site, radiusMeters),
    site,
    radiusMeters,
    // Peta hanya dirender bila ada minimal satu titik VALID untuk dipusatkan.
    // Koordinat rusak sudah menjadi null di atas, sehingga tidak pernah
    // memaksa render peta kosong (MOB-03).
    canRenderMap: Boolean(checkinPoint || checkoutPoint || site),
  };
}

/** Jarak meter diformat ringkas: < 1000 m -> "812 m", >= 1000 m -> "1,24 km". */
export function formatDistanceMeters(distanceMeters?: number | null): string {
  if (!isFiniteNumber(distanceMeters)) return "-";
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  const km = distanceMeters / 1000;
  return `${km.toFixed(2).replace(".", ",")} km`;
}

/** Teks badge status geofence (Bahasa Indonesia, sesuai spesifikasi UX).
 *  GPS-06: satu istilah kanonik 'area presensi' — kata 'radius' di UI hanya
 *  boleh berdampingan dengan angka meter (rubrik C.3#1), jadi keluarga label
 *  ini tidak memakainya. */
export function getGeofenceStatusLabel(status: GeofenceStatus): string {
  switch (status) {
    case "inside":
      return "Di Dalam Area Presensi";
    case "outside":
      return "Di Luar Area Presensi";
    case "unknown":
    default:
      return "Area Presensi Tidak Diketahui";
  }
}

/** Format koordinat numerik untuk kartu fallback: "-7.204451, 112.669387". */
export function formatCoordinatePair(
  point?: GeoPoint | null,
  fractionDigits = 6
): string {
  if (!point) return "-";
  return `${point.lat.toFixed(fractionDigits)}, ${point.lng.toFixed(fractionDigits)}`;
}

/**
 * True bila URL merupakan dokumen utama WebView, bukan sub-resource.
 *
 * `onHttpError` di react-native-webview dapat terpicu PER RESOURCE (mis. satu
 * tile OSM yang gagal karena rate-limit / koneksi port yang flaky). Kegagalan
 * satu tile TIDAK boleh menjatuhkan seluruh peta ke kartu fallback, karena
 * peta yang berfungsi baik akan digantikan secara permanen.
 *
 * Dokumen utama dimuat dari `source={{ html }}`, sehingga URL-nya bukan http(s):
 * biasanya `about:blank` atau string kosong.
 */
export function isMainDocumentUrl(url?: string | null): boolean {
  if (!url) return true;
  const normalized = url.trim().toLowerCase();
  if (normalized === "" || normalized === "about:blank") return true;
  // Dokumen kita adalah HTML inline; apa pun dari CDN/tile adalah sub-resource.
  return !/^https?:\/\//.test(normalized);
}

/** True bila `onHttpError` layak dianggap kegagalan fatal. */
export function isFatalHttpError(url?: string | null): boolean {
  return isMainDocumentUrl(url);
}

/**
 * True bila kegagalan WebView layak memicu kartu fallback.
 *
 * Grace timer: bila peta sudah pernah selesai memuat (`hasLoaded`) atau masih
 * berada di dalam jendela tenggang, kegagalan diperlakukan sebagai non-fatal
 * agar peta yang lambat-tapi-berfungsi tidak salah digantikan.
 */
export function shouldFallbackToCoordinates(params: {
  hasLoaded: boolean;
  elapsedMs: number;
  graceMs: number;
}): boolean {
  if (params.hasLoaded) return false;
  return params.elapsedMs >= params.graceMs;
}
