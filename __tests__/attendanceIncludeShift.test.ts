jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

jest.mock("../lib/axios", () => ({
  get: jest.fn().mockResolvedValue({ data: { data: [], meta: {} } }),
}));

import apiClient from "../lib/axios";
import { getAttendanceList } from "../services/attendance";

describe("getAttendanceList", () => {
  it("sends the requested shift include to the attendance endpoint", async () => {
    await getAttendanceList({
      page: 1,
      per_page: 10,
      order_by_desc: ["created_at"],
      include: "shift",
    });

    expect(apiClient.get).toHaveBeenCalledWith("/api/v2/attendance/", {
      params: expect.objectContaining({ include: "shift" }),
    });
  });

  it("sends shift and site include when requested", async () => {
    await getAttendanceList({
      page: 1,
      per_page: 10,
      order_by_desc: ["created_at"],
      include: "shift,site",
    });

    expect(apiClient.get).toHaveBeenCalledWith("/api/v2/attendance/", {
      params: expect.objectContaining({ include: "shift,site" }),
    });
  });
});
