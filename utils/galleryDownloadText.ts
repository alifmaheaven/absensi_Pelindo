/**
 * Helper MURNI untuk fitur unduh galeri (tanpa native/IO) agar dapat di-jest.
 *
 * Kebutuhan user 2026-09-29: "pada galery tolong ditambah fitur download image
 * atau file tertentu yang sudah diupload di galery secara langsung".
 *
 * Modul ini menangani bagian yang paling mudah salah dan paling mahal
 * akibatnya — penamaan file di disk:
 *  - nama file dari server (`original_name`) bisa mengandung spasi, karakter
 *    aneh, atau tidak punya ekstensi;
 *  - file tanpa ekstensi yang jelas akan gagal dibuka aplikasi lain;
 *  - nama yang sama untuk dua file berbeda akan saling menimpa.
 */

/** Ekstensi yang dianggap GAMBAR (boleh disimpan ke galeri media). */
const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
  "gif",
  "bmp",
];

/** Ekstensi yang dianggap PDF. */
const PDF_EXTENSIONS = ["pdf"];

/**
 * Bentuk foto galeri dari API (`IGalleryPhoto`) memakai snake_case
 * (`mime_type`, `original_name`), sedangkan helper di modul unduhan memakai
 * camelCase. Fungsi ini menjembatani keduanya di SATU tempat supaya tidak ada
 * layar yang salah memetakan field (bug yang tertangkap tsc saat pemasangan).
 */
export interface GalleryPhotoLike {
  mime_type?: string | null;
  original_name?: string | null;
  url?: string | null;
  file_size?: number | null;
  id?: string | null;
}

/** Ubah foto galeri (snake_case) menjadi bentuk DownloadableFile. */
export function fromGalleryPhoto(photo: GalleryPhotoLike): DownloadableFile & {
  id?: string | null;
} {
  return {
    id: photo.id ?? null,
    originalName: photo.original_name ?? null,
    mimeType: photo.mime_type ?? null,
    url: photo.url ?? null,
  };
}

export interface DownloadableFile {
  /** Nama asli dari server, mis. "Laporan Bulanan.pdf". */
  originalName?: string | null;
  mimeType?: string | null;
  /** URL apa pun (dipakai hanya untuk menebak ekstensi bila nama kosong). */
  url?: string | null;
  /**
   * Dipakai untuk nama cadangan agar unik, mis. id baris.
   * Menerima `id` juga — BUG yang diperbaiki 2026-09-29: fungsi membaca
   * `fallbackId` sementara pemanggil mengirim `id`, sehingga semua file tanpa
   * nama menjadi "gallery-file" dan SALING MENIMPA di disk.
   */
  fallbackId?: string | null;
  id?: string | null;
}

