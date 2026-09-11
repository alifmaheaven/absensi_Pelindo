import { IDailyRoutineItem } from "@/types";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (NFR-07)

export const ALLOWED_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"];

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export type EvidenceType = "none" | "photo" | "file" | "both";

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validasi berkas bukti di sisi klien sebelum pengunggahan (OD-4, NFR-07).
 * Batas ukuran: maksimal 5MB (5.242.880 byte).
 * Format per evidence_type:
 * - photo: HANYA gambar (JPG, PNG, WEBP). PDF ditolak.
 * - both: HANYA gambar (sama dengan photo — foto saja atau berkas berupa foto). PDF ditolak.
 * - file: gambar + application/pdf.
 * - none: tidak memerlukan bukti.
 * SVG selalu DITOLAK (vektor stored-XSS).
 */
export function validateEvidenceFile(
  file?: {
    size?: number | null;
    name?: string | null;
    mimeType?: string | null;
    uri?: string | null;
  } | null,
  evidenceType?: EvidenceType | string | null
): FileValidationResult {
  if (!file) {
    return { valid: false, error: "Berkas tidak valid." };
  }

  const fileName =
    file.name || (file.uri ? file.uri.split("/").pop()?.split("?")[0] : "") || "Berkas";

  // 1. Validasi ukuran (maksimal 5MB, NFR-07 / OD-4)
  // ponytail: [ADR-266] Bila file.size bernilai null/undefined (ukuran tak terbaca di runtime lokal), berkas diizinkan lolos di sisi klien dan diverifikasi secara otoritatif oleh server (backend/src/utils/fileValidation.ts HTTP 422).
  if (typeof file.size === "number" && file.size > MAX_FILE_SIZE_BYTES) {
    const formatted = formatFileSize(file.size);
    return {
      valid: false,
      error: `Ukuran berkas "${fileName}" melebihi batas 5MB (${formatted}). Silakan pilih berkas yang lebih kecil.`,
    };
  }

  // 2. Ekstrak ekstensi berkas
  let ext = "";
  if (file.name && file.name.includes(".")) {
    ext = file.name.split(".").pop()?.toLowerCase() || "";
  } else if (file.uri && file.uri.includes(".")) {
    ext = file.uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
  }

  const mime = file.mimeType?.toLowerCase() || "";

  // SVG selalu DITOLAK (OD-4)
  if (ext === "svg" || mime.includes("svg")) {
    return {
      valid: false,
      error: "Format berkas SVG tidak didukung.",
    };
  }

  const isPdf = ext === "pdf" || mime.includes("pdf");
  const isImageExt = ["jpg", "jpeg", "png", "webp"].includes(ext);
  const isImageMime = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ].some((m) => mime.startsWith(m));
  const isImage = isImageExt || isImageMime;

  const resolved = evidenceType ? resolveEvidenceType(evidenceType) : null;

  // OD-4: 'photo' dan 'both' HANYA gambar (PDF ditolak!)
  if (resolved === "photo" || resolved === "both") {
    if (isPdf || !isImage) {
      return {
        valid: false,
        error:
          "Item ini hanya menerima bukti foto (JPG, PNG, WEBP). Berkas dokumen PDF tidak diizinkan.",
      };
    }
    return { valid: true };
  }

  // OD-4: 'file' mengizinkan gambar + PDF
  if (resolved === "file") {
    if (!isPdf && !isImage) {
      return {
        valid: false,
        error:
          "Format berkas tidak didukung. Berkas yang diizinkan hanya PDF, JPG, PNG, atau WEBP.",
      };
    }
    return { valid: true };
  }

  if (resolved === "none") {
    return {
      valid: false,
      error: "Item ini tidak memerlukan bukti.",
    };
  }

  // Fallback jika evidenceType tidak dispesifikasi (backward compatibility test suite)
  if (!isPdf && !isImage) {
    return {
      valid: false,
      error: "Format berkas tidak didukung. Gunakan format JPG, PNG, WEBP, atau PDF.",
    };
  }

  return { valid: true };
}

/**
 * Normalisasi nama berkas dan MIME type setelah gambar berhasil dikonversi/transcode ke JPEG (OD-4).
 * Ekstensi disesuaikan menjadi .jpg dan mimeType menjadi image/jpeg, dengan tetap mempertahankan
 * stem nama berkas asli agar teknisi mengenali fotonya (mis. IMG_0042.HEIC -> IMG_0042.jpg).
 */
export function normalizeTranscodedImageMetadata(
  originalName?: string | null,
  fallbackPrefix: string = "image"
): { name: string; mimeType: string } {
  const defaultExt = "jpg";
  const defaultMime = "image/jpeg";

  if (!originalName || !originalName.trim()) {
    return {
      name: `${fallbackPrefix}.${defaultExt}`,
      mimeType: defaultMime,
    };
  }

  const trimmed = originalName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  const stem = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;

  return {
    name: `${stem}.${defaultExt}`,
    mimeType: defaultMime,
  };
}

