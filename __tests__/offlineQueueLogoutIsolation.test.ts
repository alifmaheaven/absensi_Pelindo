/**
 * MOB-02 (CRITICAL) — the offline queue must never submit one user's check-in
 * under another user's token.
 *
 * Port technicians share devices. Attendance is a payroll/disciplinary record,
 * so a queued check-in landing on the wrong person's record is a data-integrity
 * failure with real consequences.
 *
 * The scenarios here are written against the *behaviour the product needs*, not
 * against the implementation, so they fail on the pre-fix code (a274e69):
 *
 *   OLD code — queue items carry no owner, `syncQueuedRequests()` posts whatever
 *   is in `@offline_queue` with the current bearer token, and `logout()` never
 *   touches the queue. Scenario 1 therefore observed A's `user_id` arriving in a
 *   request authorised by B's token.
 *
 * LIMITS: no device and no simulator. These are Jest-level assertions with a
 * mocked transport (`lib/axios`, `lib/storage`). They prove what the client
 * *sends* and what it *keeps*; they do not prove device runtime behaviour, real
 * AsyncStorage persistence across process restarts, or what a live backend does
 * with the body.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(),
}));

jest.mock("../lib/axios", () => {
  const originalAxios = jest.requireActual("axios");
  const instance = originalAxios.create();
  instance.post = jest.fn();
  instance.put = jest.fn();
  instance.get = jest.fn();
  return instance;
});

// `getToken` is the module-level token read; it is what the request interceptor
// in lib/axios.ts uses to build `Authorization: Bearer <token>`. Modelling it as
// a single mutable variable lets a scenario switch "who is logged in".
let mockToken: string | null = null;

jest.mock("../lib/storage", () => ({
  getToken: jest.fn(async () => mockToken),
  saveToken: jest.fn(async (t: string) => {
    mockToken = t;
  }),
  removeToken: jest.fn(async () => {
    mockToken = null;
  }),
  saveCheckInId: jest.fn().mockResolvedValue(undefined),
  getCheckInId: jest.fn().mockResolvedValue(null),
  removeCheckInId: jest.fn().mockResolvedValue(undefined),
  saveVersionCode: jest.fn().mockResolvedValue(undefined),
  getVersionCode: jest.fn().mockResolvedValue(null),
  removeVersionCode: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../lib/axios";
import { removeToken } from "../lib/storage";
import { useAuthStore } from "../stores/auth";
import {
  getQueue,
  queueOfflineCheckIn,
  syncQueuedRequests,
  getFailedAttendance,
  getPendingCount,
  isActionEligibleFor,
  resolveCurrentUserId,
  type OfflineAction,
  type OfflineCheckInPayload,
} from "../lib/offlineQueue";

const OFFLINE_QUEUE_KEY = "@offline_queue";

/**
 * Node's `Buffer` is not in scope for TypeScript here: `tsconfig.json` pins
 * `types: ["jest"]`, so `@types/node` is deliberately absent. Declaring the single
 * symbol this test helper needs keeps `npx tsc --noEmit` clean without widening the
 * project's global type surface (or adding a dependency) for a test-only helper.
 */
declare const Buffer: {
  from(input: string, encoding: string): { toString(encoding: string): string };
};

