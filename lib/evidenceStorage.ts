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
 * D-03 (tiket 10) — DUA DIREKTORI, BUKAN SATU
 * -------------------------------------------
 * Sebelum ini SEMUA foto (form tiket/cuti/izin, draft daily-routine, dan bukti
 * absensi) mendarat di satu direktori `attendance-evidence/`. Itu salah
 * secara struktural, bukan sekadar kurang lengkap: `cleanupOrphanedEvidence`
 * menyapu SELURUH isi direktori itu terhadap keep-set yang hanya bisa ia susun
 * dari storage (antrean + keranjang gagal). Foto yang masih berada di FORM
 * YANG BELUM DI-SUBMIT tidak ada di storage mana pun — ia hidup di state React
 * — jadi secara definisi tidak mungkin masuk keep-set, dan sweep pasti
 * menghapusnya. Menambal keep-set dengan "registry in-use" hanya memindahkan
 * masalah: registry adalah sumber kebenaran KEDUA yang harus dijaga sinkron,
 * dan crash antara "file ditulis" dan "registry ditulis" tetap kehilangan file.
 *
 * Keputusan (D-03): PISAHKAN DIREKTORI.
 *   - `attendance-evidence/` — foto yang sudah DILEKATKAN ke record absensi /
 *     antrean offline. Keep-set-nya LENGKAP (dibaca dari storage), jadi sweep
 *     aman dan tetap berjalan seperti semula.
 *   - `form-evidence/<fitur>/` — foto yang masih dipegang sebuah form yang
 *     belum di-submit. Direktori ini TIDAK PERNAH dienumerasi sweep, sehingga
 *     sweep menjadi benar SECARA KONSTRUKSI: file yang tidak bisa ia nilai
 *     tidak bisa ia hapus. Ini menghapus coupling implisit antara "sweep
 *     penyimpanan" dan "state layar".
 *
 * Biaya yang diterima eksplisit: foto form yang DITINGGALKAN pengguna (form
 * ditutup tanpa submit) tidak direbut oleh siapa pun, jadi byte-nya bertahan.
 * Itu pertukaran yang disengaja — byte yang menganggur jauh lebih murah
 * daripada bukti kerja yang hilang, dan ia LOUD (penyimpanan penuh membuat
 * `persistFormEvidenceImage` melempar → pengguna diberi tahu), bukan senyap.
 * Reklamasi berbasis siklus-hidup-form dicatat sebagai utang, bukan diklaim
 * selesai di sini.
 *
 * Catatan: memakai `expo-file-system/legacy` (API `copyAsync`/
 * `documentDirectory`) karena modul lain di codebase ini (image picker,
 * manipulator) juga memakai skema uri legacy.
 */
import * as FileSystem from "expo-file-system/legacy";

export const EVIDENCE_DIR_NAME = "attendance-evidence";
/** D-03: direktori terpisah untuk foto yang masih dipegang form (lihat header). */
export const FORM_EVIDENCE_DIR_NAME = "form-evidence";

/** Path direktori bukti absensi (yang disapu sweep), atau null. */
export function getEvidenceDir(): string | null {
  const doc = FileSystem.documentDirectory;
  return doc ? `${doc}${EVIDENCE_DIR_NAME}/` : null;
}

/**
 * D-03: path direktori foto FORM untuk satu fitur, atau null.
 * `feature` disanitasi ketat — hanya [a-z0-9_-] — supaya nama fitur dari
 * pemanggil tidak pernah bisa keluar dari documentDirectory lewat '..' atau '/'.
 */
export function getFormEvidenceDir(feature: string): string | null {
  const doc = FileSystem.documentDirectory;
  if (!doc) return null;
  const safe = String(feature || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!safe) return null;
  return `${doc}${FORM_EVIDENCE_DIR_NAME}/${safe}/`;
}

/**
 * True bila uri sudah berada di penyimpanan bukti persisten — direktori bukti
 * absensi ATAU direktori foto form (D-03). Dipakai untuk idempotensi promosi,
 * dan sebagai penjaga agar `removePersistedEvidence` tidak pernah menyentuh
 * file di luar kedua direktori itu.
 */
