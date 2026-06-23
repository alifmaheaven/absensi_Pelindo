import { handleHttpError } from "@/utils/handle-request";
import axios from "axios";
import { getToken } from "./storage"; // helper untuk ambil token dari storage

// Augment Axios config to support an opt-out flag for response normalization.
declare module "axios" {
  export interface AxiosRequestConfig {
    raw?: boolean;
  }
  export interface InternalAxiosRequestConfig {
    raw?: boolean;
  }
}

const API = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL, // ganti dengan API kamu
  timeout: 30000, // 30 seconds
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor untuk menambahkan token secara otomatis
API.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  async (response) => {
    // Normalize nested .data.data.data pattern for paginated list responses
    if (
      response.data?.data?.data &&
      Array.isArray(response.data.data.data) &&
      !response.config?.raw
    ) {
      response.data = {
        data: response.data.data.data,
        meta: response.data.data.meta,
      };
    }

    return response;
  },
  async (error) => {
    const err = await handleHttpError(error);
    return Promise.reject(err);
  }
);

export default API;
