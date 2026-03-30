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

export function getTodayStaticTimeString(
  hour: number,
  minute = 0,
  second = 0
): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

export const getGoogleMapsEmbedUrl = (lat: number, lng: number) => {
  return `
    https://www.google.com/maps?q=${lat},${lng}&z=17&output=embed
  `;
};

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
