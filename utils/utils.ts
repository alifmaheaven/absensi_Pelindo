import * as ImageManipulator from "expo-image-manipulator";
import { ImagePickerAsset } from "expo-image-picker";
import type { IAttendance, IScheduleToday, Ishift } from "../types";

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

export interface CalendarDateParts {
  year: number;
  month: number; // 0-indexed (0=Jan, 11=Des)
  day: number;
}

/**
 * Parse string tanggal "YYYY-MM-DD" (atau naive WIB timestamp "YYYY-MM-DD HH:mm:ss")
 * langsung menjadi field kalender numerik murni (year, month 0-indexed, day) tanpa
 * melalui objek Date dan getter lokal perangkat.
 * Menjamin UI kalender tidak bergeser tanggal pada perangkat non-WIB (BUG-266-04).
 */
export function parseDateParts(dateStr?: string | null): CalendarDateParts {
  if (dateStr) {
    const clean = String(dateStr).trim().split(/[ T]/)[0];
    const parts = clean.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return {
        year: parts[0],
        month: parts[1] - 1,
        day: parts[2],
      };
    }
  }
  const todayParts = getTodayDateString().split("-").map(Number);
  return {
    year: todayParts[0],
    month: todayParts[1] - 1,
    day: todayParts[2],
  };
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
 * Parse timestamp backend (format spasi "YYYY-MM-DD HH:MM:SS[.fff]" atau "YYYY-MM-DD") sebagai
 * WIB (Asia/Jakarta) → Date absolut. ANDAL di Hermes (bukan new Date(spasi)
 * yang engine-dependent). Pakai untuk seluruh field waktu database (WIB wall-clock string).
 *
 * "2026-08-09 17:47:11" → Date di 17:47:11 WIB.
 */
export function parseWIBDate(value?: string | null): Date | null {
  if (!value) return null;
  let s = String(value).trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s += "T00:00:00";
  }
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s + "+07:00";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Alias kanonik parseWIBDate identik dengan formatters.js di Web */
export const parseWIB = parseWIBDate;

/** Tanggal hari ini di WIB sebagai "YYYY-MM-DD" (alias getTodayDateString) */
export const todayWIB = getTodayDateString;

/**
 * Dapatkan jam dalam zona WIB (0-23) dari sebuah Date objek secara deterministik
 * tanpa terpengaruh zona waktu lokal perangkat.
 * Menggunakan aritmatika UTC+7 murni karena WIB tidak memiliki daylight saving time (DST).
 */
export function getWIBHour(date: Date): number {
  return new Date(date.getTime() + 7 * 3600 * 1000).getUTCHours();
}

/**
 * Bangun objek Date absolut di zona WIB pada jam dan menit tertentu dari baseDate.
 * Mencegah bug Date.setHours() yang mengevaluasi dalam zona waktu lokal perangkat.
 */
export function buildWIBScheduledTime(
  baseDate: Date,
  hour: number,
  minute = 0
): Date {
  const dateStr = getWIBDateString(baseDate);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return parseWIBDate(`${dateStr} ${hh}:${mm}:00`) || new Date(baseDate);
}

/**
 * Format tanggal dalam zona waktu WIB (Asia/Jakarta).
 * Menerima Date atau string wall-clock WIB.
 * Contoh: "11 Sep 2026".
 */
