/**
 * Sumber data panel watermark: tile peta OSM + nama alamat (reverse geocode).
 *
 * PENTING — desain OFFLINE-FIRST
 * ------------------------------
 * Aplikasi ini adalah aplikasi lapangan yang secara sadar mendukung absensi
 * offline (lihat lib/offlineQueue.ts). Artinya panel peta TIDAK BOLEH menjadi
 * syarat keberhasilan watermark: di pelabuhan/area tanpa sinyal, absensi tetap
 * harus jalan. Karena itu SEMUA fungsi di sini mengembalikan `null`/array
 * kosong saat gagal, dan TIDAK PERNAH throw — panel lalu jatuh ke tampilan
 * peta skematik lokal (digambar Skia) + koordinat saja.
 *
 * KEBIJAKAN LAYANAN PUBLIK (jujur, harus diketahui)
 * ------------------------------------------------
 * - Tile OSM (`tile.openstreetmap.org`) adalah layanan publik dengan
 *   [usage policy](https://operations.osmfoundation.org/policies/tiles/):
 *   dilarang membanjiri, wajib User-Agent yang jelas, wajib atribusi.
 * - Nominatim juga publik: maksimal ±1 permintaan/detik.
 * Karena itu modul ini (a) TIDAK PERNAH memblokir alur foto lebih dari batas
 * waktu kecil, (b) menyimpan hasil alamat di cache lokal per-koordinat
 * (4 desimal ≈ 11 m) agar foto berulang di titik yang sama tidak memanggil
 * ulang, dan (c) gagal dengan tenang bila dibatasi.
 *
 * Atribusi "© OpenStreetMap contributors" WAJIB tampil di panel bila tile
 * OSM dipakai — itu syarat lisensi, bukan pilihan gaya.
 */

import * as FileSystem from "expo-file-system/legacy";
import {
  type NominatimLike,
  type TilePlacement,
} from "./watermarkLayout";

/** Batas waktu satu permintaan jaringan (ms). Kecil: ini di jalur foto. */
const FETCH_TIMEOUT_MS = 6000;

/**
 * Maksimal tile yang diunduh untuk satu panel (jaga kuota & waktu).
 * Semua tile diunduh PARALEL dengan batas waktu per-fetch di atas —
 * itulah anggaran riilnya (bukan deadline global: unduhan paralel
 * dimulai bersamaan sehingga deadline per-unduhan tidak pernah terpicu).
 */
const MAX_TILES = 9;

const TILE_CACHE_DIR = "watermark-tiles";

/** Cache alamat di memori (per sesi aplikasi), key = koordinat 4 desimal. */
const addressCache = new Map<string, AddressResult | null>();

/** Kunci cache alamat: 4 desimal ≈ 11 m — cukup untuk "titik yang sama". */
export function addressCacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

export interface AddressResult {
  region: string | null;
  detail: string | null;
}

/** Unduh teks dengan batas waktu; `null` bila gagal/timeout. */
async function fetchText(url: string, headers: Record<string, string>): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ambil nama wilayah + detail alamat dari Nominatim (reverse geocode).
 *
 * Mengembalikan `{region:null, detail:null}` bila gagal — pemanggil lalu
 * menampilkan koordinat saja. Hasil sukses/gagal di-cache per koordinat
 * supaya tidak memanggil layanan publik berulang kali di titik yang sama.
 *
 * `formatter` disuntikkan dari watermarkLayout untuk menjaga modul ini bebas
 * dari logika format sekaligus tetap mudah diuji.
 */
export async function fetchAddress(
  latitude: number,
  longitude: number,
  formatter: (
    raw: NominatimLike | null | undefined,
  ) => { region: string | null; detail: string | null },
): Promise<AddressResult> {
  const key = addressCacheKey(latitude, longitude);
  if (addressCache.has(key)) {
    return addressCache.get(key) ?? { region: null, detail: null };
  }

  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

  const body = await fetchText(url, {
    // User-Agent jelas = syarat usage policy Nominatim.
    "User-Agent": "AbsensiEos-Mobile/1.0 (PT Prakhya Tama Cakrawala)",
    "Accept-Language": "id",
    Accept: "application/json",
  });

  if (!body) {
    // Kegagalan TIDAK di-cache: beda dengan "alamat memang tidak ada",
    // kegagalan jaringan bisa pulih pada foto berikutnya.
    return { region: null, detail: null };
  }

  try {
    const parsed = JSON.parse(body) as NominatimLike;
    const result = formatter(parsed);
    addressCache.set(key, result);
    return result;
  } catch {
    return { region: null, detail: null };
  }
}

/**
 * Tile yang berhasil dimuat: identitas + posisi gambar (diteruskan dari
 * TilePlacement) + isi sebagai base64 (siap `Skia.Data.fromBase64`).
 */
export type LoadedTile = TilePlacement & { base64: string };

/**
 * Unduh sekumpulan tile OSM dan kembalikan isinya sebagai base64.
 *
 * Tile disimpan juga ke cacheDirectory sehingga pemakaian berikutnya di titik
 * yang sama tidak mengunduh ulang (hemat kuota pekerja lapangan).
 *
 * Mengembalikan array KOSONG bila tidak ada yang berhasil — TIDAK throw.
 * Tile yang gagal di satu sudut tidak membatalkan seluruh panel.
 */
export async function loadMapTiles(
  tiles: TilePlacement[],
): Promise<LoadedTile[]> {
  if (!tiles.length) return [];
  const limited = tiles.slice(0, MAX_TILES);

  const dir = FileSystem.cacheDirectory
    ? `${FileSystem.cacheDirectory}${TILE_CACHE_DIR}/`
    : null;
  if (dir) {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    } catch {
      // tanpa direktori cache kita tetap bisa mengunduh ke temp
    }
  }

  const results = await Promise.all(
    limited.map(async (tile): Promise<LoadedTile | null> => {
      const fileName = `z${tile.z}-x${tile.x}-y${tile.y}.png`;
      const localUri = dir ? `${dir}${fileName}` : null;

      // 1. Pakai cache disk bila ada.
      if (localUri) {
        try {
          const info = await FileSystem.getInfoAsync(localUri);
          if (info.exists && (info as { size?: number }).size) {
            const base64 = await FileSystem.readAsStringAsync(localUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            if (base64) return { ...tile, base64 };
          }
        } catch {
          // lanjut unduh
        }
      }

      // 2. Unduh dari server tile OSM.
      const url = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          // Usage policy OSM mewajibkan User-Agent yang mengidentifikasi app.
          headers: {
            "User-Agent": "AbsensiEos-Mobile/1.0 (PT Prakhya Tama Cakrawala)",
          },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        if (!buf.byteLength) return null;
        const base64 = arrayBufferToBase64(buf);
        if (!base64) return null;

        // Simpan ke cache disk (best-effort).
        if (localUri) {
          try {
            await FileSystem.writeAsStringAsync(localUri, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch {
            // gagal cache bukan kegagalan fitur
          }
        }
        return { ...tile, base64 };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return results.filter((t): t is LoadedTile => t !== null);
}

/**
 * ArrayBuffer → base64. Skia butuh base64; Hermes tidak punya Buffer secara
 * default, jadi pakai jalur btoa dengan chunk (batas argumen String.fromCharCode).
 */
function arrayBufferToBase64(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf);
  const g = globalThis as any;
  if (typeof g.Buffer?.from === "function") {
    return g.Buffer.from(bytes).toString("base64");
  }
  if (typeof g.btoa !== "function") return null;
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


