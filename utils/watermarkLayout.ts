/**
 * Helper MURNI untuk panel watermark bergaya peta (tanpa native/Skia/IO)
 * agar seluruh matematika dan formatnya dapat di-jest.
 *
 * Kebutuhan user 2026-09-28: watermark diperbesar ±2× dari ukuran sebelumnya,
 * ditambah **nama wilayah**, **alamat**, dan **thumbnail peta dengan pin di
 * titik koordinat** (meniru tata letak aplikasi GPS Map Camera, tanpa meniru
 * mereknya).
 *
 * Isi modul ini sengaja tidak menyentuh jaringan maupun Skia:
 *  - `lonToTileX` / `latToTileY`      → proyeksi Web Mercator (standar slippy map)
 *  - `tileRangeFor`                    → daftar tile + offset yang perlu diunduh
 *  - `wrapTextToWidth`                 → pemenggalan alamat panjang jadi baris
 *  - `formatAddressLines`              → susun alamat Nominatim jadi 2 baris
 *  - `watermarkScaleFor`               → ukuran font/panel (2× dari sebelumnya)
 */

/* ------------------------------------------------------------------ *
 * Skala panel (permintaan: "2× dari ukuran sekarang")
 * ------------------------------------------------------------------ */

/**
 * Ukuran font watermark SEBELUM perubahan = `width / 52`, dijepit 16–44 px.
 * Permintaan user: 2× → `width / 26`, dijepit 32–88 px.
 *
 * Dijepit tetap penting: pada foto sangat kecil panel tidak boleh melampaui
 * lebar gambar, dan pada foto sangat besar teks tidak boleh mendominasi.
 */
export function watermarkFontSize(imageWidth: number): number {
  return Math.min(88, Math.max(32, Math.round(imageWidth / 26)));
}

/** Tinggi baris teks relatif ukuran font. */
export const WATERMARK_LINE_HEIGHT_RATIO = 1.35;

/**
 * Tinggi panel peta yang DIMINTA user (piksel absolut).
 *
 * Riwayat: 0.25 → 0.28 → 0.187 (rasio) → **220 px absolut**
 * (permintaan user 2026-09-29: "panel hitamnya dibuat jadi 220 px dong").
 *
 * KENAPA MASIH ADA PENGAMAN (`panelHeightFor`)
 * --------------------------------------------
 * 220 px adalah ukuran ABSOLUT, sedangkan tinggi foto bervariasi. Diukur pada
 * beberapa kasus nyata (font 2×, 5 baris teks termasuk nama user):
 *
 *   foto 896×1600  → panel 13,8%  , teks 188 px  → MUAT
 *   foto 960×1280  → panel 17,2%  , teks 207 px  → MUAT
 *   foto 1280×960  → panel 22,9%  , teks 274 px  → **TIDAK MUAT** (4:3 lanskap)
 *   gallery 3000px → panel  5,5%  , teks 493 px  → **TIDAK MUAT** (jadi garis tipis)
 *
 * Karena itu 220 px dipakai sebagai ACUAN, lalu dinaikkan bila teks tidak muat
 * supaya isi bukti (nama, wilayah, alamat, koordinat, waktu) tidak pernah
 * terpangkas. Foto user tetap persis 220 px.
 */
export const WATERMARK_PANEL_HEIGHT_PX = 220;

/** Jumlah baris teks panel: nama, wilayah, alamat (maks 2), koordinat, waktu. */
export const WATERMARK_PANEL_TEXT_LINES = 6;

/**
 * Tinggi panel final: `WATERMARK_PANEL_HEIGHT_PX`, dinaikkan seperlunya agar
 * semua baris teks + padding + ruang brand tetap muat.
 *
 * `lines` = jumlah baris teks maksimum yang harus ditampilkan.
 * Murni dan teruji (lihat __tests__/watermarkLayout.test.ts).
 */
export function panelHeightFor(params: {
  width: number;
  lines?: number;
}): number {
  const { width } = params;
  const lines = Math.max(1, params.lines ?? WATERMARK_PANEL_TEXT_LINES);

  const fontSize = watermarkFontSize(width);
  const smallSize = Math.max(11, Math.round(fontSize * 0.62));
  const padding = Math.max(10, Math.round(fontSize * 0.5));
  const brandReserve = Math.round(fontSize * 0.9);
  const lineH = Math.round(smallSize * WATERMARK_LINE_HEIGHT_RATIO);

  const minimum = lines * lineH + padding + brandReserve;
  return Math.max(WATERMARK_PANEL_HEIGHT_PX, minimum);
}

