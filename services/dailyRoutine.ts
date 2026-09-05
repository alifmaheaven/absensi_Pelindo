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
  try {
    const res = await axios.get("/daily-routine/today/all");
    return res.data;
  } catch (error: any) {
    // Fallback ke /daily-routine/today bila endpoint /today/all belum tersedia (404)
    if (error?.code === 404 || error?.response?.status === 404) {
      const fallbackRes = await axios.get("/daily-routine/today");
      const singleData: ITodayRoutineResponse = fallbackRes.data?.data;
      return {
        ...fallbackRes.data,
        data: {
          site_id: singleData?.routine?.site_id || "",
          routines: singleData?.routine ? [singleData] : [],
        },
      };
    }
    throw error;
  }
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
