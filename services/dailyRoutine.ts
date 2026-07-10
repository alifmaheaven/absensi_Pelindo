import axios from "@/lib/axios";
import { Response, ITodayRoutineResponse, IDailyRoutineLog, IDailyRoutine } from "@/types";

export async function getTodayRoutine(): Promise<Response<ITodayRoutineResponse>> {
  const res = await axios.get("/daily-routine/today");
  return res.data;
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
  items: { daily_routine_item_id: string; is_checked: boolean; evidence_file?: string; notes?: string }[]
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
