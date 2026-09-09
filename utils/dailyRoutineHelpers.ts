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
 * Validasi berkas bukti di sisi klien sebelum pengunggahan (NFR-07).
 * Batas ukuran: maksimal 5MB.
 * Format yang didukung: JPG, PNG, WEBP, PDF.
 */
export function validateEvidenceFile(file?: {
  size?: number | null;
  name?: string | null;
  mimeType?: string | null;
  uri?: string | null;
} | null): FileValidationResult {
  if (!file) {
    return { valid: false, error: "Berkas tidak valid." };
  }

  // 1. Validasi ukuran (maksimal 5MB)
  if (typeof file.size === "number" && file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: "Ukuran berkas melebihi batas 5MB. Silakan pilih berkas yang lebih kecil.",
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

  const isExtAllowed = ext ? ALLOWED_FILE_EXTENSIONS.includes(ext) : false;
  const isMimeAllowed = mime
    ? ALLOWED_MIME_TYPES.some((m) => mime.startsWith(m))
    : false;

  if (!isExtAllowed && !isMimeAllowed) {
    return {
      valid: false,
      error: "Format berkas tidak didukung. Gunakan format JPG, PNG, WEBP, atau PDF.",
    };
  }

  return { valid: true };
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
