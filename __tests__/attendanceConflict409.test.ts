jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(),
}));

import { handleHttpError } from "../utils/handle-request";
import {
  getQueue,
  queueOfflineCheckIn,
  syncQueuedRequests,
  getFailedAttendance,
  clearFailedAttendance,
} from "../lib/offlineQueue";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../lib/axios";

// Mock dependencies
jest.mock("../lib/storage", () => ({
  removeToken: jest.fn().mockResolvedValue(undefined),
  removeCheckInId: jest.fn().mockResolvedValue(undefined),
  removeVersionCode: jest.fn().mockResolvedValue(undefined),
  saveCheckInId: jest.fn().mockResolvedValue(undefined),
  getToken: jest.fn().mockResolvedValue("test-token"),
  saveToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
  },
}));

jest.mock("../stores/auth", () => ({
  useAuthStore: {
    getState: () => ({
      logout: jest.fn(),
      setUser: jest.fn(),
    }),
  },
}));

jest.mock("../lib/axios", () => {
  const originalAxios = jest.requireActual("axios");
  const instance = originalAxios.create();
  instance.post = jest.fn();
  instance.put = jest.fn();
  return instance;
});

describe("HTTP 409 Conflict & Operational Day Handling Test Suite", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await clearFailedAttendance();
  });

  describe("handleHttpError - HTTP 409 Conflict", () => {
    it("preserves backend canonical 409 operational day duplicate message", async () => {
      const canonicalMsg =
        "Presensi untuk Hari Operasional ini sudah terdaftar (batas cut-off pukul 04:00 WIB). Gunakan data yang sudah ada atau tunggu hingga hari operasional berikutnya.";

      const axiosError = {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            code: 409,
            status: false,
            message: canonicalMsg,
          },
        },
      };

      const result = await handleHttpError(axiosError);
      expect(result.code).toBe(409);
      expect(result.title).toBe("Presensi Sudah Terdaftar");
      expect(result.message).toBe(canonicalMsg);
    });

    it("sanitizes raw PostgreSQL duplicate key constraint violation to friendly mobile copy", async () => {
      const rawPostgresError = {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            code: 409,
            message:
              'duplicate key value violates unique constraint "uq_attendance_user_checkin_date"',
          },
        },
      };

      const result = await handleHttpError(rawPostgresError);
      expect(result.code).toBe(409);
      expect(result.title).toBe("Presensi Sudah Terdaftar");
      expect(result.message).toBe(
        "Presensi Anda pada Hari Operasional ini sudah terdaftar (cut-off pukul 04:00 WIB). Periksa status dinas di Beranda atau hubungi pengawas jika memerlukan koreksi."
      );
    });

    it("provides fallback friendly message when 409 response has generic or missing message", async () => {
      const generic409 = {
        isAxiosError: true,
        response: {
          status: 409,
          data: {},
        },
      };

      const result = await handleHttpError(generic409);
      expect(result.code).toBe(409);
      expect(result.title).toBe("Presensi Sudah Terdaftar");
      expect(result.message).toBe(
        "Presensi Anda pada Hari Operasional ini sudah terdaftar (cut-off pukul 04:00 WIB). Periksa status dinas di Beranda atau hubungi pengawas jika memerlukan koreksi."
      );
    });

    it("does not clear auth storage or trigger logout on 409 conflict", async () => {
      const { removeToken } = require("../lib/storage");
      const { router } = require("expo-router");

      const axiosError = {
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: "Conflict" },
        },
      };

      await handleHttpError(axiosError);
      expect(removeToken).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });
  });

  describe("Offline Queue - HTTP 409 Non-Retryable Behavior", () => {
    it("drops 409 Conflict from retry queue and moves to failed attendance to prevent infinite loop retry", async () => {
      // 1. Enqueue an offline check-in
      await queueOfflineCheckIn({
        user_id: "user-123",
        user_name: "Teknisi Lapangan",
        company_id: "company-1",
        site_id: "site-1",
        checkin: "2026-09-11 02:30:00",
        checkin_latitude: -6.175,
        checkin_longitude: 106.827,
        attendance_status_id: "ATST001",
        localImages: [],
      });

      const queueBefore = await getQueue();
      expect(queueBefore.length).toBe(1);

      // 2. Mock API: evidence-group succeeds, create attendance returns HTTP 409 Conflict
      (apiClient.post as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/evidence-group/")) {
          return Promise.resolve({ data: { data: { id: "group-1" } } });
        }
        if (url.includes("/api/v2/attendance/")) {
          return Promise.reject({
            code: 409,
            status: 409,
            message:
              "Presensi untuk Hari Operasional ini sudah terdaftar (batas cut-off pukul 04:00 WIB).",
          });
        }
        return Promise.resolve({ data: {} });
      });

      // 3. Trigger sync
      const synced = await syncQueuedRequests();
      expect(synced).toBe(0);

      // 4. Verify request was NOT kept in retry queue (preventing loop retry storm)
      const queueAfter = await getQueue();
      expect(queueAfter.length).toBe(0);

      // 5. Verify request was recorded in failed attendance with explanation
      const failed = await getFailedAttendance();
      expect(failed.length).toBe(1);
      expect(failed[0].errorCode).toBe(409);
      expect(failed[0].errorMessage).toContain("Hari Operasional");
    });
  });
});