export function formatDate(
  date?: string | Date | null,
  formatStr?: string
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? parseWIBDate(date) : date;
  if (!d || isNaN(d.getTime())) return typeof date === "string" ? date : "-";

  if (formatStr) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const dd = parts.find((p) => p.type === "day")?.value || "01";
    const mmNum =
      parseInt(parts.find((p) => p.type === "month")?.value || "1", 10) - 1;
    const mmStr = parts.find((p) => p.type === "month")?.value || "01";
    const yyyy = parts.find((p) => p.type === "year")?.value || "2026";
    const mmm = months[mmNum] || "Jan";
    return formatStr
      .replace("YYYY", yyyy)
      .replace("MMM", mmm)
      .replace("MM", mmStr)
      .replace("DD", dd);
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/**
 * Format tanggal dan waktu lengkap dalam zona WIB (Asia/Jakarta).
 * Contoh: "11/09/2026, 14.30.00".
 */
export function formatDateTime(
  date?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? parseWIBDate(date) : date;
  if (!d || isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/**
 * Format selisih waktu aktivitas relatif dalam bahasa Indonesia ("baru saja", "5m lalu", "2j lalu", "3h lalu").
 * Parsing timestamp melalui parseWIBDate untuk menghindari Shape 1 / Shape 2 shift.
 */
export function formatRelative(date?: string | Date | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? parseWIBDate(date) : date;
  if (!d || isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}h lalu`;
  return formatDate(d);
}

/**
 * Parse timestamp backend sebagai UTC → Date absolut.
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
    (params.checkinTime ? params.checkinTime.split(/[T\s]/)[0] : getTodayDateString());

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
      const checkoutDay = completedCandidate.checkout.split(/[T\s]/)[0];
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

/**
 * Sesi yang ditampilkan Home Screen. Field waktu dan id dipertahankan agar
 * fixture test maupun objek attendance lengkap dapat dipakai tanpa any.
 */
type HomeScreenDisplaySession = {
  id?: string;
  checkin?: string | null;
  checkout?: string | null;
  shift?: Ishift | null;
};

/**
 * ADR-268 / OD268-3:
 * Resolusi shift deterministik tanpa heuristik jam tebakan.
 * 1. Jika displaySession.shift ada: gunakan shift dari sesi presensi tersebut.
 * 2. Jika tidak: gunakan jadwal shift hari ini.
 */
export function resolveHomeScreenCurrentShift(params: {
  displaySession?: HomeScreenDisplaySession | null;
  todaySchedule?: Partial<IScheduleToday> | null;
}): Ishift | null {
  return params.displaySession?.shift ?? params.todaySchedule?.shift ?? null;
}

/**
 * Konstanta cut-off hari operasional dalam jam (ADR-245).
 * Pergantian hari operasional resmi pada pukul 04:00 WIB.
 */
export const OPERATIONAL_DAY_CUTOFF_HOURS = 4;

/**
 * Menghitung tanggal hari operasional WIB ("YYYY-MM-DD") dengan batas cut-off 04:00 WIB (ADR-245).
 * - Waktu 00:00:00 s.d. 03:59:59 WIB dihitung sebagai tanggal operasional kemarin (H-1).
 * - Waktu 04:00:00 s.d. 23:59:59 WIB dihitung sebagai tanggal operasional hari kalender berjalan (H).
 * Menerima Date, string timestamp ("YYYY-MM-DD HH:mm:ss" naive WIB atau ISO), atau default waktu sekarang.
 */
export function getOperationalDateWIB(dateOrStr: Date | string = new Date()): string {
  let d: Date;
  if (typeof dateOrStr === "string") {
    const parsed = parseWIBDate(dateOrStr);
    d = parsed || new Date(dateOrStr);
  } else {
    d = dateOrStr;
  }
  const shifted = new Date(d.getTime() - OPERATIONAL_DAY_CUTOFF_HOURS * 60 * 60 * 1000);
  return getWIBDateString(shifted);
}

export interface CompletedShiftBannerInfo {
  title: string;
  subtitle: string;
  isNewOperationalDay: boolean;
}

/**
 * Menghasilkan judul dan teks penjelasan banner pasca-checkout (Recently Completed Session)
 * berdasarkan perbandingan hari operasional sesi terhadap waktu sekarang (cut-off 04:00 WIB).
 * Mengeliminasi ambiguitas kata "Selesai" dan memberikan panduan tindakan presensi hari ini (Audit 256).
 */
export function getCompletedShiftBannerInfo(params: {
  session?: { checkin?: string | null; checkout?: string | null } | null;
  currentTime?: Date;
}): CompletedShiftBannerInfo {
  const currentTime = params.currentTime || new Date();
  const session = params.session;

  const checkinStr = formatHourMinute(session?.checkin);
  const checkoutStr = formatHourMinute(session?.checkout);

  // Hari operasional sesi ditentukan oleh checkin (atau checkout bila checkin kosong)
  const sessionTimestamp = session?.checkin || session?.checkout;
  const sessionOpDate = sessionTimestamp ? getOperationalDateWIB(sessionTimestamp) : null;
  const currentOpDate = getOperationalDateWIB(currentTime);

  // Jika hari operasional saat ini sudah berganti (>= 04:00 WIB relatif terhadap sesi)
  const isNewOperationalDay = !sessionOpDate || currentOpDate !== sessionOpDate;

  if (isNewOperationalDay) {
    return {
      title: "Riwayat Shift Kemarin",
      subtitle: `Selesai: masuk ${checkinStr} WIB, keluar ${checkoutStr} WIB. Anda dapat melakukan check-in untuk jadwal hari ini.`,
      isNewOperationalDay: true,
    };
  }

  return {
    title: "Shift Telah Selesai",
    subtitle: `Masuk ${checkinStr} WIB, keluar ${checkoutStr} WIB. Hari operasional baru dimulai pukul 04:00 WIB.`,
    isNewOperationalDay: false,
  };
}

export type AttendanceState =
  | "ON_TIME"
  | "LATE"
  | "EARLY_CHECKOUT"
  | "UNKNOWN_SCHEDULE";

export interface AttendanceStatusParams {
  datetime?: string | null;
  type?: "checkin" | "checkout";
  shift?: {
    start_time?: string | null;
    end_time?: string | null;
    grace_late?: number | null;
    grace_early?: number | null;
    is_overnight?: boolean | null;
    name?: string | null;
  } | null;
  shiftDate?: string | null;
}

export interface AttendanceStatusResult {
  state: AttendanceState;
  deltaMinutes: number;
  displayText: string;
}

/**
 * OD267-7 / ADR-267: Helper tunggal kalkulasi status presensi dan indikator keterlambatan.
 * Digunakan bersama oleh Beranda (AttendanceCard) dan Tab Riwayat (attendance.tsx)
 * untuk menjamin konsistensi data (mencegah RSK-267-04).
 *
 * Aturan Bisnis & Kontrak Waktu (OD267-7 & OD267-9):
 * 1. deltaMinutes dihitung dari JAM JADWAL ASLI (scheduled_time), BUKAN dari akhir batas toleransi (grace).
 *    grace_late hanya menentukan APAKAH status dihitung terlambat (gate threshold).
 *    Contoh: Jadwal 08:00, grace 15, absen 08:16 -> LATE dengan deltaMinutes 16 (Terlambat 16 Menit).
 *    Selaras 100% dengan backend attendanceSummaryController.ts:586.
 * 2. Jadwal tidak ada / data shift kosong -> UNKNOWN_SCHEDULE ("Dinas Mandiri (Jadwal Terbuka)"),
 *    tidak pernah menuduh pengguna terlambat.
 * 3. Parsing waktu wajib menggunakan helper WIB (parseWIBDate, getWIBHour, buildWIBScheduledTime).
 * 4. Teks dalam Bahasa Indonesia baku formal tanpa emoji (UX Spec §3.3).
 */
export function calculateAttendanceStatus(
  params: AttendanceStatusParams
): AttendanceStatusResult {
  const { datetime, type = "checkin", shift, shiftDate } = params;

  // 1. Tanpa jadwal atau data shift tidak lengkap -> UNKNOWN_SCHEDULE
  if (
    !shift ||
    (type === "checkin" && !shift.start_time) ||
    (type === "checkout" && !shift.end_time)
  ) {
    return {
      state: "UNKNOWN_SCHEDULE",
      deltaMinutes: 0,
      displayText: "Dinas Mandiri (Jadwal Terbuka)",
    };
  }

  // 2. Jika datetime belum ada (belum ada rekaman absensi), kembalikan teks jadwal
  if (!datetime) {
    const timeLabel =
      type === "checkin"
        ? `Mulai ${shift.start_time?.slice(0, 5) ?? "--:--"} WIB`
        : `Selesai ${shift.end_time?.slice(0, 5) ?? "--:--"} WIB`;
    return {
      state: "UNKNOWN_SCHEDULE",
      deltaMinutes: 0,
      displayText: timeLabel,
    };
  }

  // 3. Parse timestamp ke Date WIB absolut
  const actualTime = parseWIBDate(datetime);
  if (!actualTime) {
    return {
      state: "UNKNOWN_SCHEDULE",
      deltaMinutes: 0,
      displayText: "Dinas Mandiri (Jadwal Terbuka)",
    };
  }

  const [sh, sm] = (shift.start_time || "08:00").split(":").map(Number);
  const [eh, em] = (shift.end_time || "17:00").split(":").map(Number);

  // 4. Tentukan baseDate (WIB) untuk pembentukan waktu jadwal
  let baseDate = new Date(actualTime);
  if (shiftDate) {
    const parsedShiftDate = parseWIBDate(
      shiftDate.includes(" ") ? shiftDate : `${shiftDate} 00:00:00`
    );
    if (parsedShiftDate) {
      baseDate = parsedShiftDate;
    }
  } else if (type === "checkout" && (shift.is_overnight || eh < sh)) {
    // Jika checkout terjadi di jam pagi (< sh), maka tanggal mulai shift adalah kemarin
    if (getWIBHour(actualTime) < sh) {
      baseDate = new Date(baseDate.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  if (type === "checkin") {
    const scheduledTime = buildWIBScheduledTime(baseDate, sh, sm || 0);
    const graceLate = shift.grace_late != null ? Number(shift.grace_late) : 0;
    const lateThresholdMs = scheduledTime.getTime() + graceLate * 60 * 1000;
    const checkinMs = actualTime.getTime();
    const scheduledMs = scheduledTime.getTime();

    // Sesuai backend: checkinMs > lateThresholdMs
    // lateMinutes = Math.round((checkinMs - scheduledMs) / 60000)
    if (checkinMs > lateThresholdMs) {
      const deltaMinutes = Math.max(0, Math.round((checkinMs - scheduledMs) / 60000));
      return {
        state: "LATE",
        deltaMinutes,
        displayText: `Terlambat ${deltaMinutes} Menit`,
      };
    }

    // Jika datang lebih awal >= 5 menit dari jadwal (UX Spec §3.3)
    if (scheduledMs - checkinMs >= 5 * 60 * 1000) {
      const earlyMinutes = Math.max(0, Math.round((scheduledMs - checkinMs) / 60000));
      return {
        state: "ON_TIME",
        deltaMinutes: earlyMinutes,
        displayText: `Lebih Awal ${earlyMinutes} Menit`,
      };
    }

    return {
      state: "ON_TIME",
      deltaMinutes: 0,
      displayText: "Tepat Waktu",
    };
  } else {
    // Checkout
    let scheduledTime = buildWIBScheduledTime(baseDate, eh, em || 0);
    if (shift.is_overnight || eh < sh) {
      scheduledTime = new Date(scheduledTime.getTime() + 24 * 60 * 60 * 1000);
    }
    const graceEarly = shift.grace_early != null ? Number(shift.grace_early) : 0;
    const earlyThresholdMs = scheduledTime.getTime() - graceEarly * 60 * 1000;
    const checkoutMs = actualTime.getTime();
    const scheduledMs = scheduledTime.getTime();

    if (checkoutMs < earlyThresholdMs) {
      const deltaMinutes = Math.max(0, Math.round((scheduledMs - checkoutMs) / 60000));
      return {
        state: "EARLY_CHECKOUT",
        deltaMinutes,
        displayText: `Pulang Awal ${deltaMinutes} Menit`,
      };
    }

    return {
      state: "ON_TIME",
      deltaMinutes: 0,
      displayText: "Tepat Waktu",
    };
  }
}

/**
 * Adapter untuk komponen visual yang membutuhkan teks status presensi.
 * Menjamin keseragaman salinan teks dengan mendelegasikan ke calculateAttendanceStatus.
 */
export function getWorkStatus(
  datetime?: string | null,
  type: "checkin" | "checkout" = "checkin",
  shift?: Ishift | null,
  shiftDate?: string | null
): string {
  const result = calculateAttendanceStatus({
    datetime,
    type,
    shift,
    shiftDate,
  });
  return result.displayText;
}


