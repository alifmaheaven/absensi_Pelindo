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
import { queueOfflineCheckOut, syncQueuedRequests } from "../../lib/offlineQueue";
it("PROBE: offline checkout sync payload", async () => {
  await queueOfflineCheckOut({ attendance_id: "att-1", user_name: "T", checkout: "2026-09-15 17:00:00", checkout_latitude: -6.1, checkout_longitude: 106.8, description: "x", localImages: [] });
  calls.length = 0;
  await syncQueuedRequests();
  console.log("CALLS:" + JSON.stringify(calls, null, 2));
});
