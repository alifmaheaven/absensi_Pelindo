import axios from "@/lib/axios";
import {
  IAttendance,
  IAttendanceEvidGroupId,
  IAttendanceSite,
  IAttendanceStatus,
  IGroupID,
  IMeta,
  IUpload,
  Response,
  TAttendance,
  TParams,
} from "@/types";

export async function getAttendanceList(
  params: TParams & {
    order_by_desc: string[];
    include?: string;
    user_id_exact?: string[];
    id_exact?: string[];
    created_at_gte?: string[];
    created_at_lte?: string[];
    checkin_gte?: string[];
    checkin_lte?: string[];
    [key: string]: any;
  },
): Promise<Response<{ data: IAttendance[]; meta?: IMeta }>> {
  try {
    const response = await axios.get("/api/v2/attendance/", { params });
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function uploadEvid(file: File): Promise<Response<IUpload[]>> {
  try {
    const formData = new FormData();
    formData.append("files", file);

    const response = await axios.post("/api/v2/attendance/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

export async function deleteEvidtmp(payload: {
  links: string[];
}): Promise<Response<{ links: string[] }>> {
  try {
    const response = await axios.delete("/api/v2/attendance/upload", {
      data: payload,
    });

    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

export async function deleteEvid(payload: {
  id: string;
}): Promise<Response<{ id: string }>> {
  try {
    const response = await axios.delete("/evidence/", { data: payload });

    return response.data;
  } catch (error) {
    console.error("delete failed:", error);
    throw error;
  }
}

export async function getAttendanceStatus(
  params: TParams,
): Promise<Response<{ data: IAttendanceStatus[] }>> {
  try {
    const response = await axios.get("/api/v2/attendance-status/", { params });

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function createGroupId(payload: {
  name: string;
  description: string;
}): Promise<Response<IGroupID>> {
  try {
    const response = await axios.post("/evidence-group/", payload);

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * F-03 (P0) — SATU PINTU untuk absensi. Cabang NetInfo di sini DIHAPUS.
 *
 * Dulu fungsi ini memeriksa koneksi SEKALI LAGI dan, bila offline, meng-queue
 * item bertipe `STANDARD_REQUEST` lalu mengembalikan objek yang bentuknya
 * seperti sukses. Layar check-in membaca `res.data?.id` yang tidak ada,
 * menganggap tidak ada bukti yang gagal, lalu menampilkan "Berhasil Check In!".
 * Saat sync, STANDARD_REQUEST diperlakukan sebagai "non-kritis": 4xx/409
 * dibuang dengan `console.warn` dan item >48 jam juga dibuang — tanpa keranjang
 * gagal, tanpa banner, tanpa notifikasi. Satu baris presensi lenyap sementara
 * pengguna sudah diberi tahu bahwa absensinya berhasil.
 *
 * Jendela pemicunya adalah seluruh proses unggah bukti (grup + N foto) yang
 * berjalan di antara NetInfo milik layar dan NetInfo milik fungsi ini — persis
 * kondisi sinyal naik-turun di area pelabuhan.
 *
 * Sekarang: layar yang memutuskan offline/online (checkin.tsx memakai
 * `queueOfflineCheckIn` dengan tipe ATTENDANCE_CHECKIN yang benar, termasuk
 * fotonya), dan bila pengiriman gagal karena jaringan murni, blok catch layar
 * sudah menyimpannya ke antrean yang sama. Kegagalan jaringan di sini naik apa
 * adanya sebagai error, sehingga TIDAK ADA lagi jalur yang mengembalikan
 * "sukses" palsu.
 */
export async function createAttendance(
  payload: TAttendance,
): Promise<Response<IAttendance>> {
  try {
    const response = await axios.post("/api/v2/attendance/", payload);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * F-03 (P0) — kembaran checkout dari cabang yang dihapus di
 * `createAttendance`. Cacatnya identik: queueRequest membuat item
 * STANDARD_REQUEST yang dibuang senyap pada 4xx/409 dan pada >48 jam, padahal
 * layar checkout sudah menampilkan "Berhasil Check Out!".
 *
 * Jalur offline yang benar sudah ada dan membawa tipe yang tepat
 * (ATTENDANCE_CHECKOUT + localImages) — lihat blok catch di checkout.tsx.
 */
export async function updateAttendance(payload: {
  id: string;
  checkout: string;
  checkout_longitude?: number;
  checkout_latitude?: number;
  description?: string;
}) {
  try {
    const response = await axios.put("/api/v2/attendance/", payload);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function uploadEvidGroupId(payload: {
  name: string;
  description: string;
  file: string;
  evidence_group_id: string;
}) {
  try {
    const response = await axios.post("/evidence/", payload);

    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

export async function getEvidGroupId(
  params: TParams & { evidence_group_id_exact: string[] },
): Promise<Response<{ data: IAttendanceEvidGroupId[] }>> {
  try {
    const response = await axios.get("/evidence/", { params });

    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

export async function getAttendanceSite(
  params: TParams & { site_id_exact?: string[]; company_id_exact?: string[] },
): Promise<Response<{ data: IAttendanceSite[] }>> {
  try {
    const response = await axios.get("/site/", { params });

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function uploadEvidPermanent(payload: {
  links: string[];
}): Promise<
  Response<{
    links: string[];
  }>
> {
  try {
    const response = await axios.post("/api/v2/attendance/upload-permanent", payload);

    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

export interface IAttendanceMySummaryTotals {
  A: number;
  T: number;
  S: number;
  I: number;
  C: number;
  L: number;
  X: number;
  '.': number;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  cuti: number;
  alpha: number;
  total_hadir: number;
}

export interface IAttendanceMySummary {
  month: string;
  days_in_month: number;
  user_id: string;
  name: string;
  matrix: string[];
  totals: IAttendanceMySummaryTotals;
}

/**
 * R-BL-4: GET /api/v2/attendance/my-summary?month=YYYY-MM
 * Self-service monthly summary for authenticated mobile user.
 */
export async function getAttendanceMySummary(
  month: string,
): Promise<Response<IAttendanceMySummary>> {
  try {
    const response = await axios.get("/api/v2/attendance/my-summary", {
      params: { month },
    });
    return response.data;
  } catch (error) {
    console.error("Get my attendance summary error:", error);
    throw error;
  }
}
