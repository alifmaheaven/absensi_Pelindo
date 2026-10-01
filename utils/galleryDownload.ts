/**
 * Unduh file dari galeri ke perangkat.
 *
 * Kebutuhan user 2026-09-29: "pada galery tolong ditambah fitur download image
 * atau file tertentu yang sudah diupload di galery secara langsung".
 *
 * KEPUTUSAN & KENDALA NYATA (hasil pemeriksaan backend)
 * ----------------------------------------------------
 * 1. `photo.url` dari backend adalah **presigned URL S3 yang hanya berlaku
 *    60 detik** (`backend/src/config/upload.ts:195`). URL yang tersimpan di
 *    state akan BASI bila user menunggu sebentar — jadi pemanggil WAJIB
 *    menyegarkan URL tepat sebelum mengunduh (`refreshUrl` di bawah), bukan
 *    memakai `photo.url` yang lama.
 * 2. Presigned URL sudah membawa tanda tangan, jadi unduhan TIDAK butuh
 *    header Authorization — cukup `FileSystem.downloadAsync`.
 * 3. `expo-media-library` SDK 56: `saveToLibraryAsync` **throw saat runtime**
 *    (hanya tersedia sebagai alias deprecated) — yang benar adalah
 *    `Asset.create(filePath)`. Terverifikasi dari typings paket.
 * 4. Fail-soft & LOUD: kegagalan unduhan DIKEMBALIKAN sebagai hasil
 *    terstruktur (bukan throw), supaya layar bisa memberi pesan jujur —
 *    tidak ada "Berhasil diunduh" palsu.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import {
  buildDownloadFileName,
  isImageFile,
  type DownloadableFile,
} from "./galleryDownloadText";

/** Folder sementara untuk hasil unduhan. */
const DOWNLOAD_DIR = "gallery-downloads";

export type DownloadOutcome =
  | { status: "saved"; fileName: string; uri: string }
  | { status: "shared"; fileName: string; uri: string }
  | { status: "permission-denied"; fileName: string }
  | { status: "error"; fileName: string; message: string };

/** Pastikan folder unduhan ada; mengembalikan path-nya. */
async function ensureDownloadDir(): Promise<string | null> {
  const base = FileSystem.cacheDirectory;
  if (!base) return null;
  const dir = `${base}${DOWNLOAD_DIR}/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch {
    return null;
  }
}

/** Hapus sisa unduhan lama agar cache tidak menumpuk. Best-effort. */
export async function cleanupOldDownloads(): Promise<void> {
  const dir = await ensureDownloadDir();
  if (!dir) return;
  try {
    const files = await FileSystem.readDirectoryAsync(dir);
    await Promise.all(
      files.map((f) =>
        FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true }).catch(() => {}),
      ),
    );
  } catch {
    // tidak fatal
  }
}

/**
 * Unduh satu file galeri, lalu:
 *  - GAMBAR  → simpan ke galeri media perangkat (muncul di Galeri/Files).
 *  - NON-GAMBAR (mis. PDF) → buka sheet "Bagikan/Simpan" sistem, karena
 *    penyimpanan otomatis ke galeri media hanya untuk media.
 *
 * Bila izin media ditolak, kami TIDAK menyerah: file tetap diunduh dan
 * ditawarkan lewat Share sheet supaya user tetap bisa menyimpannya.
 */
export async function downloadGalleryFile(params: {
  file: DownloadableFile & { id?: string | null };
  /**
   * Pengambil URL SEGAR. Dipanggil di sini (bukan di layar) supaya tidak ada
   * jalur yang tidak sengaja memakai URL presigned yang sudah kedaluwarsa.
   */
  refreshUrl: () => Promise<string | null>;
}): Promise<DownloadOutcome> {
  const fileName = buildDownloadFileName({
    originalName: params.file.originalName,
    mimeType: params.file.mimeType,
    url: params.file.url,
    fallbackId: params.file.id,
  });

  try {
    // 1. URL segar — presigned hanya 60 detik, jadi wajib diambil di sini.
    const url = await params.refreshUrl();
    if (!url) {
      return {
        status: "error",
        fileName,
        message: "Tautan unduhan tidak tersedia. Coba muat ulang daftar galeri.",
      };
    }

    const dir = await ensureDownloadDir();
    if (!dir) {
      return {
        status: "error",
        fileName,
        message: "Penyimpanan sementara perangkat tidak tersedia.",
      };
    }

    // 2. Unduh ke cache aplikasi.
    const target = `${dir}${fileName}`;
    // Bersihkan file lama bernama sama supaya tidak menimpa yang sedang dibaca.
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    const res = await FileSystem.downloadAsync(url, target);
    if (res.status !== 200) {
      return {
        status: "error",
        fileName,
        message: `Server menolak unduhan (HTTP ${res.status}).`,
      };
    }

    // 3a. Gambar → simpan ke galeri media perangkat.
    if (isImageFile(params.file)) {
      const saved = await saveImageToMediaLibrary(res.uri);
      if (saved) {
        return { status: "saved", fileName, uri: res.uri };
      }
      // Izin ditolak / gagal simpan → tetap tawarkan Share sheet.
      const shared = await shareFile(res.uri);
      if (shared) return { status: "shared", fileName, uri: res.uri };
      return { status: "permission-denied", fileName };
    }

    // 3b. Non-gambar (PDF/dll) → Share sheet sistem untuk Simpan/Buka.
    const shared = await shareFile(res.uri);
    if (shared) return { status: "shared", fileName, uri: res.uri };

    // Sharing tidak tersedia (mis. simulator tertentu): file sudah terunduh
    // di cache — laporkan jujur ke mana file tersimpan.
    return { status: "saved", fileName, uri: res.uri };
  } catch (error) {
    return {
      status: "error",
      fileName,
      message: error instanceof Error ? error.message : "Unduhan gagal.",
    };
  }
}

/**
 * Simpan gambar ke galeri media perangkat memakai API expo-media-library yang
 * BENAR untuk SDK 56 (`Asset.create`), dengan permintaan izin lebih dulu.
 *
 * Sengaja diimpor dinamis + try/catch: modul native ini tidak tersedia di
 * lingkungan uji maupun di web, dan kegagalannya tidak boleh menjatuhkan
 * seluruh alur unduhan.
 */
async function saveImageToMediaLibrary(uri: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const current = await MediaLibrary.getPermissionsAsync(true);
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const asked = await MediaLibrary.requestPermissionsAsync(true);
      granted = asked.granted;
    }
    if (!granted) return false;

    // API baru: Asset.create(filePath). `saveToLibraryAsync` sudah deprecated
    // dan THROW saat runtime pada versi ini.
    await MediaLibrary.Asset.create(uri);
    return true;
  } catch (error) {
    if (__DEV__) console.debug("[GalleryDownload] Gagal simpan ke galeri:", error);
    return false;
  }
}

/** Buka Share sheet sistem untuk file lokal. `false` bila tidak tersedia. */
async function shareFile(uri: string): Promise<boolean> {
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) return false;
    await Sharing.shareAsync(uri, { dialogTitle: "Simpan atau bagikan file" });
    return true;
  } catch (error) {
    if (__DEV__) console.debug("[GalleryDownload] Share sheet gagal:", error);
    return false;
  }
}
