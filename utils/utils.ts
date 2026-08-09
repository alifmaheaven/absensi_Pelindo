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
