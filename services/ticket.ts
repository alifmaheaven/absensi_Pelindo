import { readCache, writeCache } from "@/lib/cache";
import NetInfo from "@react-native-community/netinfo";

import axios from "@/lib/axios";
import {
  IAttendanceOptions,
  IIncidentOwner,
  IMeta,
  ITicket,
  ITicketContract,
  ITicketDevice,
  ITicketEvid,
  ITicketSeverity,
  ITicketSite,
  ITicketStatus,
  ITicketUser,
  Response,
  TParams,
  TTicket,
} from "@/types";

export async function getTicketHistory(ticketId: string) {
  try {
    const response = await axios.get(`/ticket/${ticketId}/history`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch ticket history:", error);
    throw error;
  }
}

export async function getTicketDevice(
  params: TParams & {
    company_id_exact?: string[];
    user_id_exact?: string[];
    site_id_exact?: string[];
    order_by_desc?: string[];
  },
): Promise<Response<{ data: ITicketDevice[] }>> {
  try {
    const response = await axios.get("/device/", { params });
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

const CACHE_KEY = "ticket_list";

export async function getTicket(params: {
  per_page: number;
  page: number;
  order_by_desc: string[];
  user_id_exact?: string[];
  company_id_exact?: string[];
}): Promise<Response<{ data: ITicket[]; meta: IMeta }>> {
  // First page only: try cache first
  if (params.page <= 1) {
    try {
      const state = await NetInfo.fetch();
      if (!state.isConnected) {
        const cached = await readCache<Response<{ data: ITicket[]; meta: IMeta }>>(CACHE_KEY);
        if (cached) return cached;
      }
    } catch {
      // offline check failed, try live
    }
  }

  try {
    const response = await axios.get("/ticket/", { params });
    // Cache first page results
    if (params.page <= 1) {
      writeCache(CACHE_KEY, response.data, 60000);
    }
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getDataUser(
  params: TParams & { user_id_exact?: string[] },
): Promise<Response<{ data: ITicketUser[] }>> {
  try {
    const response = await axios.get("/users/", { params });

    return response.data;
  } catch (error: any) {
    // Role 'user' tidak memiliki izin 'user_read' di backend staging (403 Forbidden).
    // Kembalikan fallback list kosong agar layar pemanggil tidak crash / spinner abadi.
    if (error?.code === 403 || error?.response?.status === 403) {
      console.warn("[getDataUser] Akses user dibatasi (403), fallback ke list kosong:", error?.message);
      return { data: { data: [] } } as any;
    }
    console.error("getDataUser failed:", error);
    throw error;
  }
}

export async function getDataSite(
  params: TParams & { site_id_exact?: string[]; company_id_exact?: string[] },
): Promise<Response<{ data: ITicketSite[] }>> {
  try {
    const response = await axios.get("/site/", { params });

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getDataEvid(
  params: TParams & { evidence_group_id_exact?: string[] },
): Promise<Response<{ data: ITicketEvid[] }>> {
  try {
    const response = await axios.get("/evidence/", { params });

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getDataContract(
  params: TParams & { contract_id_exact?: string[] },
): Promise<Response<{ data: ITicketContract[] }>> {
  try {
    const response = await axios.get("/contract/", { params });

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getDataSeverity(
  params: TParams & { severity_id_exact?: string[] },
): Promise<Response<{ data: ITicketSeverity[] }>> {
  try {
    const response = await axios.get("/severity/", { params });

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getDataDevice(
  params: TParams & { device_id_exact?: string[] },
): Promise<Response<{ data: ITicketDevice[] }>> {
  try {
    const response = await axios.get("/device/", { params });

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
export async function getDataStatus(
  params: TParams & { status_id_exact?: string[]; company_id_exact?: string[] },
): Promise<Response<{ data: ITicketStatus[] }>> {
  try {
    const response = await axios.get("/status/", { params });

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

export async function createEvidGroupId(payload: {
  name: string;
  description: string;
}): Promise<Response<{ id: string }>> {
  try {
    const response = await axios.post("/evidence-group/", payload);

    return response.data;
  } catch (error) {
    console.error("createEvidGroupId failed:", error);
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

/**
 * HAPUS-LOKAL-TERUS-SUBMIT (vonis koordinator T-3 utk temuan M-02, 2026-09-19).
 *
 * `DELETE /evidence/` kini RequirePermission keluarga `*_delete`
 * (backend 07e210e + e817480, hidup di image prod 42cef67). Role `user`
 * lapangan tidak memegang satupun → 403. Loop submit lama mengikat error itu
 * ke SELURUH edit ticket ("Gagal edit ticket!" — regresi server-side di atas
 * klien yang tak berubah sejak initial commit).
 *
 * Kontrak helper: 403 DITOLERIR per-item (baris bukti tetap ada di server;
 * pemanggil WAJIB memakai `retained` untuk toast jujur), error lain
 * (500/network/dll) TETAP dilempar supaya submit gagal keras seperti semula —
 * jangan pernah sembunyikan insiden di balik toleransi ini.
 * Ini BUKAN kelas best-effort `/upload` (tmp): di sini baris DB bertahan dan
 * foto lama masih akan tampil saat tiket dimuat ulang — karena itu toast jujur
 * adalah bagian dari fix, bukan hiasan.
 */
export interface RemovedEvidenceOutcome {
  /** id yang berhasil diperintahkan terhapus ke server. */
  deleted: number;
  /** id yang ditolak 403 — masih tersimpan di server, masih akan tampil. */
  retained: number;
}

type RemovableImage = { id?: string | null } | null | undefined;

export async function deleteRemovedEvidence(
  images: RemovableImage[],
  del: (payload: { id: string }) => Promise<unknown> = deleteEvid,
): Promise<RemovedEvidenceOutcome> {
  let deleted = 0;
  let retained = 0;
  for (const img of images) {
    const id = img?.id;
    if (!id) continue;
    try {
      await del({ id });
      deleted++;
    } catch (err) {
      const code = (err as { code?: number } | undefined)?.code;
      if (code === 403) {
        console.warn(
          "deleteRemovedEvidence: server menolak hapus bukti (403) — baris tetap ada, user tanpa *_delete",
          id,
        );
        retained++;
        continue;
      }
      throw err;
    }
  }
  return { deleted, retained };
}

export async function getEvid(payload: { file_exact: string }): Promise<
  Response<
    {
      path: string;
      link: string;
    }[]
  >
> {
  try {
    const response = await axios.get("/evidence/", { params: payload });

    return response.data;
  } catch (error) {
    console.error("delete failed:", error);
    throw error;
  }
}

export async function uploadEvidtmp(file: File): Promise<
  Response<
    {
      path: string;
      link: string;
    }[]
  >
> {
  try {
    const formData = new FormData();
    formData.append("files", file);

    const response = await axios.post("/ticket/upload", formData, {
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
    const response = await axios.delete("/ticket/upload", { data: payload });

    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
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
    const response = await axios.post("/ticket/upload-permanent", payload);

    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

export async function getActiveCheckins(): Promise<
  Response<{ data: IAttendanceOptions[] }> | IAttendanceOptions[]
> {
  try {
    const response = await axios.get("/api/v2/attendance/active-checkins");
    // Backend wraps in { code, message, data: [...] } via response.ok()
    const payload = response.data;
    return payload?.data ?? payload;
  } catch (error) {
    console.error("Failed to fetch active checkins:", error);
    throw error;
  }
}

export async function getAttendanceOption(
  params: TParams & {
    company_id_exact?: string[];
    user_id_exact?: string[];
    order_by_desc?: string[];
  },
): Promise<Response<{ data: IAttendanceOptions[] }>> {
  try {
    const response = await axios.get("/api/v2/attendance/", { params });
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function createTicket(payload: TTicket) {
  try {
    const response = await axios.post("/ticket/", payload);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function updateTicket(
  payload: TTicket & { id: string; end_ticket: string },
) {
  try {
    const response = await axios.put("/ticket/", payload);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getDataIncidentOwner(
  params: TParams,
): Promise<Response<{ data: IIncidentOwner[] }>> {
  try {
    const response = await axios.get("/incident-owner/", { params });
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
