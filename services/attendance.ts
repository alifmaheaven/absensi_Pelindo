import axios from "@/lib/axios";
import NetInfo from "@react-native-community/netinfo";
import { queueRequest } from "@/lib/offlineQueue";
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
    user_id_exact?: string[];
    id_exact?: string[];
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

export async function createAttendance(
  payload: TAttendance,
): Promise<Response<IAttendance>> {
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected || !state.isInternetReachable) {
      await queueRequest("/api/v2/attendance/", "POST", payload);
      return { data: payload as any } as Response<IAttendance>;
    }
    const response = await axios.post("/api/v2/attendance/", payload);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function updateAttendance(payload: {
  id: string;
  checkout: string;
  checkout_longitude?: number;
  checkout_latitude?: number;
  description?: string;
}) {
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected || !state.isInternetReachable) {
      await queueRequest("/api/v2/attendance/", "PUT", payload);
      return { data: payload } as any;
    }
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
