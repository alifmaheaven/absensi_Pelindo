import * as ImageManipulator from "expo-image-manipulator";
import { ImagePickerAsset } from "expo-image-picker";

export const smartCapitalize = (name?: string) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-)\S/g, (char) => char.toUpperCase());
};

export const getDistanceInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const R = 6371000;
  const toRad = (d: number) => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/**
 * Today's date in Asia/Jakarta as "YYYY-MM-DD".
 *
 * Pakai Intl.DateTimeFormat("en-CA", ...) yang menghasilkan "YYYY-MM-DD"
 * langsung — ANDAL di Hermes (engine RN). Hindari pola lama
 * `new Date(date.toLocaleString("en-US", {timeZone}))` (round-trip string
 * yang bisa melempar Invalid Date / tanggal salah di Hermes). Cocok
 * dengan `created_at` backend format "2026-08-09 10:47:12" (bagian tanggal
 * = `split(" ")[0]`).
 */
export function getTodayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Parse timestamp backend (format spasi "YYYY-MM-DD HH:MM:SS[.fff]") sebagai
 * WIB (Asia/Jakarta) → Date absolut. ANDAL di Hermes (bukan new Date(spasi)
 * yang engine-dependent). Pakai untuk field WIB: checkin, checkout.
 *
 * "2026-08-09 17:47:11" → Date di 17:47:11 WIB.
 */
export function parseWIBDate(value?: string | null): Date | null {
  if (!value) return null;
  // Normalisasi ke ISO dengan offset WIB: ganti spasi → "T", append "+07:00"
  // bila belum ada offset/Z.
  let s = value.replace(" ", "T");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s + "+07:00";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse timestamp backend sebagai UTC → Date absolut. Pakai untuk field
 * UTC: created_at, updated_at (backend Postgres default tanpa zona = UTC).
 *
 * "2026-08-09 10:47:12" → Date di 10:47:12 UTC.
 */
export function parseUTCDate(value?: string | null): Date | null {
  if (!value) return null;
  let s = value.replace(" ", "T");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s + "Z";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format timestamp backend ke "id-ID" untuk tampilan, di-zona WIB. Otomatis
 * deteksi WIB vs UTC berdasarkan field (isUTC). Hasil konsisten lintas timezone
 * device karena pakai timeZone: "Asia/Jakarta" di Intl.
 */
export function formatAttendanceDate(
  value?: string | null,
  isUTC = false,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
): string {
  const d = isUTC ? parseUTCDate(value) : parseWIBDate(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    ...options,
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/**
 * Helper WCAG AA Relative Luminance untuk menentukan warna teks (putih vs hitam gelap)
 * di atas warna latar belakang arbitrary hex (S-MO-5 / S-FE-7).
 */
export function getAccessibleTextColor(hexColor?: string | null): string {
  if (!hexColor || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return "#FFFFFF";
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;
  // Rumus relative luminance WCAG AA
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#1A1C1E" : "#FFFFFF";
}

type CompressOptions = {
  maxWidth?: number;
  quality?: number; // 0 - 1
  format?: ImageManipulator.SaveFormat;
};

export const compressImage = async (
  asset?: ImagePickerAsset,
  options?: CompressOptions
) => {
  if (!asset?.uri) {
    throw new Error("Invalid image asset");
  }

  const {
    maxWidth = 1280,
    quality = 0.6,
    format = ImageManipulator.SaveFormat.JPEG,
  } = options || {};

  const actions: ImageManipulator.Action[] = [];

  // Resize hanya jika width > maxWidth
  if (asset.width && asset.width > maxWidth) {
    actions.push({
      resize: {
        width: maxWidth,
      },
    });
  }

  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: quality,
    format,
  });

  return {
    ...result,
    uri: result.uri,
    width: result.width,
    height: result.height,
    type:
      format === ImageManipulator.SaveFormat.PNG ? "image/png" : "image/jpeg",
  };
};

// const compressed = await compressImage(asset, {
//   maxWidth: 1280,
//   quality: 0.5,
// });
