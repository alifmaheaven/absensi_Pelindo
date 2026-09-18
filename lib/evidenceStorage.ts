/**
 * WAVE-0 / P0-0.6 — Persistensi bukti foto absensi.
 *
 * MASALAH AWAL
 * ------------
 * Foto bukti check-in/check-out hanya menunjuk file hasil ImagePicker/
 * ImageManipulator di `cacheDirectory`. OS bebas mereclaim cache saat
 * tekanan storage (atau user menekan "Clear cache"), sehingga sinkronisasi
 * offline yang terjadi berjam-jam kemudian mengirim absensi TANPA bukti —
 * dan klien melaporkannya sebagai sukses (`uploadLocalImage` mengembalikan
 * null dan loop pemanggil mengabaikannya).
 *
 * KONTRAK MODUL INI
 * -----------------
 * 1. `persistEvidenceImage(uri)` — dipanggil SEBELUM uri masuk state
 *    layar / antrean offline. Mengembalikan uri di
 *    `documentDirectory/attendance-evidence/` yang tidak di-evict OS.
 *    Kegagalan di-THROW (panggilan wajib LOUD, bukan `catch {}`).
 * 2. `removePersistedEvidence(uris)` — hanya untuk (a) uri yang sudah
 *    TERKONFIRMASI server (upload per-file sukses / attendance tersinkron)
 *    atau (b) foto yang DIBUANG USER sendiri lewat removeImage() sebelum
 *    submit. Di luar itu file hanya dihapus oleh `cleanupOrphanedEvidence`
 *    bila tidak lagi dirujuk antrean aktif/keranjang gagal. Bersifat
 *    best-effort; file di luar direktori bukti tidak pernah dihapus.
 * 3. `evidenceFileExists(uri)` — dipakai jalur sync untuk memutuskan
 *    bukti yang benar-benar hilang vs upload yang bisa diulang.
 *
 * Catatan: memakai `expo-file-system/legacy` (API `copyAsync`/
 * `documentDirectory`) karena modul lain di codebase ini (image picker,
 * manipulator) juga memakai skema uri legacy.
 */
import * as FileSystem from "expo-file-system/legacy";

export const EVIDENCE_DIR_NAME = "attendance-evidence";

/** Path direktori bukti, atau null bila documentDirectory tidak tersedia. */
export function getEvidenceDir(): string | null {
  const doc = FileSystem.documentDirectory;
  return doc ? `${doc}${EVIDENCE_DIR_NAME}/` : null;
}

/** True bila uri sudah berada di direktori bukti persisten. */
export function isPersistedEvidence(uri?: string | null): boolean {
  const dir = getEvidenceDir();
  return Boolean(dir && uri && uri.startsWith(dir));
}

let dirEnsured = false;

async function ensureEvidenceDir(): Promise<string> {
  const dir = getEvidenceDir();
  if (!dir) {
    throw new Error("Penyimpanan dokumen perangkat tidak tersedia.");
  }
  if (!dirEnsured) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    dirEnsured = true;
  }
  return dir;
}

/**
 * Salin foto (uri apa pun, umumnya hasil kompresi di cache) ke penyimpanan
 * persisten dan kembalikan uri barunya. Idempotent untuk uri yang sudah
 * persisten. THROW bila penyalinan gagal — pemanggil WAJIB menampilkan
 * kegagalan ke user (P0-0.6: tidak ada bukti yang hilang senyap).
 */
export async function persistEvidenceImage(sourceUri: string): Promise<string> {
  if (!sourceUri) {
    throw new Error("URI gambar bukti kosong.");
  }
  if (isPersistedEvidence(sourceUri)) {
    return sourceUri;
  }
  const dir = await ensureEvidenceDir();
  const ext = (sourceUri.match(/\.(\w{3,4})(?:\?|#|$)/)?.[1] || "jpg").toLowerCase();
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = `${dir}${name}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

/** Cek keberadaan file bukti (false untuk uri kosong/terhapus/error). */
export async function evidenceFileExists(uri?: string | null): Promise<boolean> {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

/**
 * Hapus file bukti. Dipanggil oleh TEPAT dua konteks yang sah
 * (CHECK-2a — kontrak diamandemen 2026-09-18, bukan "hanya pasca-server"):
 *   1. KONFIRMASI SERVER — jalur sync/online memanggilnya hanya untuk uri yang
 *      upload/attendance-nya SUDAH dikonfirmasi server (bukan bulk buta); dan
 *   2. KEPUTUSAN USER — `removeImage()` di layar check-in/check-out saat user
 *      MEMBUANG fotonya sendiri sebelum submit: uri yang dibuang tidak akan
 *      pernah terkirim, menyimpannya selamanya justru membebani perangkat.
 * Di luar dua konteks itu fungsi ini tidak boleh dipakai — file yang masih
 * dirujuk antrean aktif dilindungi `cleanupOrphanedEvidence`. Best-effort:
 * error hapus ditelan (sisa dibersihkan sweep). Uri di luar direktori bukti
 * tidak pernah disentuh melalui API ini.
 */
export async function removePersistedEvidence(
  uris: (string | null | undefined)[],
): Promise<void> {
  for (const uri of uris) {
    if (!isPersistedEvidence(uri)) continue;
    try {
      await FileSystem.deleteAsync(uri as string, { idempotent: true });
    } catch {
      // biarkan — file yatim akan dibersihkan oleh cleanupOrphanedEvidence
    }
  }
}

/**
 * Sweep defensif: hapus file bukti yang tidak lagi dirujuk antrean
 * tersisa dari crash/kill sebelum upload selesai dipanggil pada app
 * launch. `keep` = semua uri yang masih dipakai item antrean aktif.
 *
 * M-1 (disposisi reviewer G.3 — 'pengaman harus tinggal di fungsi yang
 * menghapus'): keep-set KOSONG hampir selalu berarti pemanggil TIDAK bisa
 * membaca datanya (tekanan penyimpanan, korusi pasca-crash), bukan 'bukti
 * memang habis' — satu getItem/JSON.parse yang gagal tidak boleh menyapu
 * SELURUH direktori bukti. Eksekusi ditolak kecuali pemanggil menyatakan
 * eksplisit 'sengaja kosong' lewat `{ allowEmptyKeep: true }`.
 */
export async function cleanupOrphanedEvidence(
  keep: (string | null | undefined)[],
  options?: { allowEmptyKeep?: boolean },
): Promise<void> {
  const dir = getEvidenceDir();
  if (!dir) return;
  const keepSet = new Set(urisOf(keep));
  if (keepSet.size === 0 && !options?.allowEmptyKeep) {
    console.warn(
      "[evidenceStorage] cleanupOrphanedEvidence DITOLAK: keep kosong tanpa allowEmptyKeep — arah aman = SIMPAN.",
    );
    return;
  }
  try {
    const listing = await FileSystem.readDirectoryAsync(dir);
    for (const file of listing) {
      const uri = `${dir}${file}`;
      if (keepSet.has(uri)) continue;
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
    }
  } catch {
    // direktori belum ada — tidak ada yang bisa dibersihkan
  }
}

/** Ekstrak semua uri bukti persisten dari item antrean (dipakai sweep launch). */
function urisOf(list: (string | null | undefined)[]): string[] {
  return list.filter((u): u is string => isPersistedEvidence(u));
}
