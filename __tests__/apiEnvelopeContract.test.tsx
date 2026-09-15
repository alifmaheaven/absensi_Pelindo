/**
 * W2-MOBILE-B — API envelope (`{code, message, data}`) contract verification.
 *
 * Purpose
 * -------
 * AUDIT-QA-VERIFICATION.md §4a (QA-08 / QA-09 / QA-10) claims that three screens
 * read the response envelope "one level too shallow" and that the fix is to
 * change `.data.<field>` into `.data.data.<field>`. This file is the executable
 * check of that claim.
 *
 * It pins the contract that is actually true in this codebase:
 *
 *   `Mobile/lib/axios.ts`  ->  axios instance, no `transformResponse`.
 *   `axios.get(...)`       ->  AxiosResponse; `.data` is the parsed HTTP body.
 *   The backend wraps every success as `{code, message, data: <payload>}`
 *   (`backend/src/utils/response.ts` `ok()`), so the body IS the envelope.
 *   Every service in `Mobile/services/**` returns `response.data` = the body,
 *   therefore the payload lives at `serviceResult.data`.
 *
 * So a consumer must read `.data.<field>`. Reading `.data.data.<field>` is the
 * *double* unwrap and yields `undefined`.
 *
 * RED/GREEN meaning of this file: the "audit's proposed depth is wrong" tests
 * below FAIL if anyone applies the QA-08/09/10 recommendation verbatim, and the
 * screen tests FAIL on the audited (pre-"fix") code only if a regression is
 * introduced. Both directions are exercised in the wave report W2-MOBILE-B.md.
 *
 * These are the first tests that import an `app/**` screen: before this file,
 * `grep -rl "app/" __tests__/` returned nothing.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Native / infra mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => React.createElement(View, null, children),
    SafeAreaView: ({ children }: any) => React.createElement(View, null, children),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    initialWindowMetrics: {
      insets: inset,
      frame: { x: 0, y: 0, width: 390, height: 844 },
    },
  };
});

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// expo-router ships ESM (`standard-navigation`) that jest-expo does not
// transform, and `useFocusEffect` must actually run to drive screen fetches.
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "t1" }),
  useFocusEffect: (cb: any) => {
    const React = require("react");
    React.useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
  ToastProvider: ({ children }: any) => children,
  Toast: () => null,
}));

jest.mock("@/stores/auth", () => ({
  useAuthStore: Object.assign(
    (sel?: any) => {
      const state = {
        user: { id: "u1", company_id: "c1" },
        setUser: jest.fn(),
        logout: jest.fn(),
      };
      return sel ? sel(state) : state;
    },
    { getState: () => ({ user: { id: "u1", company_id: "c1" }, logout: jest.fn() }) },
  ),
}));

jest.mock("@/stores/ticket", () => ({
  useTicketStore: (sel?: any) => {
    const state = {
      ticket: { id: "t1", name: "T", company_id: "c1", status_id: "s1" },
    };
    return sel ? sel(state) : state;
  },
}));

jest.mock("@/hooks/useImagePicker", () => ({
  useImagePicker: () => ({
    images: [],
    loadingImage: false,
    isModalVisible: false,
    pickImage: jest.fn(),
    removeImage: jest.fn(),
    openModal: jest.fn(),
    closeModal: jest.fn(),
    setImages: jest.fn(),
  }),
}));

jest.mock("@/hooks/useImagePreview", () => ({
  // `PreviewModal` is a JSX *element* in the real hook, not a component.
  useImagePreview: () => ({ showPreview: jest.fn(), PreviewModal: null }),
}));

jest.mock("@/services/notification-scheduler", () => ({
  syncShiftNotifications: jest.fn(),
  requestNotificationPermissions: jest.fn().mockResolvedValue(true),
}));

// A single transport mock whose responses are shaped exactly like a real
// AxiosResponse: `.data` is the HTTP body, i.e. the `{code,message,data}` envelope.
const WEEK_SCHEDULES = [
  {
    date: "2026-09-16",
    day_name: "Rabu",
    has_schedule: true,
    is_today: false,
    shift: {
      id: "s1",
      code: "PAGI",
      name: "Shift Pagi",
      start_time: "08:00:00",
      end_time: "17:00:00",
      grace_late: 15,
      grace_early: 15,
      is_overnight: false,
      color: "#2563EB",
    },
  },
];

const TICKET_LOGS = [
  {
    id: "L1",
    action: "CREATE",
    user: { name: "Budi", email: "budi@example.test" },
    from_status: null,
    to_status: "Open",
    field_changes: null,
    note: null,
    created_at: "2026-09-15 08:00:00",
    comments: [],
  },
];

jest.mock("@/lib/axios", () => {
  const ok = (payload: unknown) => ({
    data: { code: 200, message: "ok", data: payload },
  });
  const paged = (rows: unknown[]) =>
    ok({ data: rows, meta: { page: 1, per_page: 100, total: rows.length, total_pages: 1 } });

  return {
    __esModule: true,
    default: {
      get: jest.fn((url: string) => {
        if (url === "/schedule/week") {
          return Promise.resolve(ok({ schedules: [
            {
              date: "2026-09-16",
              day_name: "Rabu",
              has_schedule: true,
              is_today: false,
              shift: {
                id: "s1",
                code: "PAGI",
                name: "Shift Pagi",
                start_time: "08:00:00",
                end_time: "17:00:00",
                grace_late: 15,
                grace_early: 15,
                is_overnight: false,
                color: "#2563EB",
              },
            },
          ] }));
        }
        if (url === "/schedule/today") {
          return Promise.resolve(ok({
            has_schedule: true,
            shift: null,
            status: "no_schedule",
            scheduled_start: null,
            scheduled_end: null,
            message: "",
            active_overnight_session: null,
          }));
        }
        if (url === "/ticket/t1/history") {
          return Promise.resolve(ok({ ticket_id: "t1", logs: TICKET_LOGS }));
        }
        if (url === "/device/") {
          // `pagination()` builds {meta,data:[...]} and `response.ok` wraps that once,
          // so the rows ARE three levels deep from the AxiosResponse.
          return Promise.resolve(ok({
            meta: { page: 1, per_page: 100, total: 1, total_pages: 1 },
            data: [{ id: "d1", name: "Server Rack A", code: "DEV-1", site_id: "site-1" }],
          }));
        }
        if (url === "/service/") {
          return Promise.resolve(ok({
            meta: { page: 1, per_page: 100, total: 1, total_pages: 1 },
            data: [{ id: "sv1", name: "Layanan Jaringan" }],
          }));
        }
        if (url === "/site/") {
          return Promise.resolve(ok({
            meta: { page: 1, per_page: 1, total: 1, total_pages: 1 },
            data: [{ id: "site-1", name: "Site 1", location_id: "loc-1" }],
          }));
        }
        if (url === "/api/v2/attendance/active-checkins") {
          // Backend returns a bare array here: `{code,message,data:[...]}`.
          return Promise.resolve(ok([]));
        }
        return Promise.resolve(paged([]));
      }),
      post: jest.fn().mockResolvedValue({ data: { code: 201, message: "created", data: {} } }),
      put: jest.fn().mockResolvedValue({ data: { code: 200, message: "ok", data: {} } }),
      delete: jest.fn().mockResolvedValue({ data: { code: 200, message: "ok", data: {} } }),
    },
  };
});

// jest runs these files through babel-jest in a Node environment, so `fs`,
// `path` and `__dirname` exist at runtime. They are declared locally instead of
// imported because `tsconfig.json` pins `types: ["jest"]` and pulling in
// `@types/node` would change the type surface of the whole app.
declare const __dirname: string;
declare function require(name: string): any;

type FsLike = {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: string): string;
  readdirSync(p: string, opts: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
type PathLike = {
  resolve(...p: string[]): string;
  join(...p: string[]): string;
  relative(a: string, b: string): string;
};

const fs: FsLike = require("fs");
const path: PathLike = require("path");

import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";

import { getTodaySchedule, getWeekSchedule } from "@/services/schedule";
import { getTicketHistory } from "@/services/ticket";
import { syncShiftNotifications } from "@/services/notification-scheduler";
import { Modal } from "react-native";
import DeviceDrawer from "@/components/ticketing/DeviceDrawer";
import JadwalScreen from "@/app/(tabs)/jadwal";
import TicketingEditScreen from "@/app/(no-tabs)/ticketing/[id]";
import HomeScreen from "@/app/(tabs)/index";

// ─────────────────────────────────────────────────────────────────────────────
// 1. The contract itself
// ─────────────────────────────────────────────────────────────────────────────

describe("Envelope contract: services return the HTTP body {code,message,data}", () => {
  it("getWeekSchedule() resolves to the envelope; payload is at .data (QA-09)", async () => {
    const res: any = await getWeekSchedule();

    // The envelope is present at the top level of the returned value.
    expect(res.code).toBe(200);
    expect(res.message).toBe("ok");

    // The payload is at `.data` — exactly where jadwal.tsx:40 and index.tsx:458 read it.
    expect(Array.isArray(res.data?.schedules)).toBe(true);
    expect(res.data.schedules).toHaveLength(1);
    expect(res.data.schedules[0].shift.name).toBe("Shift Pagi");

    // And there is NO second wrapper: the audit's proposed `.data.data.schedules` is undefined.
    expect(res.data.data).toBeUndefined();
  });

  it("getTicketHistory() resolves to the envelope; payload is at .data (QA-08)", async () => {
    const res: any = await getTicketHistory("t1");

    expect(res.code).toBe(200);
    // Exactly the expression at [id].tsx:287 and [id].tsx:367.
    expect(Array.isArray(res.data?.logs)).toBe(true);
    expect(res.data.logs).toHaveLength(1);
    expect(res.data.logs[0].action).toBe("CREATE");

    // The audit's proposed `.data.data.logs` is undefined.
    expect(res.data.data).toBeUndefined();
  });

  it("getTodaySchedule() resolves to the envelope; payload is at .data (index.tsx:453)", async () => {
    const res: any = await getTodaySchedule();
    expect(res.data?.has_schedule).toBe(true);
    expect(res.data.data).toBeUndefined();
  });

  it("regression guard: the audit's proposed extra unwrap would break all three", async () => {
    const week: any = await getWeekSchedule();
    const history: any = await getTicketHistory("t1");
    const today: any = await getTodaySchedule();

    // These are the values the audit told us to switch to. All three are undefined,
    // which is why the recommended change is a regression, not a fix.
    expect(week.data?.data?.schedules).toBeUndefined();
    expect(history.data?.data?.logs).toBeUndefined();
    expect(today.data?.data?.has_schedule).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The screens, end to end through the real service + real transport mock
// ─────────────────────────────────────────────────────────────────────────────

describe("QA-09 / Mobile/app/(tabs)/jadwal.tsx", () => {
  it("renders the shift returned by /schedule/week (first test for this screen)", async () => {
    const { queryByText } = render(<JadwalScreen />);

    // If the unwrap depth were wrong, the screen would fall back to `|| []`
    // and show the "Belum Ada Penugasan Shift" empty state instead.
    await waitFor(() => expect(queryByText("Shift Pagi")).toBeTruthy(), { timeout: 5000 });
    expect(queryByText("Belum Ada Penugasan Shift")).toBeNull();
  });
});

describe("QA-08 / Mobile/app/(no-tabs)/ticketing/[id].tsx", () => {
  it("renders the ticket history returned by /ticket/:id/history (first test for this screen)", async () => {
    const { queryByText } = render(<TicketingEditScreen />);

    await waitFor(() => expect(queryByText("Riwayat Tiket")).toBeTruthy(), { timeout: 5000 });
    // "Membuat tiket" is actionLabel.CREATE — it only exists when `history` is non-empty.
    await waitFor(() => expect(queryByText("Membuat tiket")).toBeTruthy(), { timeout: 5000 });
    expect(queryByText("Belum ada riwayat")).toBeNull();
  });
});

describe("QA-10 / Mobile/app/(tabs)/index.tsx", () => {
  it("reaches syncShiftNotifications with the schedule array (first test for this screen)", async () => {
    render(<HomeScreen />);

    await waitFor(
      () => expect((syncShiftNotifications as jest.Mock).mock.calls.length).toBeGreaterThan(0),
      { timeout: 5000 },
    );

    const arg = (syncShiftNotifications as jest.Mock).mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(1);
    expect(arg[0].shift.name).toBe("Shift Pagi");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Static sibling sweep (defect class, not a single call site)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sibling sweep: envelope unwrap depth across the mobile client", () => {
  const ROOT = path.resolve(__dirname, "..");
  const LANE_DIRS = ["app", "services", "hooks", "components", "lib", "stores"];

  function walk(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  const files = LANE_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

  it("every triple-deep `.data.data.data` read is classified against its real body shape", () => {
    // A triple-depth read is only correct when the payload is a WRAPPER carrying a
    // nested list — i.e. `{code,message,data:{meta,data:[...]}}`. That is what the
    // backend's `pagination()` helper builds (`backend/src/utils/pagination.ts:200-210`,
    // `Promise<{meta,data}>`), and it is a first-class documented idiom there
    // (`leaveControllers.ts:80` returns exactly that from its empty-company branch).
    //
    // THE DEPTH MUST BE DERIVED FROM THE ENDPOINT'S ACTUAL BODY, NOT PATTERN-MATCHED.
    // Verified against production with a real token (2026-09-15):
    //
    //   GET /api/v1/device/  -> data keys=['meta','data']  has data.data=True  len=2
    //   GET /api/v1/site/    -> data keys=['meta','data']  has data.data=True  len=0
    //   GET /api/v1/leave/   -> pagination(), same wrapper
    //
    // All three therefore CORRECTLY read `.data.data.data` (AxiosResponse -> body ->
    // {meta,data} -> rows). An earlier draft of this test asserted DeviceDrawer was a
    // defect; that was an artefact of a mock returning a bare array, and production
    // refuted it. The assertion below pins the classification so the next agent does
    // not "fix" correct code in either direction.
    const hits = files
      .filter((f) => /\.data\?\.data\?\.data/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f))
      .sort();

    // All legitimate: AxiosResponse -> body -> paginated wrapper -> row list.
    expect(hits).toEqual([
      "components/ticketing/DeviceDrawer.tsx",
      "services/leave.ts",
    ]);
  });

  it("DeviceDrawer renders devices from the paginated {meta,data} wrapper", async () => {
    // This is the counterpart guard to the three screen tests above. Dropping one
    // `.data` in DeviceDrawer (the "obvious" fix suggested by a shallow reading)
    // makes this FAIL, because the rows would then be read from the wrapper object.
    const { queryByText, UNSAFE_getByType } = render(
      <DeviceDrawer
        visible={true}
        onClose={jest.fn()}
        onSelect={jest.fn()}
        siteId="site-1"
        siteName="Site 1"
      />,
    );

    // Modal.onShow is what triggers the fetch on a real device; the test renderer
    // does not fire it, so drive it explicitly.
    await act(async () => {
      UNSAFE_getByType(Modal).props.onShow?.();
    });

    await waitFor(() => expect(queryByText("Server Rack A")).toBeTruthy(), { timeout: 5000 });
    expect(queryByText("Belum ada device")).toBeNull();
  });

  it("DeviceDrawer reads the paginated wrapper at the right depth (direct axios, not a service)", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/ticketing/DeviceDrawer.tsx"),
      "utf8",
    );
    // Direct axios.get() -> AxiosResponse.data = {code,message,data:{meta,data:[...]}}.
    expect(src).toContain("setDevices(res.data?.data?.data || []);");
    expect(src).toContain("res.data?.data?.data?.map(");
    expect(src).toContain("res.data?.data?.data?.[0]?.location_id");
    // The single-object write path is one level shallower, because crudService.create
    // returns `result.rows[0]` (a bare object), which response.ok wraps once.
    expect(src).toContain("const newDevice = res.data?.data;");
  });

  it("no service returns the bare AxiosResponse (that would invert the contract)", () => {
    const serviceFiles = walk(path.join(ROOT, "services"));
    const offenders: string[] = [];
    for (const f of serviceFiles) {
      const src = fs.readFileSync(f, "utf8");
      // `return response;` / `return res;` — the whole AxiosResponse, not the body.
      if (/return\s+(response|res|apiRes)\s*;/.test(src)) offenders.push(path.relative(ROOT, f));
    }
    expect(offenders).toEqual([]);
  });
});
