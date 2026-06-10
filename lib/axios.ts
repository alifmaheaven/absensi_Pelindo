import { handleHttpError } from "@/utils/handle-request";
import axios from "axios";
import { getToken } from "./storage"; // helper untuk ambil token dari storage

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
  async (response) => response,
  async (error) => {
    const err = await handleHttpError(error);
    return Promise.reject(err);
  }
);

export default API;