/** Lebar thumbnail peta, sebagai rasio LEBAR gambar. */
export const WATERMARK_MAP_WIDTH_RATIO = 0.28;

/**
 * Rasio aspek thumbnail peta (tinggi/lebar).
 *
 * BUG yang diperbaiki 2026-09-29: versi pertama menyetel tinggi peta ==
 * tinggi panel (448 px pada foto 895×1599) sementara lebarnya hanya 251 px —
 * peta jadi STRIP tegak yang aneh dan sulit dibaca, bukan thumbnail peta.
 * Sekarang peta memakai rasio 0.75 (4:3 lahan-landai) dan dipusatkan vertikal
 * di dalam panel, sehingga tampak seperti thumbnail peta yang wajar.
 */
export const WATERMARK_MAP_ASPECT = 0.75;

/**
 * Tinggi thumbnail peta dari tinggi panel: memakai rasio aspek tetap, tetapi
 * TIDAK melebihi tinggi panel dikurangi margin kecil.
 */
export function mapThumbnailHeight(
  mapWidth: number,
  panelHeight: number,
): number {
  const ideal = Math.round(mapWidth * WATERMARK_MAP_ASPECT);
  const maxAllowed = Math.max(40, panelHeight - 2 * Math.round(panelHeight * 0.06));
  return Math.min(ideal, maxAllowed);
}

/* ------------------------------------------------------------------ *
 * Proyeksi Web Mercator (slippy map tiles)
 * ------------------------------------------------------------------ */

/**
 * Bujur → koordinat tile X (boleh pecahan) pada zoom tertentu.
 * Rumus standar slippy map: `(lon + 180) / 360 * 2^zoom`.
 */
export function lonToTileX(longitude: number, zoom: number): number {
  return ((longitude + 180) / 360) * Math.pow(2, zoom);
}

/**
 * Lintang → koordinat tile Y (boleh pecahan) pada zoom tertentu.
 * Rumus Web Mercator: `(1 - ln(tan(lat) + sec(lat)) / π) / 2 * 2^zoom`.
 *
 * Lintang dijepit ke ±85.0511° — batas di mana proyeksi Mercator berhingga.
 * Tanpa jepitan ini, lintang ±90 menghasilkan Infinity/NaN → tile tak terdefinisi.
 */
