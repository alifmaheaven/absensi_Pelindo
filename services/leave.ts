import axios from "@/lib/axios";

export interface ILeaveRequest {
  id: string;
  user_id: string;
  leave_date: string;
  end_date?: string;
  leave_type: string; // 'izin' | 'cuti'
  attendance_status_id: string;
  reason: string;
  status: string; // 'pending' | 'approved' | 'rejected'
  rejection_reason?: string;
  evidence_group_id?: string;
  created_at: string;
}

export interface ICreateLeavePayload {
  leave_date: string;
  end_date?: string;
  leave_type: "izin" | "cuti";
  attendance_status_id: string;
  reason: string;
  evidence_group_id?: string;
}

export async function getMyLeaves(params?: {
  page?: number;
  per_page?: number;
}): Promise<ILeaveRequest[]> {
  const res = await axios.get("/leave/", { params });
  return res.data?.data?.data ?? res.data?.data ?? [];
}

export async function createLeave(
  payload: ICreateLeavePayload,
): Promise<ILeaveRequest> {
  const res = await axios.post("/leave/", payload);
  return res.data?.data ?? res.data;
}

export async function deleteLeave(id: string): Promise<any> {
  const res = await axios.delete(`/leave/${id}`);
  return res.data?.data ?? res.data;
}

/** Re-submit pengajuan yang ditolak: upload ulang evidence, status kembali pending. */
export async function resubmitLeave(payload: {
  id: string;
  evidence_group_id?: string;
}): Promise<ILeaveRequest> {
  const res = await axios.put("/leave/resubmit", payload);
  return res.data?.data ?? res.data;
}