export function isPersistedEvidence(uri?: string | null): boolean {
  if (!uri) return false;
  const dir = getEvidenceDir();
  if (dir && uri.startsWith(dir)) return true;
  const formRoot = getFormEvidenceRoot();
  return Boolean(formRoot && uri.startsWith(formRoot));
}

/** Akar kedua direktori bukti (`.../form-evidence/`), atau null. */
function getFormEvidenceRoot(): string | null {
  const doc = FileSystem.documentDirectory;
  return doc ? `${doc}${FORM_EVIDENCE_DIR_NAME}/` : null;
}

const ensuredDirs = new Set<string>();

async function ensureDir(dir: string | null): Promise<string> {
  if (!dir) {
    throw new Error("Penyimpanan dokumen perangkat tidak tersedia.");
  }
  if (!ensuredDirs.has(dir)) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    ensuredDirs.add(dir);
  }
  return dir;
}

async function ensureEvidenceDir(): Promise<string> {
  return ensureDir(getEvidenceDir());
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

/**
 * D-03 (tiket 10) — promosikan foto yang masih dipegang FORM (belum di-submit)
 * ke `documentDirectory/form-evidence/<feature>/`, yang TIDAK PERNAH disapu
 * `cleanupOrphanedEvidence`.
 *
 * Dipakai jalur yang fotonya belum tentu akan menjadi record absensi:
 *   - form tiket / cuti / izin lewat `useImagePicker` (foto dipilih berjam-jam
 *     sebelum submit, dan form bisa ditinggalkan sama sekali), dan
 *   - draft harian `daily-routine/[id].tsx`, yang dulu menyimpan uri
 *     `cacheDirectory` mentah ke AsyncStorage — OS bebas meng-evict cache itu,
 *     sehingga draft memulihkan `upload_failed:false` dengan `local_uri` MATI
 *     (F-MOBILEB-02).
 *
 * Kontrak sama dengan `persistEvidenceImage`: idempotent untuk uri yang sudah
 * persisten, dan THROW bila penyalinan gagal — pemanggil WAJIB terlihat gagal,
 * bukan menelan error lalu menyimpan uri yang akan mati.
 */
export async function persistFormEvidenceImage(
  sourceUri: string,
  feature: string,
): Promise<string> {
  if (!sourceUri) {
    throw new Error("URI gambar bukti kosong.");
  }
  const dir = getFormEvidenceDir(feature);
  if (!dir) {
    throw new Error("Nama fitur bukti form tidak valid atau penyimpanan tidak tersedia.");
  }
  if (sourceUri.startsWith(dir)) {
    return sourceUri;
  }
  await ensureDir(dir);
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
  // D-03: sweep ini HANYA boleh melihat direktori bukti absensi. Direktori foto
  // form sengaja tidak pernah dienumerasi, jadi sweep tidak mungkin menghapus
  // file yang keep-set-nya tidak bisa ia susun. Batas ini struktural, bukan
  // bergantung isi keep-set.
  const dir = getEvidenceDir();
  if (!dir) return;
  const keepSet = new Set(urisOfAttendanceDir(keep));
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

/**
 * Ekstrak uri yang berada DI DALAM direktori bukti absensi saja.
 *
 * Sengaja TIDAK memakai `isPersistedEvidence` (yang kini juga mencakup
 * direktori foto form): keep-set harus cocok dengan apa yang benar-benar bisa
 * ditemukan sweep di `dir`. Mencampur keduanya akan membuat keep-set berisi
 * uri yang tidak pernah ada di direktori itu — tidak berbahaya hari ini, tapi
 * ia menyembunyikan kalau suatu saat `dir` berubah.
 */
function urisOfAttendanceDir(list: (string | null | undefined)[]): string[] {
  const dir = getEvidenceDir();
  if (!dir) return [];
  return list.filter((u): u is string => Boolean(u && u.startsWith(dir)));
}