/** Ambil ekstensi (huruf kecil, tanpa titik) dari sebuah nama/url. */
export function extractExtension(value?: string | null): string | null {
  if (!value) return null;
  // Buang query/hash lebih dulu supaya "file.pdf?token=abc" tetap terbaca pdf.
  const clean = String(value).split(/[?#]/)[0];
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(clean);
  return match ? match[1].toLowerCase() : null;
}

/** Tebak ekstensi dari MIME type bila nama file tidak memberi petunjuk. */
export function extensionFromMime(mime?: string | null): string | null {
  if (!mime) return null;
  const m = String(mime).toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/heic") return "heic";
  if (m === "image/heif") return "heif";
  if (m === "image/gif") return "gif";
  if (m === "image/bmp") return "bmp";
  const slash = m.indexOf("/");
  if (slash >= 0) {
    const sub = m.slice(slash + 1);
    if (/^[a-z0-9]{1,8}$/.test(sub)) return sub === "jpeg" ? "jpg" : sub;
  }
  return null;
}

/**
 * Tentukan ekstensi final untuk file yang diunduh.
 *
 * Prioritas: ekstensi dari nama → dari MIME → "bin" (jaring pengaman supaya
 * file tidak tersimpan tanpa ekstensi sama sekali).
 *
 * PENTING (temuan review): ekstensi dari URL TIDAK dipakai sebagai sumber
 * utama karena URL galeri adalah presigned URL S3 — path-nya sering berisi
 * key acak tanpa ekstensi yang bermakna. URL hanya dipakai bila nama & MIME
 * sama-sama tidak memberi petunjuk.
 */
export function resolveExtension(file: DownloadableFile): string {
  const fromName = extractExtension(file.originalName);
  if (fromName) return fromName;
  const fromMime = extensionFromMime(file.mimeType);
  if (fromMime) return fromMime;
  const fromUrl = extractExtension(file.url);
  if (fromUrl) return fromUrl;
  return "bin";
}

/**
 * Bersihkan nama file agar aman dipakai di filesystem semua platform:
 * buang pemisah path, karakter kontrol, dan karakter yang bermasalah di
 * Windows/Android (mis. `:` `*` `?` `"` `<` `>` `|`), rapikan spasi ganda.
 *
 * Nama yang tersisa kosong → null (pemanggil memakai nama cadangan).
 */
export function sanitizeFileName(name?: string | null): string | null {
  if (!name) return null;
  let out = String(name)
    // Ambil komponen terakhir bila server mengirim path.
    .split(/[/\\]/)
    .pop()!
    // Buang karakter kontrol + karakter terlarang.
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[:*?"<>|]/g, "-")
    // "a>b" menghasilkan "--" — rapikan agar nama tetap enak dibaca.
    .replace(/-{2,}/g, "-")
    // Rapikan spasi (termasuk spasi non-breaking) dan spasi di tepi.
    .replace(/[\s\u00A0]+/g, " ")
    .trim();

  // "." dan ".." berbahaya sebagai nama berkas.
  if (!out || out === "." || out === "..") return null;
  return out;
}

/**
 * Susun nama file final untuk diunduh: nama asli (dibersihkan) + ekstensi
 * yang dijamin ada. Bila server tidak mengirim nama, pakai
 * `gallery-<fallbackId>`.
 */
export function buildDownloadFileName(file: DownloadableFile): string {
  const ext = resolveExtension(file);
  const safe = sanitizeFileName(file.originalName);

  // Sudah punya ekstensi yang sama dengan resolusi → pakai apa adanya.
  if (safe) {
    const safeExt = extractExtension(safe);
    if (safeExt) return safe;
    return `${safe}.${ext}`;
  }

  // Terima `id` maupun `fallbackId` — lihat catatan di DownloadableFile.
  const id = sanitizeFileName(file.fallbackId ?? file.id) ?? "file";
  return `gallery-${id}.${ext}`;
}

/** Bentuk input yang diterima pemeriksa tipe file: camelCase ATAU galeri. */
type FileLike =
  | { mimeType?: string | null; originalName?: string | null }
  | GalleryPhotoLike;

/** Ambil mime + nama dari kedua bentuk (camelCase / galeri) dengan aman. */
function readMimeAndName(file: FileLike): { mime: string; name: string | null } {
  const anyFile = file as {
    mimeType?: string | null;
    originalName?: string | null;
    mime_type?: string | null;
    original_name?: string | null;
  };
  return {
    mime: (anyFile.mimeType ?? anyFile.mime_type ?? "").toLowerCase(),
    name: anyFile.originalName ?? anyFile.original_name ?? null,
  };
}

/** Apakah file ini gambar (boleh masuk galeri media perangkat)? */
export function isImageFile(file: FileLike): boolean {
  const { mime, name } = readMimeAndName(file);
  if (mime.startsWith("image/")) return true;
  const ext = extractExtension(name);
  return Boolean(ext && IMAGE_EXTENSIONS.includes(ext));
}

/** Apakah file ini PDF? */
export function isPdfFile(file: FileLike): boolean {
  const { mime, name } = readMimeAndName(file);
  if (mime === "application/pdf") return true;
  const ext = extractExtension(name);
  return Boolean(ext && PDF_EXTENSIONS.includes(ext));
}

/** Ukuran file dalam teks yang enak dibaca (mis. "1,2 MB"). */
export function formatFileSize(bytes?: number | null): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${(mb / 1024).toFixed(1).replace(".", ",")} GB`;
}
