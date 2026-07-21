import axios from "@/lib/axios";

export interface ILeaveRequest {
  id: string;
  user_id: string;
  leave_date: string;
  leave_type: string; // 'izin' | 'cuti'
  attendance_status_id: string;
  reason: string;
  status: string; // 'pending' | 'approved' | 'rejected'
  rejection_reason?: string;
  created_at: string;
}

export async function getMyLeaves(params?: {
  page?: number;
  per_page?: number;
}): Promise<ILeaveRequest[]> {
  const res = await axios.get("/leave/", { params });
  return res.data?.data?.data ?? res.data?.data ?? [];
}
