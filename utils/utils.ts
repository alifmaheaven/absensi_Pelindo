import * as ImageManipulator from "expo-image-manipulator";
import { ImagePickerAsset } from "expo-image-picker";
import type { IAttendance, IScheduleToday } from "../types";

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
/**
 * Tanggal dalam zona WIB (Asia/Jakarta) sebagai "YYYY-MM-DD".
 * Mendukung injeksi Date arbitrary untuk simulasi/testing.
 */
export function getWIBDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getTodayDateString(): string {
  return getWIBDateString(new Date());
}

/**
 * Format string datetime WIB ("YYYY-MM-DD HH:MM[:SS]") ke "HH:MM".
 * Fallback aman ke "--:--" bila null/empty.
 */
export function formatHourMinute(datetime?: string | null): string {
  if (!datetime) return "--:--";
  const timePart = datetime.split(" ")[1];
  if (!timePart) return "--:--";
  const parts = timePart.split(":");
  return `${parts[0] || "--"}:${parts[1] || "--"}`;
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

export interface EarlyCheckoutStatus {
  isEarly: boolean;
  scheduledEndMs: number | null;
  shiftName: string;
  shiftEndTime: string;
  deficitMinutes: number;
  deficitText?: string;
}

/**
 * Deteksi apakah checkout saat ini termasuk pulang lebih awal (early checkout)
 * berdasarkan shift aktif, toleransi pulang awal (grace_early), dan jam sekarang.
 * Bekerja untuk shift normal (siang) maupun shift malam.
 */
export function calculateEarlyCheckoutStatus(params: {
  currentTime: Date;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  shift?: {
    name?: string;
    start_time: string;
    end_time: string;
    grace_early?: number;
    is_overnight?: boolean;
  } | null;
  shiftDate?: string | null;
}): EarlyCheckoutStatus {
  const defaultResult: EarlyCheckoutStatus = {
    isEarly: false,
    scheduledEndMs: null,
    shiftName: params.shift?.name || "Shift Kerja",
    shiftEndTime: params.shift?.end_time ? params.shift.end_time.slice(0, 5) : "",
    deficitMinutes: 0,
    deficitText: undefined,
  };

  // Jika belum checkin atau sudah checkout, bukan early checkout
  if (!params.checkinTime || params.checkoutTime) {
    return defaultResult;
  }

  // Jika tidak ada shift yang terjadwal
  if (!params.shift || !params.shift.end_time) {
    return defaultResult;
  }

  const { shift, currentTime } = params;
  const shiftName = shift.name || "Shift Kerja";
  const shiftEndTime = shift.end_time.slice(0, 5);

  const [eh, em] = shift.end_time.split(":").map(Number);
  const [sh] = (shift.start_time || "08:00").split(":").map(Number);

  // Tentukan tanggal dasar shift (WIB)
  const shiftDateStr =
    params.shiftDate ||
    (params.checkinTime ? params.checkinTime.split(" ")[0] : getTodayDateString());

  const formattedEndTime =
    shift.end_time.length === 5 ? `${shift.end_time}:00` : shift.end_time;
  const parsedEnd = parseWIBDate(`${shiftDateStr} ${formattedEndTime}`);
  const scheduledEndDate = parsedEnd ? new Date(parsedEnd) : new Date(currentTime);

  // Jika shift overnight atau end_time < start_time, tanggal berakhir adalah H+1
  if (shift.is_overnight || eh < sh) {
    scheduledEndDate.setTime(scheduledEndDate.getTime() + 24 * 60 * 60 * 1000);
  }

  const nowMs = currentTime.getTime();
  const scheduledEndMs = scheduledEndDate.getTime();
  const graceEarly = shift.grace_early ?? 15;
  const graceEarlyMs = graceEarly * 60 * 1000;

  // Sesuai aturan: nowMs < scheduledEndMs - graceEarly*60000
  const isEarly = nowMs < scheduledEndMs - graceEarlyMs;

  let deficitMinutes = 0;
  let deficitText: string | undefined;

  if (nowMs < scheduledEndMs) {
    const remMs = scheduledEndMs - nowMs;
    const remHours = Math.floor(remMs / 3600000);
    const remMinutes = Math.floor((remMs % 3600000) / 60000);
    deficitMinutes = Math.floor(remMs / 60000);
    deficitText =
      remHours > 0
        ? remMinutes > 0
          ? `${remHours} Jam ${remMinutes} Menit Lebih Cepat`
          : `${remHours} Jam Lebih Cepat`
        : `${remMinutes} Menit Lebih Cepat`;
  }

  return {
    isEarly,
    scheduledEndMs,
    shiftName,
    shiftEndTime,
    deficitMinutes,
    deficitText,
  };
}

export interface AttendanceSessionResolution {
  activeSession: IAttendance | null;
  recentlyCompletedSession: IAttendance | null;
  isExpiredSession: boolean;
  expiredSession: IAttendance | null;
}

/**
 * Resolusi sesi presensi aktif dan riwayat sesi baru selesai (Laporan 248).
 *
 * Aturan Bisnis (Observer Adjudication):
 * 1. Sesi aktif HANYA baris presensi dengan checkout NULL/kosong dan checkin <= 18 jam lalu.
 *    Baris dengan checkout terisi TIDAK PERNAH dianggap sesi aktif.
 * 2. Baris dengan checkout terisi (mis. sesi kemarin yang checkout lewat tengah malam / 00:05 hari ini)
 *    masuk ke recentlyCompletedSession untuk informasi dan TIDAK memblokir check-in.
 * 3. Sesi dengan checkout kosong tetapi checkin > 18 jam lalu dianggap kadaluarsa (isExpiredSession: true)
 *    dan TIDAK memblokir check-in hari ini.
 */
export function resolveAttendanceSession(params: {
  checkInData?: IAttendance[] | null;
  todaySchedule?: IScheduleToday | null;
  currentTime?: Date;
  maxActiveHours?: number;
}): AttendanceSessionResolution {
  const currentTime = params.currentTime || new Date();
  const maxActiveHours = params.maxActiveHours ?? 18;
  const targetDateStr = getWIBDateString(currentTime);

  let activeSession: IAttendance | null = null;
  let recentlyCompletedSession: IAttendance | null = null;
  let isExpiredSession = false;
  let expiredSession: IAttendance | null = null;

  const { checkInData, todaySchedule } = params;

  // 1. Cek sesi overnight aktif dari todaySchedule.active_overnight_session (kontrak backend §B.1)
  if (todaySchedule?.active_overnight_session) {
    const overnight = todaySchedule.active_overnight_session;
    const isOvernightCheckoutFilled = Boolean(overnight.attendance?.checkout);
    const checkinStr = overnight.attendance?.checkin || overnight.checkin;
    const attId = overnight.attendance?.id ?? overnight.attendance_id;

    // Sesi aktif HANYA bila checkout kosong
    if (!isOvernightCheckoutFilled && checkinStr) {
      const checkinDate = parseWIBDate(checkinStr);
      if (checkinDate) {
        const elapsedHours = (currentTime.getTime() - checkinDate.getTime()) / (1000 * 60 * 60);
        if (elapsedHours >= 0 && elapsedHours <= maxActiveHours) {
          const matched = checkInData?.find(
            (c) => (attId && c.id === attId) || (checkinStr && c.checkin === checkinStr)
          );
          if (matched && !matched.checkout) {
            activeSession = matched;
          } else if (!matched) {
            activeSession = {
              id: attId || "overnight-active",
              checkin: checkinStr,
              checkout: null,
              site_id: overnight.attendance?.site_id ?? null,
              user_id: "",
              created_at: checkinStr,
            } as IAttendance;
          }
        } else if (elapsedHours > maxActiveHours) {
          isExpiredSession = true;
          expiredSession = {
            id: attId || "overnight-expired",
            checkin: checkinStr,
            checkout: null,
            site_id: overnight.attendance?.site_id ?? null,
            user_id: "",
            created_at: checkinStr,
          } as IAttendance;
        }
      }
    }
  }

  // 2. Evaluasi checkInData lokal jika belum ada activeSession
  if (!activeSession && checkInData?.length) {
    const latestUnfinished = checkInData.find((c) => Boolean(c.checkin && !c.checkout));
    if (latestUnfinished?.checkin) {
      const checkinDate = parseWIBDate(latestUnfinished.checkin);
      if (checkinDate) {
        const elapsedHours = (currentTime.getTime() - checkinDate.getTime()) / (1000 * 60 * 60);
        if (elapsedHours >= 0 && elapsedHours <= maxActiveHours) {
          activeSession = latestUnfinished;
        } else if (elapsedHours > maxActiveHours) {
          isExpiredSession = true;
          expiredSession = latestUnfinished;
        }
      }
    }
  }

  // 3. Evaluasi sesi yang baru selesai (recently completed session)
  // Baris dengan checkout terisi yang selesai hari ini WIB atau <= maxActiveHours lalu
  if (checkInData?.length) {
    const completedCandidate = checkInData.find((c) => Boolean(c.checkin && c.checkout));
    if (completedCandidate?.checkout) {
      const checkoutDay = completedCandidate.checkout.split(" ")[0];
      const checkoutDate = parseWIBDate(completedCandidate.checkout);

      if (checkoutDay === targetDateStr) {
        recentlyCompletedSession = completedCandidate;
      } else if (checkoutDate) {
        const checkoutElapsedHours =
          (currentTime.getTime() - checkoutDate.getTime()) / (1000 * 60 * 60);
        if (checkoutElapsedHours >= 0 && checkoutElapsedHours <= maxActiveHours) {
          recentlyCompletedSession = completedCandidate;
        }
      }
    }
  }

  return {
    activeSession,
    recentlyCompletedSession,
    isExpiredSession,
    expiredSession,
  };
}

