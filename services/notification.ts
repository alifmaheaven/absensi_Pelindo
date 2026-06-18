import { apiClient } from "@/lib/axios";

export async function getNotifications(page = 1, perPage = 20) {
  try {
    const response = await apiClient.get(
      `/notification?page=${page}&per_page=${perPage}`
    );
    return response.data;
  } catch (error: any) {
    throw error;
  }
}

export async function getUnreadCount() {
  try {
    const response = await apiClient.get("/notification/unread-count");
    return response.data;
  } catch (error: any) {
    throw error;
  }
}

export async function markAsRead(id: string) {
  try {
    const response = await apiClient.put("/notification/read", { id });
    return response.data;
  } catch (error: any) {
    throw error;
  }
}

export async function markAllAsRead() {
  try {
    const response = await apiClient.put("/notification/read-all");
    return response.data;
  } catch (error: any) {
    throw error;
  }
}
