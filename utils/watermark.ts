/**
 * Watermark burn-in foto KAMERA (Mobile).
 *
 * KEPUTUSAN USER 2026-09-19 (brief team/2026-09-19-mobile-photo-watermark-brief.md):
 *   1. Isi watermark  : tanggal/jam WIB + koordinat GPS.
 *   2. Cakupan        : foto KAMERA saja — foto dari GALERI tidak distamp.
 *   3. Jalur teknis   : @shopify/react-native-skia (rebuild native diterima).
 *   4. Kebijakan gagal: FAIL-SOFT — kegagalan watermark TIDAK PERNAH memblokir
 *      absensi; foto asli tetap dikirim dan kegagalan dicatat ke log.
 *
 * MENGAPA SKIA
 * ------------
 * `expo-image-manipulator` SDK 56 hanya mendukung resize/rotate/flip/crop dan
 * `extent` (web-only): TIDAK ADA kemampuan menggambar teks atau mengomposit
 * gambar. Karena itu burn-in memerlukan modul native Skia.
 *
 * KONTRAK FAIL-SOFT (keputusan 4)
 * -------------------------------
 * `applyCameraWatermark()` TIDAK PERNAH throw dan SELALU mengembalikan uri:
 *  - sukses            → uri file BARU yang sudah ber-watermark;
 *  - gagal apa pun     → uri ASAL (tanpa watermark), dicatat `console.warn`.
 * Pemanggil karena itu aman memakai hasilnya langsung tanpa try/catch, dan
 * alur bukti (persist → state → antrean offline) tidak pernah terputus.
 *
 * Ini berbeda dari kontrak `evidenceStorage.persistEvidenceImage()` yang
 * sengaja LOUD/throwing (P0-0.6): di sana kegagalan berarti BUKTI HILANG,
 * sehingga wajib terlihat. Di sini kegagalan hanya berarti foto tampil tanpa
 * cap — bukti tetap utuh dan terkirim, jadi menolak absensi justru merugikan.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { Platform } from "react-native";
import {
  TILE_SIZE,
  WATERMARK_LINE_HEIGHT_RATIO,
  WATERMARK_MAP_WIDTH_RATIO,
  clampLines,
  formatAddressLines,
  mapThumbnailHeight,
  panelHeightFor,
  tileRangeFor,
  watermarkFontSize,
  watermarkMapZoom,
  wrapTextToWidth,
} from "./watermarkLayout";
import {
  formatWatermarkDateTime,
  formatWatermarkGps,
} from "./watermarkText";
import { loadMapTiles, fetchAddress, type LoadedTile } from "./watermarkMap";

/** Label pemilik bukti pada panel (keputusan user 2026-09-28). */
export const WATERMARK_BRAND = "PT Prakhya Tama Cakrawala";

/**
 * Atribusi WAJIB tile OpenStreetMap (kebijakan lisensi OSM), bukan pilihan
 * gaya: bentuk yang disyaratkan menyebut "OpenStreetMap contributors".
 */
export const WATERMARK_MAP_ATTRIBUTION = "© OpenStreetMap contributors";

/** GPS yang lebih tua dari ini tidak dipakai (watermark tidak boleh berbohong). */
const GPS_MAX_AGE_MS = 5 * 60 * 1000;

/** Batas tunggu fix GPS sebelum menyerah dan memakai waktu saja. */
const GPS_FIX_TIMEOUT_MS = 8000;

/** Kualitas encode ulang JPEG hasil watermark (0-100). */
const WATERMARK_JPEG_QUALITY = 75;

/** Garis dasar (baseline) untuk membalik ekspektasi urutan baris. */
export interface WatermarkGps {
  latitude: number;
  longitude: number;
}

/**
 * Ambil koordinat GPS terakhir yang masih layak dipakai watermark, tanpa
 * memaksa dialog izin.
 *
 * Urutan: izin sudah GRANTED? → posisi `current` (timeout 8 dtk) → `lastKnown`
 * berumur ≤ 5 menit → null. Sengaja TIDAK memanggil request*PermissionsAsync:
 * watermark tidak boleh memunculkan dialog izin di tengah alur absensi (dan di
 * layar seperti ticketing izin lokasi mungkin belum pernah diminta). Bila izin
 * belum ada, watermark cukup menampilkan waktu.
 */
