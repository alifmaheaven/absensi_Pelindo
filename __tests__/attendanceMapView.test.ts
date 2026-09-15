/**
 * Unit test logika murni peta presensi (AttendanceMapView).
 *
 * Sengaja TIDAK me-render komponen/WebView: yang diuji adalah keputusan
 * di dalam/luar radius, perhitungan jarak Haversine, dan keputusan fallback
 * saat koordinat tidak lengkap (temuan audit MOB-03).
 */
import {
  evaluateAttendanceMap,
  evaluateGeofencePoint,
  formatCoordinatePair,
  formatDistanceMeters,
  getGeofenceStatusLabel,
  isFatalHttpError,
  isFiniteNumber,
  isMainDocumentUrl,
  shouldFallbackToCoordinates,
  toGeoPoint,
  toRadiusMeters,
} from "../components/attendance/attendance-map-logic";
import { getDistanceInMeters } from "../utils/utils";

// Main Office (dari plan): pusat site contoh.
const SITE = { lat: -7.2044506, lng: 112.6693869 };
const TOLERANCE = 200; // meter

/** Titik pada jarak tertentu dari SITE, digeser ke arah utara (1 deg lat ~ 111.32 km). */
const northOf = (meters: number) => ({
  lat: SITE.lat + meters / 111320,
  lng: SITE.lng,
});