export function latToTileY(latitude: number, zoom: number): number {
  const MAX_LAT = 85.05112878;
  const lat = Math.min(MAX_LAT, Math.max(-MAX_LAT, latitude));
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

/** Ukuran standar satu tile OSM (piksel). */
export const TILE_SIZE = 256;

export interface TileRef {
  x: number;
  y: number;
  z: number;
}

/**
 * Satu tile OSM beserta posisi gambarnya di kanvas thumbnail.
 *
 * `drawX`/`drawY`/`size` sudah termasuk faktor skala — pemanggil tinggal
 * menggambar tile pada `XYWHRect(drawX, drawY, size, size)` (di dalam area
 * panel). Dengan konstruksi, union semua rect ini MENUTUP penuh jendela
 * thumbnail: tidak ada celah (gap) di tepi.
 */
export interface TilePlacement extends TileRef {
  /** Posisi kiri tile pada thumbnail (px, termasuk skala). */
  drawX: number;
  /** Posisi atas tile pada thumbnail (px, termasuk skala). */
  drawY: number;
  /** Sisi tile setelah skala (px). */
  size: number;
}

export interface TileLayout {
  /** Tile yang perlu diunduh + posisi gambar masing-masing. */
  tiles: TilePlacement[];
  /**
   * Skala penggambaran tile: 1 = tajam 1:1; >1 = tile diperbesar. Skala naik
   * hanya bila jendela thumbnail > MAP_WINDOW_MAX_PX, supaya JUMLAH TILE
   * tetap terbatas (maks 3×3) berapa pun ukuran foto — penting untuk jalur
   * `gallery-folder` yang TIDAK mengompresi foto (bisa ribuan piksel).
   */
  scale: number;
  /** Dimensi jendela dalam piksel-peta (sebelum skala). */
  windowMapWidth: number;
  windowMapHeight: number;
}

/**
 * Batas jendela peta per sisi (piksel-peta). 512 + toleransi posisi
 * menjamin paling banyak 3 tile per sumbu → maks 9 tile per panel
 * (== MAX_TILES di watermarkMap.ts; anggaran kuota/waktu pekerja lapangan).
 */
export const MAP_WINDOW_MAX_PX = 512;

/**
 * Hitung tile yang menutupi JENDELA `widthPx × heightPx` yang DIPUSATKAN
 * tepat pada koordinat, pada zoom tertentu.
 *
 * Algoritma "jendela absolut mercator": titik koordinat diproyeksikan ke
 * piksel absolut, jendela = [pin - w/2, pin + w/2], lalu semua tile yang
 * beririsan jendela diikutkan. Karena pin dipusatkan, pemanggil menggambar
 * pin di tengah thumbnail dan tile-tile digambar pada drawX/drawY — tidak
 * ada geseran manual yang bisa saling salah.
 *
 * Sengaja mengembalikan daftar penempatan, BUKAN gambar: pemanggil (yang
 * punya IO) yang mengunduh, sehingga modul ini tetap murni dan teruji.
 */
export function tileRangeFor(params: {
  latitude: number;
  longitude: number;
  zoom: number;
  widthPx: number;
  heightPx: number;
}): TileLayout {
  const { latitude, longitude, zoom, widthPx, heightPx } = params;
  const n = Math.pow(2, zoom);

  // Skala: pastikan kedua sisi jendela peta <= MAP_WINDOW_MAX_PX sehingga
  // jumlah tile terikat maksimum (3×3) berapa pun ukuran thumbnail.
  const scale = Math.max(
    1,
    Math.max(widthPx, heightPx) / MAP_WINDOW_MAX_PX,
  );
  const windowMapWidth = widthPx / scale;
  const windowMapHeight = heightPx / scale;

  // Pin dalam piksel absolut pada zoom ini.
  const pinPxX = lonToTileX(longitude, zoom) * TILE_SIZE;
  const pinPxY = latToTileY(latitude, zoom) * TILE_SIZE;

  // Jendela absolut, dipusatkan pada pin.
  const originX = pinPxX - windowMapWidth / 2;
  const originY = pinPxY - windowMapHeight / 2;

  // Semua tile yang beririsan jendela (menutup penuh, tanpa gap by design).
  const startX = Math.floor(originX / TILE_SIZE);
  const endX = Math.floor((originX + windowMapWidth) / TILE_SIZE);
  const startY = Math.floor(originY / TILE_SIZE);
  const endY = Math.floor((originY + windowMapHeight) / TILE_SIZE);

  const tiles: TilePlacement[] = [];
  for (let rawY = startY; rawY <= endY; rawY++) {
    // Di luar kutub proyeksi tidak ada tile; jendela valid tidak pernah
    // sampai sini karena latToTileY menjepit lintang.
    if (rawY < 0 || rawY >= n) continue;
    for (let rawX = startX; rawX <= endX; rawX++) {
      const drawX = (rawX * TILE_SIZE - originX) * scale;
      const drawY = (rawY * TILE_SIZE - originY) * scale;
      const size = TILE_SIZE * scale;

      // Buang tile yang TIDAK beririsan dengan jendela sama sekali: ia akan
      // langsung dipotong klip, jadi mengunduh & menggambarnya hanya
      // membuang kuota pekerja lapangan dan waktu render.
      const intersects =
        drawX < widthPx &&
        drawX + size > 0 &&
        drawY < heightPx &&
        drawY + size > 0;
      if (!intersects) continue;

      // Sumbu X melingkar (antimeridian): indeks URL dibungkus, tetapi
      // POSISI GAMBAR tetap memakai rawX agar penempatannya benar.
      const wrappedX = ((rawX % n) + n) % n;
      tiles.push({
        x: wrappedX,
        y: rawY,
        z: zoom,
        drawX,
        drawY,
        size,
      });
    }
  }

  return {
    tiles,
    scale,
    windowMapWidth,
    windowMapHeight,
  };
}

/**
 * Zoom untuk thumbnail: dipilih agar area yang tampak ± 300–600 m
 * ("zoom titik koordinat" — cukup untuk mengenali jalan/gedung sekitar).
 *
 * z16 ≈ 2,4 m/piksel di khatulistiwa; dengan thumbnail ~1/5 lebar foto
 * (≈250 px) area tampak ≈ 600 m. Turun ke z15 di lintang tinggi karena
 * Mercator memperbesar jarak per piksel menjauh dari khatulistiwa.
 */
export function watermarkMapZoom(latitude: number): number {
  return Math.abs(latitude) > 55 ? 15 : 16;
}

/* ------------------------------------------------------------------ *
 * Alamat (hasil reverse-geocode Nominatim)
 * ------------------------------------------------------------------ */

export interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  village?: string;
  suburb?: string;
  hamlet?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface NominatimLike {
  display_name?: string;
  name?: string;
  address?: NominatimAddress;
}

/**
 * Susun 2 baris alamat gaya gambar referensi:
 *   1. Wilayah  : "Kota Pekalongan, Jawa Tengah, Indonesia"
 *   2. Detail   : "Jl. Industri III, Karangmalang, Kec. Pekalongan Tim."
 *
 * Semua bagian OPSIONAL: Nominatim sering hanya mengembalikan sebagian field.
 * Fungsi ini tidak pernah mengarang nilai — bagian yang tidak ada dilewati,
 * dan bila tidak ada apa pun ia mengembalikan array kosong (pemanggil lalu
 * memakai koordinat saja).
 */
export function formatAddressLines(
  result?: NominatimLike | null,
): { region: string | null; detail: string | null } {
  const addr = result?.address;
  if (!addr) return { region: null, detail: null };

  // Baris wilayah: tingkat kota/kabupaten → provinsi → negara.
  const cityish =
    addr.city || addr.town || addr.municipality || addr.county || null;
  const regionParts = [cityish, addr.state, addr.country].filter(
    (p): p is string => Boolean(p && p.trim()),
  );

  // Baris detail: jalan + kelurahan/desa + kecamatan.
  const locality =
    addr.village || addr.suburb || addr.neighbourhood || addr.hamlet || null;
  const detailParts = [addr.road, locality].filter(
    (p): p is string => Boolean(p && p.trim()),
  );

  return {
    region: regionParts.length ? dedupeJoin(regionParts) : null,
    detail: detailParts.length ? dedupeJoin(detailParts) : null,
  };
}

/**
 * Gabung dengan ", " sambil membuang bagian yang duplikat/berulang.
 * Nominatim kadang mengembalikan nilai sama untuk beberapa field
 * (mis. city == county), yang akan tampak seperti salah ketik.
 */
function dedupeJoin(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part.trim());
  }
  return out.join(", ");
}

