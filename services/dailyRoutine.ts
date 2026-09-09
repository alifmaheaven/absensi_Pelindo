import axios from "@/lib/axios";
import {
  Response,
  ITodayRoutineResponse,
  ITodayRoutinesAllResponse,
  IDailyRoutineLog,
  IDailyRoutine,
  IDailyRoutineSubmitItem,
} from "@/types";

export async function getTodayRoutines(): Promise<Response<ITodayRoutinesAllResponse>> {
  const res = await axios.get("/daily-routine/today/all");
  return res.data;
}

/**
 * R-D4-5: Petakan pesan error daily routine (startLog, getTodayRoutines, getDetail, submitLog)
 * ke pesan bahasa Indonesia yang actionable.
 * Menggunakan substring matching agar tahan terhadap variasi pesan server,
 * dengan fallback ke pesan server asli atau pesan default.
 */
export function mapDailyRoutineError(
  error: any,
  defaultFallback = "Terjadi kesalahan saat memproses Daily Routine"
): string {
  if (!error) return defaultFallback;

  // Ekstrak status code dari AxiosError, handleHttpError result, atau status property
  const status =
    error?.code ??
    error?.response?.status ??
    error?.status ??
    (typeof error?.code === "number" ? error.code : 0);

  // Ekstrak pesan teks dari berbagai kemungkinan struktur (handleHttpError, axios, atau Error biasa)
  const rawMessage =
    (typeof error === "string" ? error : null) ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "";

  const lowerMsg = String(rawMessage).toLowerCase();

  // R-D4-5: 400 "You have not checked in today" → "Anda belum check-in hari ini."
  if (
    status === 400 ||
    lowerMsg.includes("not checked in") ||
    lowerMsg.includes("haven't checked in") ||
    lowerMsg.includes("have not checked in") ||
    lowerMsg.includes("belum check in") ||
    lowerMsg.includes("belum check-in") ||
    (lowerMsg.includes("check in") && lowerMsg.includes("today")) ||
    (lowerMsg.includes("check-in") && lowerMsg.includes("hari ini"))
  ) {
    return "Anda belum check-in hari ini.";
  }

  // R-D4-5: 404 "Daily routine not found" → "Routine tidak tersedia untuk site check-in Anda. Pastikan Anda check-in di site yang benar."
  if (
    status === 404 ||
    lowerMsg.includes("daily routine not found") ||
    lowerMsg.includes("daily_routine not found") ||
    (lowerMsg.includes("routine") && lowerMsg.includes("not found")) ||
    (lowerMsg.includes("routine") && lowerMsg.includes("tidak ditemukan"))
  ) {
    return "Routine tidak tersedia untuk site check-in Anda. Pastikan Anda check-in di site yang benar.";
  }

  // R-D4-5: 403 → "Anda tidak memiliki izin untuk memulai routine ini."
  if (
    status === 403 ||
    lowerMsg.includes("forbidden") ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("access denied") ||
    lowerMsg.includes("missing permission") ||
    lowerMsg.includes("tidak memiliki izin") ||
    lowerMsg.includes("tidak memiliki akses") ||
    lowerMsg.includes("akses ditolak")
  ) {
    return "Anda tidak memiliki izin untuk memulai routine ini.";
  }

  // Fallback: Jika rawMessage informatif (bukan generic Axios boilerplate), tampilkan
  if (rawMessage && !lowerMsg.startsWith("request failed with status code")) {
    return rawMessage;
  }

  return defaultFallback;
}


export async function getDailyRoutineById(id: string): Promise<Response<IDailyRoutine & { items: any[] }>> {
  const res = await axios.get(`/daily-routine/${id}`);
  return res.data;
}

export async function startDailyRoutineLog(daily_routine_id: string): Promise<Response<IDailyRoutineLog>> {
  const res = await axios.post("/daily-routine/log/start", { daily_routine_id });
  return res.data;
}

export async function submitDailyRoutineLog(
  log_id: string,
  items: IDailyRoutineSubmitItem[]
): Promise<Response<{ id: string; status: string }>> {
  const res = await axios.post("/daily-routine/log/submit", { log_id, items });
  return res.data;
}

export async function uploadDailyRoutineTemp(file: any): Promise<Response<{ path: string; link: string }[]>> {
  const formData = new FormData();
  formData.append("files", file);
  const res = await axios.post("/daily-routine/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export * from "@/utils/dailyRoutineHelpers";

