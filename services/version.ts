import { IVersion } from "@/types";
import API from "@/lib/axios";

export async function getLatestVersion(): Promise<IVersion | null> {
  try {
    const res = await API.get("/version/latest");
    return res.data?.data ?? null;
  } catch {
    return null;
  }
}