async function resolveGpsForWatermark(): Promise<WatermarkGps | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return null;

    try {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), GPS_FIX_TIMEOUT_MS),
        ),
      ]);
      if (pos && "coords" in pos && pos.coords) {
        return {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
      }
    } catch {
      // lanjut ke last-known
    }

    const last = await Location.getLastKnownPositionAsync({
      maxAge: GPS_MAX_AGE_MS,
    });
    if (last?.coords) {
      return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

/** Format yang tidak dapat didekode Skia (HEIF/HEIC) → lewati watermark. */
function isUnsupportedFormat(uri: string): boolean {
  return /\.(heic|heif)(?:\?|#|$)/i.test(uri);
}

/**
 * Nama pengguna untuk baris keterangan panel (permintaan user 2026-09-29).
 *
 * SENGAJA TIDAK diambil dari `useAuthStore` di dalam modul ini: mengimpor
 * `stores/auth` menarik `lib/cache` → AsyncStorage, sehingga setiap suite Jest
 * yang menyentuh watermark wajib mem-mock AsyncStorage — kopling yang tidak
 * sepadan hanya demi satu baris teks (terbukti memerahkan 2 suite saat dicoba).
 *
 * Karena itu nama dikirim sebagai PARAMETER oleh pemanggil yang sudah punya
 * konteks React (`useImagePicker`). Normalisasi: kosong/spasi → null supaya
 * baris nama dilewati, bukan menampilkan placeholder palsu.
 */
export function normalizeWatermarkName(name?: string | null): string | null {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed ? trimmed : null;
}

/**
 * Gambar panel watermark di bagian BAWAH foto:
 *
 *   ┌──────────┬──────────────────────────────────────────────┐
 *   │  PETA    │  Kota Pekalongan, Jawa Tengah, Indonesia      │
 *   │  + pin   │  Jl. Industri III, Karangmalang, …            │
 *   │          │  -6.888500, 109.675400 · 28-09-2026 14:30 WIB │
 *   └──────────┴──────────────────────────────────────────────┘
 *      © OpenStreetMap                    PT Prakhya Tama Cakrawala
 *
 * Tinggi panel tetap (rasio tetap terhadap foto) supaya tata letak konsisten;
 * alamat panjang dipenggal ke jumlah baris terbatas agar tidak menutupi foto.
 *
 * Skia diteruskan sebagai parameter (`Skia`) alih-alih diimpor di sini, supaya
 * modul tetap bisa dimuat di lingkungan tanpa native Skia (Jest).
 *
 * Diekspor HANYA untuk dapat diuji: jalur gambar ini tidak dapat dirender di
 * Jest (Skia native), jadi satu-satunya cara melindunginya dari regresi
 * (mis. klip 1-argumen yang membuat peta meluber & pin hilang di device
 * 2026-09-29) adalah menjalankannya dengan kanvas palsu yang merekam setiap
 * panggilan. Lihat __tests__/watermarkPanel.test.ts.
 */
export function drawPanel(params: {
  Skia: any;
  canvas: any;
  width: number;
  height: number;
  panelHeight: number;
  mapWidth: number;
  mapHeight: number;
  gps: { latitude: number; longitude: number } | null;
  address: { region: string | null; detail: string | null };
  /** Nama pengguna login; null = baris nama dilewati. */
  userName?: string | null;
  loadedTiles: { image: unknown; drawX: number; drawY: number; size: number }[];
  FontWeight: any;
  ClipOp: any;
  PaintStyle: any;
}): void {
  const {
    Skia,
    canvas,
    width,
    height,
    panelHeight,
    mapWidth,
    mapHeight,
    gps,
    address,
    userName,
    loadedTiles,
    FontWeight,
    ClipOp,
    PaintStyle,
  } = params;

  const panelTop = height - panelHeight;

  // Font dasar panel — 2× dari watermark lama (permintaan user 2026-09-28).
  const fontSize = watermarkFontSize(width);
  const typeface = Skia.FontMgr.System().matchFamilyStyle("sans-serif", {
    weight: FontWeight.Normal,
  });
  const font = Skia.Font(typeface ?? undefined, fontSize);
  const smallSize = Math.max(11, Math.round(fontSize * 0.62));
  const smallFont = Skia.Font(typeface ?? undefined, smallSize);

  const textPaint = Skia.Paint();
  textPaint.setColor(Skia.Color("#FFFFFF"));
  textPaint.setAntiAlias(true);

  const subPaint = Skia.Paint();
  subPaint.setColor(Skia.Color("rgba(255,255,255,0.88)"));
  subPaint.setAntiAlias(true);

  const padding = Math.max(10, Math.round(fontSize * 0.5));
  const smallLineH = Math.round(smallSize * WATERMARK_LINE_HEIGHT_RATIO);
  const bigLineH = Math.round(fontSize * WATERMARK_LINE_HEIGHT_RATIO);

  // Latar panel gelap semi-transparan: teks putih harus tetap terbaca di atas
  // foto apa pun (langit terang, laut, dsb).
  const panelPaint = Skia.Paint();
  panelPaint.setColor(Skia.Color("rgba(0,0,0,0.62)"));
  panelPaint.setAntiAlias(true);
  canvas.drawRect(
    Skia.XYWHRect(0, panelTop, width, panelHeight),
    panelPaint,
  );

  /* ---------------- Thumbnail peta ---------------- */

  let hasOsmTiles = false;

  // Peta dipusatkan VERTIKAL di dalam panel (bukan setinggi panel): inilah
  // yang membuatnya tampak seperti thumbnail peta, bukan strip tegak.
  const mapTop = panelTop + Math.round((panelHeight - mapHeight) / 2);

  if (gps) {
    // Klip ke kotak peta. PENTING: `clipRect` WAJIB tiga argumen
    // (rect, op, doAntiAlias) — pemanggilan satu-argumen sebelumnya adalah
    // pelanggaran kontrak API yang membuat klip tidak berperilaku benar dan
    // tile meluber keluar kotak peta (bug terlihat di device 2026-09-29).
    canvas.save();
    canvas.clipRect(
      Skia.XYWHRect(0, mapTop, mapWidth, mapHeight),
      ClipOp.Intersect,
      true,
    );

    // Latar peta gelap SELALU digambar dulu: bila sebagian tile gagal
    // diunduh (offline parsial), yang tampak adalah latar peta, bukan
    // "lubang" transparan yang memperlihatkan foto di baliknya.
    const mapBg = Skia.Paint();
    mapBg.setColor(Skia.Color("#2F3B33"));
    canvas.drawRect(Skia.XYWHRect(0, mapTop, mapWidth, mapHeight), mapBg);

    if (loadedTiles.length) {
      hasOsmTiles = true;
      const tilePaint = Skia.Paint();
      // src = ruang koordinat GAMBAR tile (0,0,256,256); dest = posisi di
      // kotak peta (drawX/drawY/size sudah termasuk skala, dihitung murni di
      // tileRangeFor dan teruji: jendela tertutup penuh, pin di tengah).
      for (const tile of loadedTiles) {
        canvas.drawImageRect(
          tile.image as never,
          Skia.XYWHRect(0, 0, TILE_SIZE, TILE_SIZE),
          Skia.XYWHRect(
            tile.drawX,
            mapTop + tile.drawY,
            tile.size,
            tile.size,
          ),
          tilePaint,
        );
      }
    } else {
      // Fallback offline: peta skematik lokal (grid) — selalu bisa digambar,
      // tidak butuh jaringan, dan tetap menunjukkan "ini titik koordinatnya".
      const grid = Skia.Paint();
      grid.setColor(Skia.Color("rgba(255,255,255,0.18)"));
      grid.setAntiAlias(true);
      const step = Math.max(14, Math.round(mapWidth / 6));
      for (let x = 0; x <= mapWidth; x += step) {
        canvas.drawRect(
          Skia.XYWHRect(x, mapTop, Math.max(1, Math.round(step * 0.03)), mapHeight),
          grid,
        );
      }
      for (let y = mapTop; y <= mapTop + mapHeight; y += step) {
        canvas.drawRect(
          Skia.XYWHRect(0, y, mapWidth, Math.max(1, Math.round(step * 0.03))),
          grid,
        );
      }
    }

    // Pin di TENGAH kotak peta — sesuai konstruksi tileRangeFor, koordinat
    // dipetakan tepat ke titik tengah jendela. Titik merah + cincin putih +
    // ekor kecil runcing ke bawah (bentuk pin peta) supaya TITIK KOORDINAT
    // langsung terbaca, bukan sekadar bulatan.
    const pinX = mapWidth / 2;
    const pinY = mapTop + mapHeight / 2;
    // Ukuran marker: permintaan user 2026-09-29 "diperkecil 1/3 dari yang
    // sekarang" → skala 0.075 × 2/3 = 0.05 (marker jadi 2/3 ukuran lama).
    // Semua elemen (ekor, cincin, titik) memakai `r` yang sama sehingga
    // proporsi pin tetap terjaga.
    const r = Math.max(6, Math.round(mapWidth * 0.05));

    // Ekor pin (segitiga) menunjuk tepat ke koordinat, digambar lebih dulu.
    const tail = Skia.Paint();
    tail.setColor(Skia.Color("#E53935"));
    tail.setAntiAlias(true);
    const tailPath = Skia.Path.Make();
    tailPath.moveTo(pinX, pinY + r * 2.0);
    tailPath.lineTo(pinX - r * 0.85, pinY + r * 0.2);
    tailPath.lineTo(pinX + r * 0.85, pinY + r * 0.2);
    tailPath.close();
    canvas.drawPath(tailPath, tail);

    const ring = Skia.Paint();
    ring.setColor(Skia.Color("#FFFFFF"));
    ring.setAntiAlias(true);
    canvas.drawCircle(pinX, pinY - r * 0.15, r * 1.5, ring);

    const dot = Skia.Paint();
    dot.setColor(Skia.Color("#E53935"));
    dot.setAntiAlias(true);
    canvas.drawCircle(pinX, pinY - r * 0.15, r * 1.1, dot);

    canvas.restore();

    // Bingkai tipis kotak peta: memisahkan peta dari foto di sekitarnya dan
    // menegaskan batas thumbnail.
    const frame = Skia.Paint();
    frame.setColor(Skia.Color("rgba(255,255,255,0.55)"));
    frame.setAntiAlias(true);
    frame.setStyle(PaintStyle.Stroke);
    frame.setStrokeWidth(2);
    canvas.drawRect(Skia.XYWHRect(1, mapTop + 1, mapWidth - 2, mapHeight - 2), frame);

    // Atribusi OSM — WAJIB bila konten OSM benar-benar tampil (syarat
    // lisensi tile); sengaja TIDAK ditampilkan pada grid skematik lokal.
    if (hasOsmTiles) {
      const attrFont = Skia.Font(
        typeface ?? undefined,
        Math.max(9, Math.round(mapWidth * 0.045)),
      );
      const attrPaint = Skia.Paint();
      attrPaint.setColor(Skia.Color("rgba(255,255,255,0.85)"));
      attrPaint.setAntiAlias(true);
      canvas.drawText(
        WATERMARK_MAP_ATTRIBUTION,
        4,
        mapTop + mapHeight - 4,
        attrPaint,
        attrFont,
      );
    }
  }

  /* ---------------- Teks (anggaran baris berprioritas) ---------------- */

  // Tanpa peta, teks mulai dari kiri; dengan peta, dari kanan thumbnail.
  const textLeft = gps ? mapWidth + padding : padding;
  const maxTextWidth = Math.max(40, width - textLeft - padding);

  // Ruang vertikal yang tersedia untuk teks: dari atas panel sampai di atas
  // baris brand (pojok kanan bawah) — supaya keduanya tidak bertabrakan.
  const brandReserve = Math.round(fontSize * 0.9);
  const usableBottom = height - brandReserve;
  const textTop = panelTop + padding;
  const usableHeight = usableBottom - textTop;

  const coordText = formatWatermarkGps(gps?.latitude, gps?.longitude);
  const timeText = formatWatermarkDateTime(new Date());

  // INTI BUKTI — koordinat + waktu — selalu dimasukkan lebih dulu dalam
  // anggaran; baris lain (wilayah, alamat) hanya bila masih ada ruang.
  // Menjatuhkan WAKTU demi alamat akan membuang nilai bukti watermark.
  const coreLines: LineToDraw[] = [];
  if (coordText) {
    coreLines.push({
      text: coordText,
      font: smallFont,
      paint: subPaint,
      height: smallLineH,
      ascent: Math.round(smallSize * 0.85),
    });
  }
  coreLines.push({
    text: timeText,
    font: smallFont,
    paint: subPaint,
    height: smallLineH,
    ascent: Math.round(smallSize * 0.85),
  });
  const coreHeight = coreLines.reduce((sum, l) => sum + l.height, 0);

  const contextLines: LineToDraw[] = [];

  // Baris NAMA pengguna (permintaan user 2026-09-29) — paling atas, memakai
  // font kecil tetapi putih penuh supaya terbaca sebagai identitas pemilik
  // bukti. Dipenggal 1 baris dengan elipsis bila nama sangat panjang.
  if (userName) {
    contextLines.push({
      text: clampLines(
        wrapTextToWidth(userName, maxTextWidth, (s) =>
          smallFont.measureText(s).width,
        ),
        1,
      )[0],
      font: smallFont,
      paint: textPaint,
      height: smallLineH,
      ascent: Math.round(smallSize * 0.85),
    });
  }

  // Baris wilayah — hanya bila muat bersama inti.
  //
  // BUG yang diperbaiki 2026-09-29: nama wilayah panjang ("Daerah Khusus
  // Ibukota Jakarta, Indonesia") dipaksa 1 baris font besar lalu dipotong
  // menjadi "Daerah Khusus Ibukota Jakarta,…" — bagian penting ("Indonesia")
  // hilang. Sekarang: coba font BESAR 1 baris; bila tidak muat, turun ke font
  // KECIL maks 2 baris sehingga nama wilayah tampil UTUH, bukan terpotong.
  if (address.region) {
    const bigLine = clampLines(
      wrapTextToWidth(address.region, maxTextWidth, (s) =>
        font.measureText(s).width,
      ),
      1,
    )[0];

    const fitsBigOneLine =
      bigLine === address.region && bigLineH + coreHeight <= usableHeight;

    if (fitsBigOneLine) {
      contextLines.push({
        text: bigLine,
        font,
        paint: textPaint,
        height: bigLineH,
        ascent: Math.round(fontSize * 0.8),
      });
    } else {
      const smallWrapped = clampLines(
        wrapTextToWidth(address.region, maxTextWidth, (s) =>
          smallFont.measureText(s).width,
        ),
        2,
      );
      const need = smallWrapped.length * smallLineH;
      if (need + coreHeight <= usableHeight) {
        for (const line of smallWrapped) {
          contextLines.push({
            text: line,
            font: smallFont,
            paint: textPaint,
            height: smallLineH,
            ascent: Math.round(smallSize * 0.85),
          });
        }
      }
    }
  }

  // Baris detail alamat (kecil, maks 2) — mengisi sisa ruang yang benar-benar
  // tersisa setelah wilayah + inti; tidak pernah menggeser inti keluar panel.
  if (address.detail) {
    const usedHeight = contextLines.reduce((sum, l) => sum + l.height, 0);
    const allowance = Math.max(
      0,
      Math.floor((usableHeight - usedHeight - coreHeight) / smallLineH),
    );
    const wrapped = clampLines(
      wrapTextToWidth(address.detail, maxTextWidth, (s) =>
        smallFont.measureText(s).width,
      ),
      Math.min(2, allowance),
    );
    for (const line of wrapped) {
      contextLines.push({
        text: line,
        font: smallFont,
        paint: subPaint,
        height: smallLineH,
        ascent: Math.round(smallSize * 0.85),
      });
    }
  }

  // Gambar: wilayah → alamat → koordinat → waktu (urutan atas ke bawah).
  let yTop = textTop;
  for (const line of [...contextLines, ...coreLines]) {
    if (yTop + line.height > usableBottom) break; // jaga-jaga terakhir
    if (line.text) {
      canvas.drawText(line.text, textLeft, yTop + line.ascent, line.paint, line.font);
    }
    yTop += line.height;
  }

  /* ---------------- Branding pemilik bukti ---------------- */

  const brandFont = Skia.Font(
    typeface ?? undefined,
    Math.max(10, Math.round(fontSize * 0.55)),
  );
  const brandPaint = Skia.Paint();
  brandPaint.setColor(Skia.Color("rgba(255,255,255,0.95)"));
  brandPaint.setAntiAlias(true);
  const brandWidth = brandFont.measureText(WATERMARK_BRAND).width;
  canvas.drawText(
    WATERMARK_BRAND,
    Math.max(padding, width - padding - brandWidth),
    height - Math.round(padding * 0.45),
    brandPaint,
    brandFont,
  );
}

/** Satu baris teks panel beserta metrik vertikalnya sendiri. */
interface LineToDraw {
  text: string;
  font: any;
  paint: any;
  /** Tinggi baris (piksel). */
  height: number;
  /** Jarak dari atas baris ke baseline (untuk drawText). */
  ascent: number;
}

/**
 * Bakar watermark ke sudut KANAN BAWAH foto kamera.
 *
 * @param uri Uri file foto (umumnya hasil `compressImage`, di cache).
 * @returns Uri foto ber-watermark, ATAU uri asal bila apa pun gagal.
 *          Tidak pernah throw (kontrak fail-soft).
 */
export async function applyCameraWatermark(
  uri: string,
  userName?: string | null,
): Promise<string> {
  if (!uri) return uri;

  // Skia headless tidak tersedia di web; waterfall di web dilewati.
  if (Platform.OS === "web") return uri;

  // Skia tidak dapat mendekode HEIF/HEIC. Umumnya `compressImage` sudah
  // mengubahnya ke JPEG; bila belum, lebih baik tanpa cap daripada gagal.
  if (isUnsupportedFormat(uri)) {
    if (__DEV__) {
      console.debug("[Watermark] Dilewati (format HEIC/HEIF tak didukung Skia):", uri);
    }
    return uri;
  }

  try {
    // Import dinamis: modul native Skia tidak boleh dievaluasi saat Jest
    // menjalankan test yang tidak menyentuh jalur ini, dan kegagalan load
    // tetap tertangkap oleh kontrak fail-soft.
    const { Skia, ImageFormat, FontWeight, ClipOp, PaintStyle } = await import(
      "@shopify/react-native-skia"
    );

    const gps = await resolveGpsForWatermark();
    const hasGps = Boolean(gps);

    // Nama wilayah + alamat (butuh jaringan). Dijalankan PARALEL dengan
    // pembacaan berkas supaya tidak menambah waktu tunggu; kegagalan jaringan
    // mengembalikan region/detail null (panel lalu memakai koordinat saja).
    const addressPromise: Promise<{ region: string | null; detail: string | null }> =
      hasGps
        ? fetchAddress(gps!.latitude, gps!.longitude, formatAddressLines)
        : Promise.resolve({ region: null, detail: null });

    // 1. Baca berkas → SkData → SkImage (dekode).
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const data = Skia.Data.fromBase64(base64);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) {
      console.warn("[Watermark] Gagal mendekode gambar; memakai foto asli:", uri);
      return uri;
    }

    const width = image.width();
    const height = image.height();
    if (!width || !height) {
      console.warn("[Watermark] Dimensi gambar tidak valid; memakai foto asli:", uri);
      return uri;
    }

    // 2. Surface offscreen seukuran foto + gambar foto sebagai dasar.
    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) {
      console.warn("[Watermark] Gagal membuat surface Skia; memakai foto asli:", uri);
      return uri;
    }
    const canvas = surface.getCanvas();
    canvas.drawImage(image, 0, 0);

    // Alamat sudah selesai (berjalan paralel dengan decode di atas).
    const address = await addressPromise;

    // Nama pengguna — baris keterangan pertama pada panel (dikirim pemanggil).
    const resolvedName = normalizeWatermarkName(userName);

    // 3. Raster peta: unduh tile OSM di sekitar koordinat. Peta adalah NILAI
    //    TAMBAH — kegagalan apa pun hanya berakibat panel digambar skematik
    //    lokal (grid + pin), tidak pernah menggagalkan watermark/absensi.
    const fontSize = watermarkFontSize(width);
    const mapWidth = Math.round(width * WATERMARK_MAP_WIDTH_RATIO);
    // Panel: 220 px sesuai permintaan user, DENGAN PENGAMAN — dinaikkan bila
    // teks tidak muat (mis. foto 4:3 lanskap atau foto besar tanpa kompresi),
    // supaya isi bukti tidak pernah terpangkas. Lihat panelHeightFor().
    const panelHeight = hasGps
      ? panelHeightFor({ width })
      : Math.max(72, Math.round(fontSize * 2.4));
    // Peta memakai rasio aspek tetap (bukan setinggi panel) dan dipusatkan
    // vertikal — memperbaiki bug "peta jadi strip tegak".
    const mapHeight = hasGps
      ? mapThumbnailHeight(mapWidth, panelHeight)
      : 0;

    let loadedTiles: (LoadedTile & { image: unknown })[] = [];

    if (hasGps) {
      try {
        const layout = tileRangeFor({
          latitude: gps!.latitude,
          longitude: gps!.longitude,
          zoom: watermarkMapZoom(gps!.latitude),
          widthPx: mapWidth,
          heightPx: mapHeight,
        });
        const loaded = await loadMapTiles(layout.tiles);
        // Dekode sekarang (bukan saat menggambar) supaya tile rusak/terpotong
        // dieliminasi lebih awal; sisanya digambar apa adanya.
        for (const tile of loaded) {
          const decoded = Skia.Image.MakeImageFromEncoded(
            Skia.Data.fromBase64(tile.base64),
          );
          if (decoded) loadedTiles.push({ ...tile, image: decoded });
        }
      } catch (mapError) {
        if (__DEV__) console.debug("[Watermark] Peta gagal dimuat:", mapError);
        loadedTiles = [];
      }
    }

    // 4. Gambar panel (peta + pin + teks) di bagian BAWAH foto.
    drawPanel({
      Skia,
      canvas,
      width,
      height,
      panelHeight,
      mapWidth,
      mapHeight,
      gps: hasGps ? gps! : null,
      address,
      userName: resolvedName,
      loadedTiles,
      FontWeight,
      ClipOp,
      PaintStyle,
    });

    // 5. Snapshot → encode JPEG → tulis ke berkas BARU di cache.
    const snapshot = surface.makeImageSnapshot();
    const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, WATERMARK_JPEG_QUALITY);
    if (!bytes?.length) {
      console.warn("[Watermark] Encode JPEG gagal; memakai foto asli:", uri);
      return uri;
    }

    const dir = FileSystem.cacheDirectory;
    // Tanpa cacheDirectory kita tidak punya tempat menulis hasil yang aman.
    if (!dir) return uri;

    const base64Out = base64FromBytes(bytes);
    const outUri = `${dir}watermarked-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.jpg`;
    await FileSystem.writeAsStringAsync(outUri, base64Out, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (__DEV__) {
      console.debug("[Watermark] Diterapkan:", {
        width,
        height,
        tiles: loadedTiles.length,
        hasAddress: Boolean(address.region || address.detail),
        outUri,
      });
    }
    return outUri;
  } catch (error) {
    // Kontrak fail-soft (keputusan 4): jangan pernah menggagalkan absensi
    // hanya karena watermark. Foto asli tetap dipakai dan dikirim.
    console.warn("[Watermark] Gagal menerapkan watermark; memakai foto asli:", error);
    return uri;
  }
}

/**
 * Konversi byte → base64 tanpa bergantung pada penyedia Buffer global
 * (Hermes tidak menyediakan `Buffer` secara default; `buffer` memang ada di
 * dependencies tetapi tidak perlu dibebankan di jalur panas ini).
 */
function base64FromBytes(bytes: Uint8Array): string {
  const g = globalThis as any;
  if (typeof g.Buffer?.from === "function") {
    return g.Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return g.btoa(binary);
}