/**
 * CATATAN — Plus Code sengaja TIDAK diimplementasikan.
 *
 * Gambar referensi menampilkan "4M2P+QMV" (Plus Code bentuk pendek 4+3).
 * Bentuk seperti itu adalah kode LOKAL yang hanya sah bila pembaca tahu
 * wilayah acuannya, dan Nominatim tidak mengembalikannya. Kode Plus Code
 * global (10 digit) yang dihitung lokal akan tampak mirip tetapi BERBEDA dari
 * yang di gambar referensi, sehingga bisa disalahartikan sebagai lokasi lain.
 *
 * Menempelkan kode lokasi yang salah pada bukti kerja lebih berbahaya daripada
 * tidak menempelkannya. Sebagai gantinya panel menampilkan KOORDINAT penuh
 * (lat, lon 6 desimal) yang tidak ambigu dan bisa diverifikasi siapa pun.
 */

/* ------------------------------------------------------------------ *
 * Pembungkusan teks (untuk alamat panjang)
 * ------------------------------------------------------------------ */

/**
 * Pecah `text` menjadi baris yang lebarnya tidak melebihi `maxWidth`,
 * memakai `measure` (biasanya `font.measureText`) sebagai pengukur.
 *
 * `measure` disuntikkan agar fungsi ini tetap murni dan dapat diuji tanpa
 * Skia: tes cukup memakai pengukur monotonik sederhana.
 *
 * Kata yang SANGAT panjang (lebih panjang dari satu baris) tidak dipotong —
 * ia menempati barisnya sendiri. Memotong kata alamat akan menyesatkan
 * pembaca bukti, jadi membiarkannya meluber sedikit lebih baik.
 */
export function wrapTextToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (maxWidth <= 0) return [text];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Batasi jumlah baris hasil pembungkusan, tandai pemotongan dengan "…".
 * Alamat Nominatim bisa sangat panjang; panel watermark punya tinggi tetap,
 * jadi lebih baik menampilkan awal alamat secara jujur daripada memelarkan
 * panel menutupi foto.
 */
export function clampLines(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0) return [];
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[kept.length - 1];
  kept[kept.length - 1] = last.endsWith("…") ? last : `${last}…`;
  return kept;
}
