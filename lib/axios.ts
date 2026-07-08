import { handleHttpError } from "@/utils/handle-request";
import axios from "axios";
import { getToken, saveToken, removeToken } from "./storage";

const API = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attach token
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

// Response interceptor — auto-refresh on 401
API.interceptors.response.use(
  async (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh once, and skip for auth endpoints
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/')
    ) {
      originalRequest._retry = true;
      try {
        const refreshRes = await API.post('/auth/refresh');
        const newToken = refreshRes.data?.data?.token || refreshRes.data?.token;
        if (newToken) {
          await saveToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return API(originalRequest);
        }
      } catch {
        // Refresh failed — clear auth
        await removeToken();
      }
    }

    const err = await handleHttpError(error);
    return Promise.reject(err);
  }
);

export default API;
