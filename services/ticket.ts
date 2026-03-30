import axios from "@/lib/axios";
import {
  IAttendanceOptions,
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

export async function getTicketDevice(
  params: TParams & {
    company_id_exact?: string[];
    user_id_exact?: string[];
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

export async function getTicket(params: {
  per_page: number;
  page: number;
  order_by_desc: string[];
  user_id_exact?: string[];
  company_id_exact?: string[];
}): Promise<Response<{ data: ITicket[]; meta: IMeta }>> {
  try {
    const response = await axios.get("/ticket/", { params });
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
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getDataSite(
  params: TParams & { site_id_exact?: string[] },
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

export async function getEvid(payload: { file_exact: string }): Promise<
  Response<
    {
      path: string;
      link: string;
    }[]
  >
> {
  try {
    const response = await axios.get("/evidence/", { data: payload });

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

export async function getAttendanceOption(
  params: TParams & {
    company_id_exact?: string[];
    user_id_exact?: string[];
    order_by_desc?: string[];
  },
): Promise<Response<{ data: IAttendanceOptions[] }>> {
  try {
    const response = await axios.get("/attendance/", { params });
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
