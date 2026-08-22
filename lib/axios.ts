import { handleHttpError } from "@/utils/handle-request";
import axios from "axios";
import { getToken, saveToken } from "./storage";
import { router } from "expo-router";
import { useAuthStore } from "@/stores/auth";

const API = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attach token & route /api/v2/ requests to v2 baseURL
API.interceptors.request.use(
  async (config) => {
    if (config.url?.startsWith('/api/v2/')) {
      const rootUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/api\/v1\/?$/, '');
      config.baseURL = rootUrl;
    }
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Mutex refresh: bila banyak request paralel dapat 401 bersamaan, hanya satu
// /auth/refresh yang dijalankan; request lain menunggu promise yang sama lalu
// replay pakai token baru. Mencegah race N-refresh → logout tak terduga.
let refreshPromise: Promise<string | null> | null = null;

async function getRefreshedToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const refreshRes = await API.post('/auth/refresh');
      const newToken = refreshRes.data?.data?.token || refreshRes.data?.token;
      if (newToken) {
        await saveToken(newToken);
        return newToken;
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

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
        const newToken = await getRefreshedToken();
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return API(originalRequest);
        }
      } catch {
        // Refresh failed — token tidak valid → auto logout + redirect ke login.
        useAuthStore.getState().logout();
        router.replace("/auth");
      }
    }

    const err = await handleHttpError(error);
    return Promise.reject(err);
  }
);

export default API;