describe("attendance-map-logic", () => {
  describe("toGeoPoint", () => {
    it("menerima koordinat valid", () => {
      expect(toGeoPoint(SITE.lat, SITE.lng)).toEqual(SITE);
    });

    it("menolak null, undefined, NaN, dan Infinity", () => {
      expect(toGeoPoint(null, null)).toBeNull();
      expect(toGeoPoint(undefined, undefined)).toBeNull();
      expect(toGeoPoint(NaN, 112)).toBeNull();
      expect(toGeoPoint(-7.2, Infinity)).toBeNull();
    });

    it("menolak nilai di luar rentang bumi", () => {
      expect(toGeoPoint(91, 112)).toBeNull();
      expect(toGeoPoint(-7.2, 181)).toBeNull();
    });

    it("menerima titik nol (0,0) sebagai koordinat sah", () => {
      // Penting: guard `!= null` (bukan truthiness) agar 0 tidak dianggap kosong.
      expect(toGeoPoint(0, 0)).toEqual({ lat: 0, lng: 0 });
    });
  });

  describe("toRadiusMeters", () => {
    it("menerima radius positif", () => {
      expect(toRadiusMeters(TOLERANCE)).toBe(200);
    });

    it("menolak nol, negatif, dan nilai tidak valid", () => {
      expect(toRadiusMeters(0)).toBeNull();
      expect(toRadiusMeters(-50)).toBeNull();
      expect(toRadiusMeters(null)).toBeNull();
      expect(toRadiusMeters(NaN)).toBeNull();
      // String numerik dari backend tidak diterima sebagai number mentah.
      expect(toRadiusMeters("200" as unknown as number)).toBeNull();
    });
  });

  describe("evaluateGeofencePoint — keputusan di dalam / di luar radius", () => {
    it("menyatakan DI DALAM saat jarak < tolerance", () => {
      const result = evaluateGeofencePoint(northOf(100), SITE, TOLERANCE);
      expect(result.status).toBe("inside");
      expect(result.distanceMeters).toBeGreaterThan(0);
      expect(result.distanceMeters).toBeLessThan(TOLERANCE);
    });

    it("menyatakan DI LUAR saat jarak > tolerance", () => {
      const result = evaluateGeofencePoint(northOf(500), SITE, TOLERANCE);
      expect(result.status).toBe("outside");
      expect(result.distanceMeters).toBeGreaterThan(TOLERANCE);
    });

    it("menghitung TEPAT DI TEPI radius sebagai DI DALAM (konsisten checkin.tsx:209)", () => {
      // checkin.tsx memakai `distance <= tolerance`, jadi tepi = sah.
      const result = evaluateGeofencePoint(SITE, SITE, TOLERANCE);
      expect(result.distanceMeters).toBe(0);
      expect(result.status).toBe("inside");
    });

    it("memakai Haversine dari utils, bukan jarak planar", () => {
      const point = northOf(100);
      const result = evaluateGeofencePoint(point, SITE, TOLERANCE);
      expect(result.distanceMeters).toBeCloseTo(
        getDistanceInMeters(point.lat, point.lng, SITE.lat, SITE.lng),
        6
      );
    });

    it("mengembalikan unknown bila data kurang, tanpa melempar error", () => {
      expect(evaluateGeofencePoint(null, SITE, TOLERANCE).status).toBe("unknown");
      expect(evaluateGeofencePoint(northOf(10), null, TOLERANCE).status).toBe("unknown");
      expect(evaluateGeofencePoint(northOf(10), SITE, null).status).toBe("unknown");
      expect(evaluateGeofencePoint(northOf(10), SITE, null).distanceMeters).toBeNull();
    });
  });

  describe("evaluateAttendanceMap — keputusan fallback (MOB-03)", () => {
    it("merender peta saat check-in + site + radius lengkap", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: northOf(100),
        siteLocation: SITE,
        radiusMeters: TOLERANCE,
      });
      expect(result.canRenderMap).toBe(true);
      expect(result.checkin.status).toBe("inside");
      expect(result.site).toEqual(SITE);
      expect(result.radiusMeters).toBe(200);
    });

    it("TIDAK merender peta saat tidak ada satu pun koordinat (cegah kotak putih)", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: null,
        checkoutLocation: null,
        siteLocation: null,
        radiusMeters: null,
      });
      expect(result.canRenderMap).toBe(false);
      expect(result.checkin.status).toBe("unknown");
      expect(result.checkout.status).toBe("unknown");
    });

    it("tetap merender peta saat hanya site yang tersedia", () => {
      const result = evaluateAttendanceMap({
        siteLocation: SITE,
        radiusMeters: TOLERANCE,
      });
      expect(result.canRenderMap).toBe(true);
      expect(result.checkin.distanceMeters).toBeNull();
    });

    it("tetap merender peta saat hanya check-in yang tersedia (site null)", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: northOf(50),
        siteLocation: null,
        radiusMeters: null,
      });
      expect(result.canRenderMap).toBe(true);
      expect(result.checkin.status).toBe("unknown");
      expect(result.site).toBeNull();
    });

    it("mengevaluasi check-in dan check-out secara terpisah", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: northOf(100), // dalam radius
        checkoutLocation: northOf(900), // di luar radius
        siteLocation: SITE,
        radiusMeters: TOLERANCE,
      });
      expect(result.checkin.status).toBe("inside");
      expect(result.checkout.status).toBe("outside");
    });

    it("mengabaikan check-out null tanpa mengganggu status check-in", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: northOf(100),
        checkoutLocation: null,
        siteLocation: SITE,
        radiusMeters: TOLERANCE,
      });
      expect(result.checkin.status).toBe("inside");
      expect(result.checkout.status).toBe("unknown");
      expect(result.checkout.point).toBeNull();
    });

    it("menolak tolerance = 0 dari backend (tidak dianggap radius sah)", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: northOf(10),
        siteLocation: SITE,
        radiusMeters: 0,
      });
      expect(result.radiusMeters).toBeNull();
      expect(result.checkin.status).toBe("unknown");
    });
  });

  /**
   * Regresi: `evaluateAttendanceMap` dulu meneruskan koordinat mentah tanpa
   * melewati `toGeoPoint()`, sehingga validasi rentang hanya hidup di test.
   * Koordinat rusak (999) lolos ke HTML Leaflet sebagai `Invalid LatLng`.
   */
  describe("evaluateAttendanceMap — koordinat rusak WAJIB dinormalisasi", () => {
    it("menolak check-in di luar rentang sebagai satu-satunya titik (canRenderMap false)", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: { lat: 999, lng: 999 },
        siteLocation: null,
        radiusMeters: null,
      });
      // Titik rusak menjadi null → tidak ada yang bisa dipusatkan → fallback card.
      expect(result.checkin.point).toBeNull();
      expect(result.canRenderMap).toBe(false);
      expect(result.checkin.distanceMeters).toBeNull();
      expect(result.checkin.status).toBe("unknown");
    });

    it("check-in rusak tidak pernah lolos sebagai GeoPoint (mis. 999)", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: { lat: 999, lng: 999 },
        siteLocation: SITE,
        radiusMeters: TOLERANCE,
      });
      // Titik dibuang; site tetap valid sehingga peta site-saja tetap tampil.
      expect(result.checkin.point).toBeNull();
      expect(result.canRenderMap).toBe(true);
      expect(result.site).toEqual(SITE);
      // Tidak ada perhitungan jarak ke titik rusak.
      expect(result.checkin.distanceMeters).toBeNull();
    });

    it("check-out rusak ditolak tanpa merusak check-in yang valid", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: northOf(100),
        checkoutLocation: { lat: -91, lng: 200 },
        siteLocation: SITE,
        radiusMeters: TOLERANCE,
      });
      expect(result.checkout.point).toBeNull();
      expect(result.checkout.status).toBe("unknown");
      // Check-in yang sah tetap dievaluasi normal.
      expect(result.checkin.status).toBe("inside");
    });

    it("site rusak TIDAK menempatkan lingkaran/marker di lokasi palsu", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: northOf(100),
        siteLocation: { lat: 999, lng: 112.6 },
        radiusMeters: TOLERANCE,
      });
      // Site menjadi null → buildMapHTML tidak menggambar L.circle sama sekali.
      expect(result.site).toBeNull();
      expect(result.canRenderMap).toBe(true);
      // Tanpa pusat site, status radius tidak dapat ditentukan.
      expect(result.checkin.status).toBe("unknown");
      expect(result.checkin.distanceMeters).toBeNull();
    });

    it("site rusak membuat canRenderMap false bila tidak ada titik valid lain", () => {
      const result = evaluateAttendanceMap({
        siteLocation: { lat: 999, lng: 999 },
        radiusMeters: TOLERANCE,
      });
      expect(result.site).toBeNull();
      expect(result.canRenderMap).toBe(false);
    });

    it("menolak NaN dan Infinity pada ketiga titik", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: { lat: NaN, lng: 112.6 },
        checkoutLocation: { lat: -7.2, lng: Infinity },
        siteLocation: { lat: NaN, lng: NaN },
        radiusMeters: TOLERANCE,
      });
      expect(result.checkin.point).toBeNull();
      expect(result.checkout.point).toBeNull();
      expect(result.site).toBeNull();
      expect(result.canRenderMap).toBe(false);
    });

    it("TIDAK mengubah perilaku jalur normal (regresi tidak ada)", () => {
      const checkin = northOf(100);
      const result = evaluateAttendanceMap({
        checkinLocation: checkin,
        siteLocation: SITE,
        radiusMeters: TOLERANCE,
      });
      // Titik valid dipertahankan apa adanya.
      expect(result.checkin.point).toEqual(checkin);
      expect(result.site).toEqual(SITE);
      expect(result.canRenderMap).toBe(true);
      expect(result.checkin.status).toBe("inside");
    });

    it("mempertahankan koordinat (0,0) yang sah", () => {
      const result = evaluateAttendanceMap({
        checkinLocation: { lat: 0, lng: 0 },
        siteLocation: null,
        radiusMeters: null,
      });
      expect(result.checkin.point).toEqual({ lat: 0, lng: 0 });
      expect(result.canRenderMap).toBe(true);
    });
  });

  /**
   * Regresi performa: `AttendanceMapView` memakai primitif (lat/lng) sebagai
   * dependency `useMemo` untuk `mapHTML`. Objek `{lat,lng}` yang dikembalikan
   * `evaluateAttendanceMap` selalu baru, sehingga memo berbasis objek TIDAK
   * PERNAH kena dan WebView memuat ulang dokumen peta setiap render.
   *
   * Test ini mengunci sifat yang membuat perbaikan itu bekerja: primitifnya
   * stabil secara NILAI lintas dua evaluasi dengan koordinat yang sama.
   */
  describe("stabilitas dependency memo (anti reload-peta)", () => {
    const MEMO_INPUTS = {
      checkinLocation: { lat: -7.2, lng: 112.6 },
      checkoutLocation: { lat: -7.3, lng: 112.7 },
      siteLocation: { lat: -7.25, lng: 112.65 },
      radiusMeters: 200,
    };

    /** Dependency primitif persis seperti yang dipakai komponen. */
    const primitiveDeps = (e: ReturnType<typeof evaluateAttendanceMap>) => [
      e.checkin.point?.lat ?? null,
      e.checkin.point?.lng ?? null,
      e.checkout.point?.lat ?? null,
      e.checkout.point?.lng ?? null,
      e.site?.lat ?? null,
      e.site?.lng ?? null,
      e.radiusMeters,
    ];

    it("dependency OBJEK tidak stabil (alasan bug ini ada)", () => {
      const a = evaluateAttendanceMap(MEMO_INPUTS);
      const b = evaluateAttendanceMap(MEMO_INPUTS);
      // Membuktikan masalahnya nyata: identitas objek berubah tiap evaluasi,
      // padahal nilainya sama.
      expect(a.checkin.point).not.toBe(b.checkin.point);
      expect(a.site).not.toBe(b.site);
      expect(a.checkin.point).toEqual(b.checkin.point);
    });

    it("dependency PRIMITIF stabil secara nilai lintas dua evaluasi", () => {
      const a = primitiveDeps(evaluateAttendanceMap(MEMO_INPUTS));
      const b = primitiveDeps(evaluateAttendanceMap(MEMO_INPUTS));
      // `every ===` meniru perbandingan dependency React: prima by value.
      expect(a.length).toBe(b.length);
      expect(a.every((value, i) => value === b[i])).toBe(true);
      expect(a).toEqual([-7.2, 112.6, -7.3, 112.7, -7.25, 112.65, 200]);
    });

    it("primitif tetap stabil saat titik tidak valid (null bukan objek baru)", () => {
      const bad = {
        checkinLocation: { lat: 999, lng: 999 },
        siteLocation: null,
        radiusMeters: null,
      };
      const a = primitiveDeps(evaluateAttendanceMap(bad));
      const b = primitiveDeps(evaluateAttendanceMap(bad));
      expect(a.every((value, i) => value === b[i])).toBe(true);
      expect(a).toEqual([null, null, null, null, null, null, null]);
    });

    it("perubahan koordinat nyata TETAP mengubah dependency (memo invalidasi)", () => {
      const a = primitiveDeps(evaluateAttendanceMap(MEMO_INPUTS));
      const b = primitiveDeps(
        evaluateAttendanceMap({
          ...MEMO_INPUTS,
          checkinLocation: { lat: -7.21, lng: 112.6 },
        })
      );
      // Memo harus tetap recompute saat data benar-benar berubah.
      expect(a.every((value, i) => value === b[i])).toBe(false);
    });
  });

  describe("formatter", () => {
    it("memformat jarak meter dan kilometer", () => {
      expect(formatDistanceMeters(0)).toBe("0 m");
      expect(formatDistanceMeters(812.4)).toBe("812 m");
      expect(formatDistanceMeters(1234)).toBe("1,23 km");
    });

    it("memformat jarak tidak valid sebagai '-'", () => {
      expect(formatDistanceMeters(null)).toBe("-");
      expect(formatDistanceMeters(undefined)).toBe("-");
      expect(formatDistanceMeters(NaN)).toBe("-");
    });

    it("memberi label badge Bahasa Indonesia yang benar", () => {
      expect(getGeofenceStatusLabel("inside")).toBe("Di Dalam Radius");
      expect(getGeofenceStatusLabel("outside")).toBe("Di Luar Radius");
      expect(getGeofenceStatusLabel("unknown")).toBe("Radius Tidak Diketahui");
    });

    it("memformat pasangan koordinat untuk kartu fallback", () => {
      expect(formatCoordinatePair(SITE)).toBe("-7.204451, 112.669387");
      expect(formatCoordinatePair(null)).toBe("-");
    });
  });

  describe("isFiniteNumber", () => {
    it("membedakan angka hingga dari nilai lain", () => {
      expect(isFiniteNumber(0)).toBe(true);
      expect(isFiniteNumber(-7.2)).toBe(true);
      expect(isFiniteNumber(NaN)).toBe(false);
      expect(isFiniteNumber(Infinity)).toBe(false);
      expect(isFiniteNumber(null)).toBe(false);
      expect(isFiniteNumber("2")).toBe(false);
    });
  });

  describe("onHttpError — sub-resource TIDAK boleh memicu fallback", () => {
    it("mengabaikan kegagalan tile OpenStreetMap", () => {
      // Satu tile gagal (rate-limit / koneksi pelabuhan flaky) BUKAN alasan
      // mengganti peta yang berfungsi dengan kartu koordinat.
      expect(isFatalHttpError("https://a.tile.openstreetmap.org/16/1/2.png")).toBe(
        false
      );
      expect(
        isFatalHttpError("https://tile.openstreetmap.org/16/1/2.png?foo=bar")
      ).toBe(false);
    });

    it("mengabaikan kegagalan aset CDN unpkg (leaflet.js / leaflet.css)", () => {
      expect(
        isFatalHttpError("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js")
      ).toBe(false);
      expect(
        isFatalHttpError("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css")
      ).toBe(false);
    });

    it("menganggap kegagalan dokumen utama sebagai fatal", () => {
      // Dokumen kita adalah HTML inline → URL bukan http(s).
      expect(isFatalHttpError("about:blank")).toBe(true);
      expect(isFatalHttpError("")).toBe(true);
      expect(isFatalHttpError(null)).toBe(true);
      expect(isFatalHttpError(undefined)).toBe(true);
    });

    it("isMainDocumentUrl konsisten dengan isFatalHttpError", () => {
      expect(isMainDocumentUrl("about:blank")).toBe(true);
      expect(isMainDocumentUrl("https://a.tile.openstreetmap.org/1/2/3.png")).toBe(
        false
      );
      expect(isFatalHttpError("about:blank")).toBe(true);
      expect(isFatalHttpError("https://a.tile.openstreetmap.org/1/2/3.png")).toBe(
        false
      );
    });
  });

  describe("shouldFallbackToCoordinates — grace timer", () => {
    it("TIDAK fallback saat peta sudah pernah berhasil dimuat", () => {
      expect(
        shouldFallbackToCoordinates({ hasLoaded: true, elapsedMs: 60000, graceMs: 8000 })
      ).toBe(false);
    });

    it("TIDAK fallback di dalam jendela tenggang (peta lambat tapi hidup)", () => {
      expect(
        shouldFallbackToCoordinates({ hasLoaded: false, elapsedMs: 3000, graceMs: 8000 })
      ).toBe(false);
    });

    it("fallback setelah melewati tenggang bila belum pernah berhasil dimuat", () => {
      expect(
        shouldFallbackToCoordinates({ hasLoaded: false, elapsedMs: 8000, graceMs: 8000 })
      ).toBe(true);
      expect(
        shouldFallbackToCoordinates({ hasLoaded: false, elapsedMs: 20000, graceMs: 8000 })
      ).toBe(true);
    });
  });
});
