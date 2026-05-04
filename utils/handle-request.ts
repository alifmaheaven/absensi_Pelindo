import { removeToken } from "@/lib/storage";
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

export async function handleHttpError(
  error: unknown
): Promise<THttpErrorResult> {
  // Network error / bukan Axios
  if (!axios.isAxiosError(error)) {
    return {
      title: "Koneksi Bermasalah",
      code: 0,
      message: "Tidak dapat terhubung ke server",
    };
  }

  const axiosError = error as AxiosError<Response>;
  const status = axiosError.response?.status ?? 0;

  // Logout jika unauthorized
  if (status === 401) {
    await removeToken();
    router.replace("/auth");
  }

  console.log('handleHttpError', axiosError.response?.data);

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
