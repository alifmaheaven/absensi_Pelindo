export interface IGalleryFolder {
  id: string;
  user_id: string;
  name: string;
  share_token: string | null;
  photo_count: number;
  created_at: string;
  updated_at: string;
}

export interface IGalleryPhoto {
  id: string;
  folder_id: string;
  original_name: string;
  s3_key: string;
  url: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface IGalleryMeta {
  total: number;
  per_page: number;
  page: number;
  total_page: number;
}

export interface IGalleryFolderResponse {
  meta: IGalleryMeta;
  data: IGalleryFolder[];
}

export interface IGalleryPhotosResponse {
  folder: { id: string; name: string };
  meta: IGalleryMeta;
  data: IGalleryPhoto[];
}

export interface IGalleryShareResponse {
  folder_name: string;
  share_token: string;
  photos: IGalleryPhoto[];
}