/**
 * Deteksi apakah berkas merupakan format HEIC/HEIF berdasarkan ekstensi berkas atau MIME type.
 */
export function isHeicAsset(
  asset?: {
    name?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    uri?: string | null;
  } | null
): boolean {
  if (!asset) return false;
  const name = asset.fileName || asset.name || "";
  const uri = asset.uri || "";
  let ext = "";
  if (name.includes(".")) {
    ext = name.split(".").pop()?.toLowerCase() || "";
  } else if (uri.includes(".")) {
    ext = uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
  }
  const mime = (asset.mimeType || "").toLowerCase();
  return (
    ext === "heic" ||
    ext === "heif" ||
    mime.includes("heic") ||
    mime.includes("heif")
  );
}

/**
 * Pesan kesalahan informatif dalam Bahasa Indonesia saat foto HEIC gagal di-transcode.
 */
export function getHeicTranscodeErrorMessage(fileName?: string | null): string {
  const fileLabel = fileName ? ` "${fileName}"` : "";
  return `Gagal mengonversi foto HEIC${fileLabel}. Format HEIC tidak didukung langsung oleh server dan gagal diubah ke JPEG. Silakan gunakan format JPG atau PNG.`;
}

/**
 * Mendapatkan ukuran berkas lokal setelah transcode (jika didukung runtime).
 * Memeriksa header content-length jika tersedia, lalu fallback ke pembacaan blob size.
 * Bila gagal/tidak didukung runtime lokal, mengembalikan null.
 */