/** Build an unsigned JWT whose payload decodes to `{ id }`. */
function makeToken(userId: string): string {
  const b64url = (value: object) =>
    Buffer.from(JSON.stringify(value), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ id: userId, role: "user" })}.sig`;
}

function checkInPayload(userId: string, overrides: Partial<OfflineCheckInPayload> = {}): OfflineCheckInPayload {
  return {
    user_id: userId,
    user_name: `Teknisi ${userId}`,
    company_id: "company-1",
    site_id: "site-1",
    checkin: "2026-09-15 02:30:00",
    checkin_latitude: -6.175,
    checkin_longitude: 106.827,
    attendance_status_id: "ATST001",
    localImages: [],
    ...overrides,
  };
}

/** Capture the bodies POSTed to the attendance create endpoint. */
function captureAttendanceBodies(): Array<Record<string, any>> {
  const bodies: Array<Record<string, any>> = [];
  (apiClient.post as jest.Mock).mockImplementation((url: string, body?: any) => {
    if (url.includes("/evidence-group/")) {
      return Promise.resolve({ data: { data: { id: "group-1" } } });
    }
    if (url.includes("/api/v2/attendance/")) {
      bodies.push(body);
      return Promise.resolve({ data: { data: { id: `att-${bodies.length}` } } });
    }
    return Promise.resolve({ data: {} });
  });
  return bodies;
}

/** Raw read of the queue, bypassing the owner-filtered accessors. */
async function readRawQueue(): Promise<OfflineAction[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

describe("MOB-02 — offline queue must not cross user identity boundaries", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockToken = null;
    useAuthStore.setState({ user: null });
  });

  // ---------------------------------------------------------------------
  // 1. The headline defect.
  // ---------------------------------------------------------------------
  describe("cross-user sync after logout (the reproduced bug)", () => {
    it("never submits user A's queued check-in while user B's token is active", async () => {
      // --- User A checks in offline -------------------------------------
      mockToken = makeToken("user-A");
      const payloadA = checkInPayload("user-A", { description: "A shift pagi" });
      await queueOfflineCheckIn(payloadA);

      expect(await getQueue()).toHaveLength(1);

      // --- A logs out ----------------------------------------------------
      // `logout()` must NOT delete the queue: A's evidence is legitimate work
      // data and deleting it would lose a payroll record.
      useAuthStore.getState().logout();
      await removeToken();
      useAuthStore.setState({ user: null });

      const queueAfterLogout = await getQueue();
      expect(queueAfterLogout).toHaveLength(1);

      // --- User B logs in and syncs --------------------------------------
      mockToken = makeToken("user-B");
      useAuthStore.setState({ user: { id: "user-B" } as any });

      const bodies = captureAttendanceBodies();
      await syncQueuedRequests();

      // THE ASSERTION THAT MATTERS: nothing belonging to A may be sent.
      const submittedForA = bodies.filter((b) => b?.user_id === "user-A");
      expect(submittedForA).toHaveLength(0);

      // ...and A's item must still be intact and waiting on the device.
      const queueAfterBSync = await getQueue();
      expect(queueAfterBSync).toHaveLength(1);
      expect((queueAfterBSync[0].data as OfflineCheckInPayload).user_id).toBe("user-A");
    });

    it("submits the preserved item normally once its rightful owner logs back in", async () => {
      mockToken = makeToken("user-A");
      await queueOfflineCheckIn(checkInPayload("user-A"));

      useAuthStore.getState().logout();
      await removeToken();

      // B logs in and syncs — must be a no-op for A's item.
      mockToken = makeToken("user-B");
      useAuthStore.setState({ user: { id: "user-B" } as any });
      captureAttendanceBodies();
      expect((await syncQueuedRequests()).synced).toBe(0);

      // A returns to the device.
      mockToken = makeToken("user-A");
      useAuthStore.setState({ user: { id: "user-A" } as any });

      const bodies = captureAttendanceBodies();
      const { synced } = await syncQueuedRequests();

      expect(synced).toBe(1);
      expect(bodies).toHaveLength(1);
      expect(bodies[0].user_id).toBe("user-A");
      expect(await getQueue()).toHaveLength(0);
    });

    it("does not let B see A's pending count or A's failed-attendance banner", async () => {
      mockToken = makeToken("user-A");
      await queueOfflineCheckIn(checkInPayload("user-A"));

      // A is the owner: the item is visible and countable.
      expect(await getPendingCount()).toBe(1);

      // B logs in: A's work is neither countable nor actionable for B.
      mockToken = makeToken("user-B");
      useAuthStore.setState({ user: { id: "user-B" } as any });
      expect(await getPendingCount()).toBe(0);

      void getFailedAttendance; // exercised in the dedicated failed-bucket suite
    });

    it("refuses to sync at all when there is no bearer token", async () => {
      mockToken = makeToken("user-A");
      await queueOfflineCheckIn(checkInPayload("user-A"));

      await removeToken();
      useAuthStore.setState({ user: null });

      const bodies = captureAttendanceBodies();
      expect((await syncQueuedRequests()).synced).toBe(0);
      expect(bodies).toHaveLength(0);
      expect(await getQueue()).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // 2. The ownership rule itself, as a pure function.
  // ---------------------------------------------------------------------
  describe("isActionEligibleFor — ownership rule", () => {
    const item = (over: Partial<OfflineAction>): OfflineAction => ({
      id: "x",
      type: "ATTENDANCE_CHECKIN",
      data: checkInPayload("user-A"),
      timestamp: Date.now(),
      ...over,
    });

    it("allows an item stamped for the current user", () => {
      expect(isActionEligibleFor(item({ owner_user_id: "user-A" }), "user-A")).toBe(true);
    });

    it("rejects an item stamped for a different user", () => {
      expect(isActionEligibleFor(item({ owner_user_id: "user-A" }), "user-B")).toBe(false);
    });

    it("rejects an unstamped legacy item whose payload belongs to a different user", () => {
      expect(isActionEligibleFor(item({}), "user-B")).toBe(false);
    });

    it("allows an unstamped legacy item whose payload matches the current user", () => {
      expect(isActionEligibleFor(item({}), "user-A")).toBe(true);
    });

    it("fails closed for a stamped item when the session identity is unknown", () => {
      // A token exists but its subject cannot be read: we must not guess, or we
      // would re-open exactly the confused-identity write we are closing.
      expect(isActionEligibleFor(item({ owner_user_id: "user-A" }), null)).toBe(false);
    });

    it("keeps a legacy item recoverable when the session identity is unknown", () => {
      // The only path that lets an already-queued pre-1.0.30 item ever sync
      // after an upgrade onto a device with an unreadable token.
      expect(isActionEligibleFor(item({}), null)).toBe(true);
    });

    it("checks check-out items by stamp only (their payload has no user_id)", () => {
      const checkout: OfflineAction = {
        id: "y",
        type: "ATTENDANCE_CHECKOUT",
        data: {
          attendance_id: "att-1",
          user_name: "A",
          checkout: "2026-09-15 10:00:00",
          localImages: [],
        },
        timestamp: Date.now(),
      };
      expect(isActionEligibleFor(checkout, "user-A")).toBe(true);
      expect(isActionEligibleFor({ ...checkout, owner_user_id: "user-A" }, "user-B")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // 3. Stamping on write.
  // ---------------------------------------------------------------------
  describe("queue time ownership stamping", () => {
    it("stamps a queued check-in with the authenticated user", async () => {
      mockToken = makeToken("user-A");
      await queueOfflineCheckIn(checkInPayload("user-A"));

      const [action] = await readRawQueue();
      expect(action.owner_user_id).toBe("user-A");
    });

    it("stamps from the token subject, which is what the server attributes to", async () => {
      mockToken = makeToken("token-user");
      // A store that disagrees with the token must not win: the server reads
      // `req.auth_data.id` from the token, not from the client's store.
      useAuthStore.setState({ user: { id: "store-user" } as any });

      expect(await resolveCurrentUserId()).toBe("token-user");
    });

    it("falls back to the auth store when no token is readable", async () => {
      mockToken = null;
      useAuthStore.setState({ user: { id: "store-user" } as any });
      expect(await resolveCurrentUserId()).toBe("store-user");
    });

    it("resolves no identity from a malformed token", async () => {
      mockToken = "not-a-jwt";
      useAuthStore.setState({ user: null });
      expect(await resolveCurrentUserId()).toBeNull();
    });

    it("stamps all three queue kinds (check-in, check-out, standard request)", async () => {
      mockToken = makeToken("user-A");

      await queueOfflineCheckIn(checkInPayload("user-A"));
      const { queueOfflineCheckOut, queueRequest } = require("../lib/offlineQueue");
      await queueOfflineCheckOut({
        attendance_id: "att-1",
        user_name: "A",
        checkout: "2026-09-15 10:00:00",
        localImages: [],
      });
      await queueRequest("/api/v2/somewhere/", "POST", { a: 1 });

      const stored = await readRawQueue();
      expect(stored).toHaveLength(3);
      expect(stored.map((a) => a.owner_user_id)).toEqual(["user-A", "user-A", "user-A"]);
    });
  });

  // ---------------------------------------------------------------------
  // 4. Failed-attendance bucket ownership.
  // ---------------------------------------------------------------------
  describe("failed-attendance bucket is owner-scoped", () => {
    it("records the owner on a quarantined item and hides it from another user", async () => {
      mockToken = makeToken("user-A");
      await queueOfflineCheckIn(checkInPayload("user-A"));

      (apiClient.post as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/evidence-group/")) {
          return Promise.resolve({ data: { data: { id: "group-1" } } });
        }
        if (url.includes("/api/v2/attendance/")) {
          return Promise.reject({ code: 409, status: 409, message: "Conflict" });
        }
        return Promise.resolve({ data: {} });
      });

      await syncQueuedRequests();

      expect(await getFailedAttendance()).toHaveLength(1);

      // B must not inherit A's red "lapor atasan" banner.
      mockToken = makeToken("user-B");
      useAuthStore.setState({ user: { id: "user-B" } as any });
      expect(await getFailedAttendance()).toHaveLength(0);

      // ...and A still sees it.
      mockToken = makeToken("user-A");
      useAuthStore.setState({ user: { id: "user-A" } as any });
      expect(await getFailedAttendance()).toHaveLength(1);
    });

    it("does not drop another user's failed evidence when appending", async () => {
      // Regression guard: `saveFailedAttendance` must append to the RAW bucket.
      // Reading through the owner-filtered getter would silently delete A's
      // abandoned evidence the first time B quarantines an item of their own.
      const { saveFailedAttendance } = require("../lib/offlineQueue");

      await saveFailedAttendance({
        id: "a-1",
        type: "ATTENDANCE_CHECKIN",
        data: checkInPayload("user-A"),
        timestamp: Date.now(),
        failedAt: Date.now(),
        errorCode: 409,
        errorMessage: "A conflict",
        owner_user_id: "user-A",
      });

      mockToken = makeToken("user-B");
      useAuthStore.setState({ user: { id: "user-B" } as any });
      await saveFailedAttendance({
        id: "b-1",
        type: "ATTENDANCE_CHECKIN",
        data: checkInPayload("user-B"),
        timestamp: Date.now(),
        failedAt: Date.now(),
        errorCode: 409,
        errorMessage: "B conflict",
        owner_user_id: "user-B",
      });

      const raw = JSON.parse((await AsyncStorage.getItem("@failed_attendance_queue")) || "[]");
      expect(raw).toHaveLength(2);
      expect(raw.map((i: any) => i.owner_user_id).sort()).toEqual(["user-A", "user-B"]);
    });
  });

  // ---------------------------------------------------------------------
  // 5. Backward compatibility with the deployed 1.0.29 queue.
  // ---------------------------------------------------------------------
  describe("backward compatibility with queues written by app <= 1.0.29", () => {
    /** Exactly the record shape 1.0.29 wrote: no `owner_user_id` field. */
    async function seedLegacyQueue(items: Array<Record<string, any>>) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
    }

    const legacyCheckIn = (userId: string, id = "checkin_legacy") => ({
      id,
      type: "ATTENDANCE_CHECKIN",
      data: checkInPayload(userId),
      timestamp: Date.now(),
    });

    it("still deserialises a legacy record whose shape predates the owner field", async () => {
      await seedLegacyQueue([legacyCheckIn("user-A")]);

      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].owner_user_id).toBeUndefined();
      expect((queue[0].data as OfflineCheckInPayload).checkin_latitude).toBe(-6.175);
    });

    it("adopts a legacy check-in for its payload user, not for whoever is logged in", async () => {
      // A queued an item on 1.0.29, upgraded, and B is now signed in.
      await seedLegacyQueue([legacyCheckIn("user-A")]);

      mockToken = makeToken("user-B");
      useAuthStore.setState({ user: { id: "user-B" } as any });

      const bodies = captureAttendanceBodies();
      expect((await syncQueuedRequests()).synced).toBe(0);
      expect(bodies).toHaveLength(0);

      // The migration must have recorded A as the owner, so the item survives
      // for A rather than being orphaned or reassigned.
      const stored = await readRawQueue();
      expect(stored).toHaveLength(1);
      expect(stored[0].owner_user_id).toBe("user-A");
    });

    it("syncs a legacy check-in normally when its owner is signed in", async () => {
      await seedLegacyQueue([legacyCheckIn("user-A")]);

      mockToken = makeToken("user-A");
      useAuthStore.setState({ user: { id: "user-A" } as any });

      const bodies = captureAttendanceBodies();
      expect((await syncQueuedRequests()).synced).toBe(1);
      expect(bodies[0].user_id).toBe("user-A");
      expect(bodies[0].latitude).toBe(-6.175); // MOB-01 fix from a274e69 preserved
      expect(bodies[0].longitude).toBe(106.827);
      expect(await getQueue()).toHaveLength(0);
    });

    it("never rewrites a legacy record into a different storage key", async () => {
      await seedLegacyQueue([legacyCheckIn("user-A")]);
      mockToken = makeToken("user-A");
      await syncQueuedRequests();

      // Nothing new may appear in the storage layer.
      const keys = await AsyncStorage.getAllKeys();
      expect(keys.filter((k) => k.includes("offline"))).toEqual([OFFLINE_QUEUE_KEY]);
    });

    it("keeps a legacy check-out recoverable by the device's last authenticated user", async () => {
      // A check-out payload carries no user id at all, so the only identity
      // available is the one in the stored token.
      await seedLegacyQueue([
        {
          id: "checkout_legacy",
          type: "ATTENDANCE_CHECKOUT",
          data: {
            attendance_id: "att-1",
            user_name: "A",
            checkout: "2026-09-15 10:00:00",
            localImages: [],
          },
          timestamp: Date.now(),
        },
      ]);

      mockToken = makeToken("user-A");
      useAuthStore.setState({ user: { id: "user-A" } as any });
      (apiClient.put as jest.Mock).mockResolvedValue({ data: { data: {} } });

      expect((await syncQueuedRequests()).synced).toBe(1);
      expect(apiClient.put).toHaveBeenCalledTimes(1);
      expect(await getQueue()).toHaveLength(0);
    });

    it("leaves a legacy item unstamped rather than unsubmittable when no identity is known", async () => {
      await seedLegacyQueue([legacyCheckIn("user-A")]);
      mockToken = null;
      useAuthStore.setState({ user: null });

      // With no token there is nothing to authorise the request; the queue must
      // be left exactly as it was, not stamped into a dead end.
      expect(await queueIsUntouched()).toBe(true);
    });

    async function queueIsUntouched() {
      const before = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      await syncQueuedRequests();
      const after = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      return before === after;
    }
  });

  // ---------------------------------------------------------------------
  // 6. Regression guards on the happy path (no behaviour lost).
  // ---------------------------------------------------------------------
  describe("normal single-user sync still works", () => {
    it("syncs a stamped check-in for the signed-in user and clears the queue", async () => {
      mockToken = makeToken("user-A");
      useAuthStore.setState({ user: { id: "user-A" } as any });

      await queueOfflineCheckIn(checkInPayload("user-A"));
      const bodies = captureAttendanceBodies();

      expect((await syncQueuedRequests()).synced).toBe(1);
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({
        user_id: "user-A",
        site_id: "site-1",
        latitude: -6.175,
        longitude: 106.827,
      });
      expect(await getQueue()).toHaveLength(0);
      expect(await getPendingCount()).toBe(0);
    });
  });
});
