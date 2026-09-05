import apiClient from "@/lib/axios";

export async function getFolders(page = 1, perPage = 20) {
  const response = await apiClient.get(`/gallery/folder?page=${page}&per_page=${perPage}`);
  return response.data;
}

export async function createFolder(name: string) {
  const response = await apiClient.post("/gallery/folder", { name });
  return response.data;
}

export async function updateFolder(id: string, name: string) {
  const response = await apiClient.put(`/gallery/folder/${id}`, { name });
  return response.data;
}

export async function deleteFolder(id: string) {
  const response = await apiClient.delete(`/gallery/folder/${id}`);
  return response.data;
}

export async function getPhotos(folderId: string, page = 1, perPage = 100) {
  const response = await apiClient.get(`/gallery/folder/${folderId}/photos?page=${page}&per_page=${perPage}`);
  return response.data;
}

export async function uploadPhotos(
  folderId: string,
  files: { uri: string; name: string; type: string }[] | FormData,
  category?: string
) {
  let formData: FormData;
  if (files instanceof FormData) {
    formData = files;
  } else {
    formData = new FormData();
    files.forEach((file) => {
      formData.append("photos", file as any);
    });
    if (category) {
      formData.append("category", category);
    }
  }
  const response = await apiClient.post(`/gallery/folder/${folderId}/photo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function deletePhoto(photoId: string) {
  const response = await apiClient.delete(`/gallery/photo/${photoId}`);
  return response.data;
}

export async function bulkDeletePhotos(photoIds: string[]) {
  const response = await apiClient.post("/gallery/photo/bulk-delete", { ids: photoIds });
  return response.data;
}

export async function updatePhotoCategory(photoId: string, category: string) {
  const response = await apiClient.patch(`/gallery/photo/${photoId}/category`, { category });
  return response.data;
}

export async function generateShareToken(folderId: string) {
  const response = await apiClient.post(`/gallery/folder/${folderId}/share`);
  return response.data;
}

export async function getSharedFolder(token: string) {
  const response = await apiClient.get(`/gallery/share/${token}`);
  return response.data;
}