export async function getLocalFileSize(uri?: string | null): Promise<number | null> {
  if (!uri) return null;
  try {
    const res = await fetch(uri);
    const contentLength = res.headers?.get?.("content-length");
    if (contentLength) {
      const parsed = parseInt(contentLength, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    const blob = await res.blob();
    if (typeof blob?.size === "number" && blob.size > 0) {
      return blob.size;
    }
    return null;
  } catch {
    return null;
  }
}

export interface TranscodedAssetResult {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
  isTranscoded: boolean;
}

/**
 * Menyiapkan metadata berkas yang sebenarnya akan diunggah setelah proses transcode (OD-4).
 * Memastikan nama berkas (.jpg), mimeType (image/jpeg), dan ukuran terkompresi tervalidasi dengan benar.
 */
export async function resolveTranscodedAsset(
  rawAsset: {
    uri: string;
    fileName?: string | null;
    name?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
    size?: number | null;
  },
  compressedUri?: string | null,
  fallbackPrefix: string = "image"
): Promise<TranscodedAssetResult> {
  const originalName = rawAsset.fileName || rawAsset.name;
  const rawSize =
    typeof rawAsset.fileSize === "number"
      ? rawAsset.fileSize
      : typeof rawAsset.size === "number"
      ? rawAsset.size
      : null;

  if (compressedUri) {
    const normalized = normalizeTranscodedImageMetadata(originalName, fallbackPrefix);
    const transcodedSize = await getLocalFileSize(compressedUri);

    // Presedensi resolusi ukuran untuk berkas yang ditranscode (OD-4, NFR-07):
    // 1. Ukuran terukur berkas hasil transcode/kompresi (transcodedSize) bila tersedia.
    //    Ini adalah ukuran sebenarnya pasca-kompresi (menolak jika hasil kompresi tetap > 5MB,
    //    dan meloloskan jika hasil kompresi <= 5MB meskipun ukuran mentah sebelumnya > 5MB).
    // 2. Jika ukuran hasil kompresi tidak dapat diukur secara lokal, gunakan rawSize HANYA
    //    sebagai sinyal konservatif jika rawSize <= MAX_FILE_SIZE_BYTES (karena kompresi tidak
    //    akan memperbesar berkas). Jika rawSize > 5MB, rawSize TIDAK boleh memveto berkas
    //    yang sudah berhasil dikompresi.
    // 3. ponytail: [ADR-266 / OD-4] Bila kedua ukuran tidak dapat dipastikan (transcodedSize null
    //    dan rawSize > 5MB atau rawSize null), tetapkan finalSize = null (diizinkan lolos di klien).
    //    Server memegang batas otoritatif 5 MB (backend/src/utils/fileValidation.ts HTTP 422
    //    dan batas 5MB Multer). Keputusan mengizinkan lolos di klien diambil agar perangkat teknisi
    //    di lapangan (React Native / Hermes pada Android kelas bawah yang gagal membaca blob dari file:// URI)
    //    tidak tertolak secara palsu setelah foto berhasil diresize ke 1080p (~400KB). Trade-off:
    //    penolakan lambat di sisi server (slow rejection) pada kasus langka berkas tak terukur
    //    jauh lebih aman bagi kelangsungan operasional teknisi daripada penolakan permanen di klien.
    let finalSize: number | null = null;
    if (transcodedSize !== null) {
      finalSize = transcodedSize;
    } else if (rawSize !== null && rawSize <= MAX_FILE_SIZE_BYTES) {
      finalSize = rawSize;
    } else {
      finalSize = null;
    }

    return {
      uri: compressedUri,
      name: normalized.name,
      mimeType: normalized.mimeType,
      size: finalSize,
      isTranscoded: true,
    };
  }

  // Berkas TIDAK ditranscode (non-transcoded asset, mis. PDF dokumen atau kompresi dilewati):
  // 1. rawSize adalah kebenaran otoritatif di sisi klien dan wajib ditegakkan jika tersedia (>5MB ditolak).
  // 2. ponytail: [ADR-266 / OD-4] Jika rawSize null/tak terbaca pada berkas non-transcode, tetapkan size = null (diizinkan lolos ke server gatekeeper 5MB).
  const defaultExt = "jpg";
  const ext = originalName?.split(".").pop() || defaultExt;
  const fileName = originalName || `${fallbackPrefix}.${ext}`;

  return {
    uri: rawAsset.uri,
    name: fileName,
    mimeType: rawAsset.mimeType || "image/jpeg",
    size: rawSize,
    isTranscoded: false,
  };
}

/**
 * Format ukuran berkas dalam bentuk ramah pengguna (mis. "840 KB", "1.2 MB").
 */
export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format label badge frekuensi routine sesuai copywriting UX spec:
 * - Harian: "Harian"
 * - Mingguan Fleksibel: "Mingguan · Fleksibel"
 * - Mingguan 1 Hari: "Mingguan · Setiap [Hari]" (mis. "Mingguan · Setiap Senin")
 * - Mingguan Banyak Hari: "Mingguan · Sen, Rab, Jum"
 */
export function formatRoutineFrequency(
  frequency?: string | null,
  work_days?: number[] | null
): string {
  if (frequency === "weekly") {
    if (!work_days || !Array.isArray(work_days) || work_days.length === 0) {
      return "Mingguan · Fleksibel";
    }

    const dayNames = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];

    if (work_days.length === 1) {
      const day = dayNames[work_days[0]];
      return day ? `Mingguan · Setiap ${day}` : "Mingguan";
    }

    const shortNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const sorted = [...work_days].sort((a, b) => a - b);
    const dayList = sorted.map((d) => shortNames[d] ?? d).join(", ");
    return `Mingguan · ${dayList}`;
  }

  return "Harian";
}

export interface RoutineEvaluationInput {
  frequency?: "daily" | "weekly" | string | null;
  work_days?: number[] | null;
}

export interface RoutineEvaluationContext {
  /** 0 = Minggu, 1 = Senin, ..., 6 = Sabtu */
  currentDayOfWeek?: number;
  /** true jika log sudah berstatus 'completed' pada minggu kalender (ISO week) berjalan */
  hasCompletedLogInCurrentWeek?: boolean;
}

/**
 * Evaluasi apakah routine aktif pada hari tertentu (ADR-132-03).
 * - Daily: selalu muncul.
 * - Weekly Terjadwal: muncul jika currentDayOfWeek cocok dengan work_days.
 * - Weekly Fleksibel: muncul selama belum ada log completed pada minggu kalender berjalan.
 */
export function isRoutineActiveToday(
  routine?: RoutineEvaluationInput | null,
  context?: RoutineEvaluationContext
): boolean {
  if (!routine) return false;

  const frequency = routine.frequency || "daily";

  if (frequency === "daily") {
    return true;
  }

  if (frequency === "weekly") {
    // Mode fleksibel (work_days null atau kosong)
    if (!routine.work_days || routine.work_days.length === 0) {
      return !context?.hasCompletedLogInCurrentWeek;
    }

    // Mode terjadwal (work_days berisi array integer 0-6)
    let todayDow = context?.currentDayOfWeek;
    if (todayDow === undefined) {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        weekday: "short",
      }).format(now);
      const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      todayDow = map[parts] ?? now.getDay();
    }

    return routine.work_days.includes(todayDow);
  }

  return true;
}

/**
 * Resolusi tipe bukti checklist dengan fallback backward-compatibility (ADR-132-04).
 */
export function resolveEvidenceType(
  evidence_type?: string | null,
  is_photo_required?: boolean
): EvidenceType {
  if (
    evidence_type === "none" ||
    evidence_type === "photo" ||
    evidence_type === "file" ||
    evidence_type === "both"
  ) {
    return evidence_type;
  }
  if (is_photo_required) {
    return "photo";
  }
  return "none";
}

/**
 * Label tag persyaratan bukti sebelum dicentang sesuai UX spec Modul 3:
 * - photo: "Wajib Foto"
 * - file: "Wajib Berkas"
 * - both: "Foto / Berkas"
 * - none: null (tidak ada tag)
 */
export function getEvidenceRequirementLabel(
  evidence_type?: string | null,
  is_photo_required?: boolean
): string | null {
  const resolved = resolveEvidenceType(evidence_type, is_photo_required);
  switch (resolved) {
    case "photo":
      return "Wajib Foto";
    case "file":
      return "Wajib Berkas";
    case "both":
      return "Foto / Berkas";
    case "none":
    default:
      return null;
  }
}
