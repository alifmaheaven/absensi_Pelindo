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
    // "authorization" mencakup pesan umum backend seperti "Authorization not found"
    // (token tidak ada/rusak) — pesan login dengan kredensial salah berbeda
    // (mis. "Invalid email or password"), jadi aman tidak kena false positive.
    return (
      msg.includes("expired") ||
      msg.includes("token") ||
      msg.includes("unauthorized") ||
      msg.includes("authorization")
    );
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

  // PENTING: 403 (Forbidden) BUKAN 401 (Unauthorized).
  // Jangan sekali-kali memanggil clearAuthStorage() atau me-redirect ke /auth pada 403,
  // karena itu akan menyebabkan seluruh pengguna mobile ter-logout berulang saat mengakses fitur yang belum di-grant.
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

  let responseMessage =
    axiosError.response?.data?.message ||
    DEFAULT_MESSAGES[status] ||
    "Terjadi kesalahan tidak terduga";

  // Normalisasi pesan 403 agar informatif bagi pengguna lapangan
  if (status === 403) {
    if (typeof responseMessage === "string" && responseMessage.toLowerCase().includes("missing permission")) {
      const match = responseMessage.match(/missing permission:\s*([a-zA-Z0-9_-]+)/i);
      const perm = match ? match[1] : "";
      responseMessage = perm
        ? `Anda tidak memiliki izin akses (${perm}). Silakan hubungi administrator untuk meminta hak akses.`
        : "Anda tidak memiliki izin akses untuk fitur ini. Silakan hubungi administrator.";
    } else if (responseMessage === DEFAULT_MESSAGES[403]) {
      responseMessage = "Anda tidak memiliki izin akses untuk fitur ini. Silakan hubungi administrator.";
    }
  }

  // Normalisasi pesan 409 agar informatif bagi pengguna lapangan jika server mengembalikan pesan generik/mentah DB
  if (status === 409) {
    if (
      !axiosError.response?.data?.message ||
      responseMessage === DEFAULT_MESSAGES[409] ||
      (typeof responseMessage === "string" &&
        (responseMessage.toLowerCase().includes("duplicate key") ||
          responseMessage.toLowerCase().includes("uq_attendance")))
    ) {
      responseMessage =
        "Presensi Anda pada Hari Operasional ini sudah terdaftar (cut-off pukul 04:00 WIB). Periksa status dinas di Beranda atau hubungi pengawas jika memerlukan koreksi.";
    }
  }

  const title =
    status >= 500
      ? "Server Error"
      : status === 403
      ? "Akses Ditolak"
      : status === 409
      ? "Presensi Sudah Terdaftar"
      : "Request Error";

  return {
    title,
    code: status,
    message: responseMessage,
  };
}
