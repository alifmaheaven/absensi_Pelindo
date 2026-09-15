jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(),
}));
const calls: any[] = [];
jest.mock("../../lib/axios", () => {
  const instance: any = jest.fn((cfg: any) => { calls.push({ via: "call", cfg }); return Promise.resolve({ data: {} }); });
  instance.post = jest.fn((url: string, data: any) => { calls.push({ via: "post", url, data }); return Promise.resolve({ data: { data: { id: "att-1" } } }); });
  instance.put = jest.fn((url: string, data: any, cfg: any) => { calls.push({ via: "put", url, data, cfg }); return Promise.resolve({ data: {} }); });
  return instance;
});
jest.mock("../../lib/storage", () => ({ saveCheckInId: jest.fn().mockResolvedValue(undefined) }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { queueOfflineCheckIn, getQueue, syncQueuedRequests } from "../../lib/offlineQueue";

const ONLINE_CHECKIN_PAYLOAD = {
  user_id: "u1",
  company_id: "c1",
  site_id: "s1",
  name: "attendance",
  description: "[Check In]: -",
  code: "CHK-1757900000000",
  checkin: "2026-09-15 08:00:00",
  attendance_status_id: "ATST001",
  longitude: 106.8,
  latitude: -6.1,
};

it("PROBE A: offline checkin sync payload vs online createAttendance payload", async () => {
  await queueOfflineCheckIn({
    user_id: "u1", user_name: "T", company_id: "c1", site_id: "s1",
    checkin: "2026-09-15 08:00:00",
    checkin_latitude: -6.1, checkin_longitude: 106.8,
    attendance_status_id: "ATST001", description: "[Check In]: -",
    localImages: [], tolerance: 50,
  });
  calls.length = 0;
  await syncQueuedRequests();
  const createCall = calls.find((c) => c.via === "post" && c.url === "/api/v2/attendance/");
  console.log("OFFLINE_SYNC_BODY=" + JSON.stringify(createCall?.data));
  console.log("ONLINE_BODY      =" + JSON.stringify(ONLINE_CHECKIN_PAYLOAD));
  const offKeys = Object.keys(createCall?.data ?? {}).sort();
  const onKeys = Object.keys(ONLINE_CHECKIN_PAYLOAD).sort();
  console.log("OFFLINE_KEYS=" + JSON.stringify(offKeys));
  console.log("ONLINE_KEYS =" + JSON.stringify(onKeys));
  console.log("MISSING_IN_OFFLINE=" + JSON.stringify(onKeys.filter((k) => !offKeys.includes(k))));
});

it("PROBE B: queue is NOT cleared by clearCache-style logout (key prefix check)", async () => {
  await AsyncStorage.clear();
  await queueOfflineCheckIn({
    user_id: "u2", user_name: "T2", company_id: null, site_id: "s2",
    checkin: "2026-09-15 09:00:00",
    checkin_latitude: -6.1, checkin_longitude: 106.8,
    attendance_status_id: "ATST001", localImages: [], tolerance: 50,
  });
  const keysBefore = await AsyncStorage.getAllKeys();
  console.log("ALL_KEYS_BEFORE=" + JSON.stringify(keysBefore));
  // emulate lib/cache.ts clearCache(): removes only keys starting with '@cache_'
  const cacheKeys = keysBefore.filter((k) => k.startsWith("@cache_"));
  await AsyncStorage.multiRemove(cacheKeys);
  const remaining = await getQueue();
  console.log("QUEUE_LENGTH_AFTER_CLEARCACHE=" + remaining.length);
  console.log("QUEUE_SURVIVES_LOGOUT=" + (remaining.length > 0));
});
