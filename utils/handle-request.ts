import { removeToken, removeCheckInId, removeVersionCode } from "@/lib/storage";
import { Response, THttpErrorResult } from "@/types";
import axios, { AxiosError } from "axios";
import { router } from "expo-router";

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Permintaan tidak valid",
  401: "Sesi berakhir, silakan login ulang",
  403: "Anda tidak memiliki akses",
  404: "Data tidak ditemukan",
  409: "Terjadi konflik data",
  422: "Data yang dikirim tidak valid",
  500: "Terjadi kesalahan pada server",
};

// Cek apakah error message mengindikasikan token expired
function isTokenExpiredMessage(data: unknown): boolean {
  if (data && typeof data === "object" && "message" in data) {
    const msg = String((data as Record<string, unknown>).message).toLowerCase();
    return msg.includes("expired") || msg.includes("token") || msg.includes("unauthorized");
  }
  return false;
}

// Bersihkan semua data terkait auth dari storage
async function clearAuthStorage() {
  await removeToken();
  await removeCheckInId();
  await removeVersionCode();
}

export async function handleHttpError(
  error: unknown
): Promise<THttpErrorResult> {
  // Bukan Axios error -> network error
  if (!axios.isAxiosError(error)) {
    return {
      title: "Koneksi Bermasalah",
      message: "Tidak dapat terhubung ke server. Periksa jaringan Anda.",
    } as THttpErrorResult;
  }

  const axiosError = error as AxiosError<Response>;

  // Axios error tapi tidak ada response -> network error/timeout
  if (!axiosError.response) {
    if (axiosError.code === "ECONNABORTED") {
      return {
        title: "Waktu Habis",
        code: 0,
        message: "Koneksi timeout. Periksa jaringan Anda dan coba lagi.",
      };
    }
    return {
      title: "Koneksi Bermasalah",
      code: 0,
      message: "Tidak dapat terhubung ke server. Periksa jaringan Anda.",
    };
  }

  const status = axiosError.response?.status ?? 0;

  // Logout jika unauthorized karena token expired
  if (status === 401) {
    const responseData = axiosError.response.data;
    const isExpired = isTokenExpiredMessage(responseData);

    // Hanya redirect ke login jika error mengindikasikan token expired
    // (bukan 401 dari login endpoint dengan kredensial salah)
    if (isExpired) {
      await clearAuthStorage();
      router.replace("/auth");
    }
  }

  console.error("HTTP Error:", axiosError.response?.status);

  const responseMessage =
    axiosError.response?.data?.message ||
    DEFAULT_MESSAGES[status] ||
    "Terjadi kesalahan tidak terduga";

  return {
    title: status >= 500 ? "Server Error" : "Request Error",
    code: status,
    message: responseMessage,
  };
}
