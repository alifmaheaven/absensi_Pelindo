import {
  getDistanceInMeters,
  smartCapitalize,
  parseWIBDate,
  parseUTCDate,
  getAccessibleTextColor,
  calculateEarlyCheckoutStatus,
  getWIBDateString,
  getTodayDateString,
  formatHourMinute,
  resolveAttendanceSession,
  getOperationalDateWIB,
  getCompletedShiftBannerInfo,
  OPERATIONAL_DAY_CUTOFF_HOURS,
} from "../utils/utils";
import type { IAttendance, IScheduleToday } from "../types";

describe("Utils Pure Functions Test Suite", () => {
  describe("getDistanceInMeters (Haversine)", () => {
    it("returns 0 for identical coordinates", () => {
      const distance = getDistanceInMeters(-6.2, 106.8, -6.2, 106.8);
      expect(distance).toBe(0);
    });

    it("calculates known distance between Monas and Bundaran HI within tolerance", () => {
      // Monas Jakarta: -6.175392, 106.827153
      // Bundaran HI Jakarta: -6.195000, 106.823000
      // Known geodesic distance: ~2230 meters (±50m tolerance)
      const dist = getDistanceInMeters(
        -6.175392,
        106.827153,
        -6.195000,
        106.823000
      );
      expect(dist).toBeGreaterThan(2180);
      expect(dist).toBeLessThan(2280);
    });

    it("calculates 1 degree longitude distance on equator accurately (~111.195 km)", () => {
      const dist = getDistanceInMeters(0, 0, 0, 1);
      const expected = (2 * Math.PI * 6371000) / 360;
      expect(Math.abs(dist - expected)).toBeLessThan(1);
    });
  });

  describe("smartCapitalize", () => {
    it("capitalizes words correctly", () => {
      expect(smartCapitalize("budi santoso")).toBe("Budi Santoso");
      expect(smartCapitalize("JOHN DOE")).toBe("John Doe");
      expect(smartCapitalize("alif maheaven")).toBe("Alif Maheaven");
    });

    it("handles hyphens and spacing", () => {
      expect(smartCapitalize("andi-wijaya")).toBe("Andi-Wijaya");
      expect(smartCapitalize("  spasi   banyak  ")).toBe("  Spasi   Banyak  ");
    });

    it("handles empty or undefined input", () => {
      expect(smartCapitalize("")).toBe("");
      expect(smartCapitalize(undefined)).toBe("");
    });
  });

  describe("WIB and UTC Date Parsing", () => {
    it("parses WIB timestamp as UTC+7 correctly", () => {
      // 17:47:11 WIB corresponds to 10:47:11 UTC
      const date = parseWIBDate("2026-08-09 17:47:11");
      expect(date).not.toBeNull();
      if (date) {
        expect(date.getUTCFullYear()).toBe(2026);
        expect(date.getUTCMonth()).toBe(7); // August is month index 7
        expect(date.getUTCDate()).toBe(9);
        expect(date.getUTCHours()).toBe(10);
        expect(date.getUTCMinutes()).toBe(47);
        expect(date.getUTCSeconds()).toBe(11);
      }
    });

    it("parses UTC timestamp correctly", () => {
      const date = parseUTCDate("2026-08-09 10:47:12");
      expect(date).not.toBeNull();
      if (date) {
        expect(date.getUTCHours()).toBe(10);
        expect(date.getUTCMinutes()).toBe(47);
        expect(date.getUTCSeconds()).toBe(12);
      }
    });

    it("handles null, undefined, or invalid inputs safely", () => {
      expect(parseWIBDate(null)).toBeNull();
      expect(parseWIBDate(undefined)).toBeNull();
      expect(parseWIBDate("invalid-date-string")).toBeNull();
      expect(parseUTCDate(null)).toBeNull();
      expect(parseUTCDate(undefined)).toBeNull();
      expect(parseUTCDate("invalid-date-string")).toBeNull();
    });
  });

  describe("getAccessibleTextColor (WCAG AA)", () => {
    it("returns white text for dark backgrounds", () => {
      expect(getAccessibleTextColor("#000000")).toBe("#FFFFFF");
      expect(getAccessibleTextColor("#1A1C1E")).toBe("#FFFFFF");
      expect(getAccessibleTextColor("#003366")).toBe("#FFFFFF");
    });

    it("returns dark text for light/bright backgrounds", () => {
      expect(getAccessibleTextColor("#FFFFFF")).toBe("#1A1C1E");
      expect(getAccessibleTextColor("#FFFF00")).toBe("#1A1C1E");
      expect(getAccessibleTextColor("#E0E0E0")).toBe("#1A1C1E");
    });

    it("falls back to #FFFFFF for invalid hex color codes", () => {
      expect(getAccessibleTextColor(null)).toBe("#FFFFFF");
      expect(getAccessibleTextColor(undefined)).toBe("#FFFFFF");
      expect(getAccessibleTextColor("red")).toBe("#FFFFFF");
      expect(getAccessibleTextColor("#XYZ")).toBe("#FFFFFF");
    });
  });

  describe("calculateEarlyCheckoutStatus (DEFEK-01 Remediation)", () => {
    const normalShift = {
      id: "shift-1",
      code: "SHIFT-PAGI",
      name: "Shift Reguler",
      start_time: "08:00:00",
      end_time: "17:00:00",
      grace_late: 15,
      grace_early: 15,
      is_overnight: false,
      color: "#0284C7",
    };

    const overnightShift = {
      id: "shift-2",
      code: "SHIFT-MALAM",
      name: "Shift Malam",
      start_time: "22:00:00",
      end_time: "06:00:00",
      grace_late: 15,
      grace_early: 15,
      is_overnight: true,
      color: "#5B21B6",
    };

    it("detects early checkout for normal day shift before grace early window", () => {
      // 14:00 WIB is 3 hours before 17:00 (outside grace 15 mins)
      const currentTime = parseWIBDate("2026-09-08 14:00:00")!;
      const result = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 08:05:00",
        checkoutTime: null,
        shift: normalShift,
        shiftDate: "2026-09-08",
      });

      expect(result.isEarly).toBe(true);
      expect(result.shiftName).toBe("Shift Reguler");
      expect(result.shiftEndTime).toBe("17:00");
      expect(result.deficitMinutes).toBe(180);
      expect(result.deficitText).toBe("3 Jam Lebih Cepat");
    });

    it("detects early checkout for normal shift 1 minute before grace early boundary", () => {
      // 16:44:00 WIB is 16 mins before 17:00, grace_early is 15 min -> early
      const currentTime = parseWIBDate("2026-09-08 16:44:00")!;
      const result = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 08:00:00",
        checkoutTime: null,
        shift: normalShift,
        shiftDate: "2026-09-08",
      });

      expect(result.isEarly).toBe(true);
      expect(result.deficitMinutes).toBe(16);
      expect(result.deficitText).toBe("16 Menit Lebih Cepat");
    });

    it("allows direct checkout without early modal when within grace early window for normal shift", () => {
      // 16:45:00 WIB is exactly 15 min before 17:00 -> not early
      const currentTime = parseWIBDate("2026-09-08 16:45:00")!;
      const result = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 08:00:00",
        checkoutTime: null,
        shift: normalShift,
        shiftDate: "2026-09-08",
      });

      expect(result.isEarly).toBe(false);
    });

    it("allows direct checkout after normal shift end time", () => {
      // 17:10:00 WIB is after 17:00 -> not early
      const currentTime = parseWIBDate("2026-09-08 17:10:00")!;
      const result = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 08:00:00",
        checkoutTime: null,
        shift: normalShift,
        shiftDate: "2026-09-08",
      });

      expect(result.isEarly).toBe(false);
      expect(result.deficitText).toBeUndefined();
    });

    it("detects early checkout for overnight shift before midnight", () => {
      // Checkin at 21:55, current time 23:30 WIB
      const currentTime = parseWIBDate("2026-09-08 23:30:00")!;
      const result = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 21:55:00",
        checkoutTime: null,
        shift: overnightShift,
        shiftDate: "2026-09-08",
      });

      expect(result.isEarly).toBe(true);
      expect(result.shiftName).toBe("Shift Malam");
      expect(result.shiftEndTime).toBe("06:00");
      expect(result.deficitMinutes).toBe(390); // 6 hours 30 mins
      expect(result.deficitText).toBe("6 Jam 30 Menit Lebih Cepat");
    });

    it("detects early checkout for overnight shift in morning before grace boundary", () => {
      // Current time 05:30 WIB on next day (scheduled end 06:00, grace 15m -> boundary 05:45)
      const currentTime = parseWIBDate("2026-09-09 05:30:00")!;
      const result = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 21:55:00",
        checkoutTime: null,
        shift: overnightShift,
        shiftDate: "2026-09-08",
      });

      expect(result.isEarly).toBe(true);
      expect(result.deficitMinutes).toBe(30);
      expect(result.deficitText).toBe("30 Menit Lebih Cepat");
    });

    it("allows direct checkout during overnight grace period and after shift end", () => {
      // 05:50 WIB is within grace period (05:45 - 06:00)
      const graceTime = parseWIBDate("2026-09-09 05:50:00")!;
      const graceResult = calculateEarlyCheckoutStatus({
        currentTime: graceTime,
        checkinTime: "2026-09-08 21:55:00",
        checkoutTime: null,
        shift: overnightShift,
        shiftDate: "2026-09-08",
      });
      expect(graceResult.isEarly).toBe(false);

      // 06:05 WIB is after scheduled shift end
      const overdueTime = parseWIBDate("2026-09-09 06:05:00")!;
      const overdueResult = calculateEarlyCheckoutStatus({
        currentTime: overdueTime,
        checkinTime: "2026-09-08 21:55:00",
        checkoutTime: null,
        shift: overnightShift,
        shiftDate: "2026-09-08",
      });
      expect(overdueResult.isEarly).toBe(false);
    });

    it("returns isEarly false when not checked in or already checked out", () => {
      const currentTime = parseWIBDate("2026-09-08 14:00:00")!;
      const noCheckin = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: null,
        checkoutTime: null,
        shift: normalShift,
      });
      expect(noCheckin.isEarly).toBe(false);

      const alreadyCheckedOut = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 08:00:00",
        checkoutTime: "2026-09-08 14:00:00",
        shift: normalShift,
      });
      expect(alreadyCheckedOut.isEarly).toBe(false);
    });

    it("returns isEarly false when shift or schedule is absent", () => {
      const currentTime = parseWIBDate("2026-09-08 14:00:00")!;
      const noShift = calculateEarlyCheckoutStatus({
        currentTime,
        checkinTime: "2026-09-08 08:00:00",
        checkoutTime: null,
        shift: null,
      });
      expect(noShift.isEarly).toBe(false);
    });
  });

  describe("getWIBDateString and formatHourMinute", () => {
    it("formats WIB date string correctly", () => {
      const date = parseWIBDate("2026-09-10 14:30:00")!;
      expect(getWIBDateString(date)).toBe("2026-09-10");
    });

    it("formats hour minute correctly", () => {
      expect(formatHourMinute("2026-09-10 14:49:37")).toBe("14:49");
      expect(formatHourMinute("2026-09-10 00:05:31")).toBe("00:05");
      expect(formatHourMinute("")).toBe("--:--");
      expect(formatHourMinute(null)).toBe("--:--");
      expect(formatHourMinute(undefined)).toBe("--:--");
    });
  });

  describe("resolveAttendanceSession (Defect 243 Remediation)", () => {
    // Helper untuk membuat dummy record attendance
    const makeAtt = (
      id: string,
      checkin: string | null,
      checkout: string | null
    ): IAttendance =>
      ({
        id,
        checkin,
        checkout,
        user_id: "user-1",
        company_id: "comp-1",
        contract_id: "cont-1",
        site_id: "site-1",
        evidence_group_id: "eg-1",
        code: `CHK-${id}`,
        name: "attendance",
        description: "",
        longitude: 106.8,
        latitude: -6.2,
        checkout_longitude: null,
        checkout_latitude: null,
        created_at: checkin || "2026-09-10 08:00:00",
        updated_at: checkin || "2026-09-10 08:00:00",
        deleted_at: null,
        attendance_status_id: "ATST001",
        x1: null,
        x2: null,
        x3: null,
        x4: null,
        x5: null,
        x6: null,
        x7: null,
        x8: null,
        x9: null,
        x10: null,
        x11: null,
        x12: null,
        x13: null,
        x14: null,
        x15: null,
        x16: null,
        x17: null,
        x18: null,
        x19: null,
        x20: null,
      } as IAttendance);

    it("kasus (a): checkout kosong dalam rentang wajar -> aktif", () => {
      const att = makeAtt("att-1", "2026-09-10 08:00:00", null);
      const currentTime = parseWIBDate("2026-09-10 10:00:00")!; // 2 jam lalu

      const result = resolveAttendanceSession({
        checkInData: [att],
        currentTime,
      });

      expect(result.activeSession).not.toBeNull();
      expect(result.activeSession?.id).toBe("att-1");
      expect(result.recentlyCompletedSession).toBeNull();
      expect(result.isExpiredSession).toBe(false);
      expect(result.expiredSession).toBeNull();
    });

    it("kasus (b): sesi kemarin checkout 00:05 hari ini -> TIDAK aktif, masuk recent", () => {
      // Skenario Riandesta & Sabila (Defect 243):
      // Check-in kemarin 14:49:37, check-out hari ini 00:05:31.
      // Jam 14:00 hari ini teknisi membuka aplikasi untuk dinas baru.
      const attCrossMidnight = makeAtt(
        "att-cross-midnight",
        "2026-09-09 14:49:37",
        "2026-09-10 00:05:31"
      );
      const currentTime = parseWIBDate("2026-09-10 14:00:00")!;

      const result = resolveAttendanceSession({
        checkInData: [attCrossMidnight],
        currentTime,
      });

      // Kritis: TIDAK boleh dianggap aktif agar tombol check-in tidak terkunci!
      expect(result.activeSession).toBeNull();
      // Masuk ke recentlyCompletedSession untuk informasi di banner
      expect(result.recentlyCompletedSession).not.toBeNull();
      expect(result.recentlyCompletedSession?.id).toBe("att-cross-midnight");
      expect(result.isExpiredSession).toBe(false);
    });

    it("kasus (c): dua sesi lama -> tetap tidak aktif dan tidak recent", () => {
      const attOld1 = makeAtt("att-old-1", "2026-09-08 08:00:00", "2026-09-08 17:00:00");
      const attOld2 = makeAtt("att-old-2", "2026-09-07 08:00:00", "2026-09-07 17:00:00");
      const currentTime = parseWIBDate("2026-09-10 12:00:00")!;

      const result = resolveAttendanceSession({
        checkInData: [attOld1, attOld2],
        currentTime,
      });

      expect(result.activeSession).toBeNull();
      expect(result.recentlyCompletedSession).toBeNull();
      expect(result.isExpiredSession).toBe(false);
      expect(result.expiredSession).toBeNull();
    });

    it("kasus (d): sesi aktif > 18 jam -> dianggap kadaluarsa (tidak memblokir) dan dilaporkan", () => {
      // User lupa checkout kemarin (check-in 22 jam lalu)
      const attStale = makeAtt("att-stale", "2026-09-09 12:00:00", null);
      const currentTime = parseWIBDate("2026-09-10 10:00:00")!; // 22 jam kemudian

      const result = resolveAttendanceSession({
        checkInData: [attStale],
        currentTime,
      });

      // Tidak memblokir: activeSession harus NULL!
      expect(result.activeSession).toBeNull();
      // Dilaporkan sebagai kadaluarsa
      expect(result.isExpiredSession).toBe(true);
      expect(result.expiredSession?.id).toBe("att-stale");
    });

    it("menangani active_overnight_session dari jadwal server secara akurat", () => {
      const serverSchedule: IScheduleToday = {
        has_schedule: true,
        shift: {
          id: "shift-malam",
          code: "SHIFT-MALAM",
          name: "Shift Malam",
          start_time: "23:00:00",
          end_time: "07:00:00",
          grace_late: 15,
          grace_early: 15,
          is_overnight: true,
          color: "#5B21B6",
        },
        status: "on_time",
        scheduled_start: "2026-09-09 23:00:00",
        scheduled_end: "2026-09-10 07:00:00",
        message: "",
        active_overnight_session: {
          shift: {
            id: "shift-malam",
            code: "SHIFT-MALAM",
            name: "Shift Malam",
            start_time: "23:00:00",
            end_time: "07:00:00",
            grace_late: 15,
            grace_early: 15,
            is_overnight: true,
            color: "#5B21B6",
          },
          attendance: {
            id: "att-night-1",
            checkin: "2026-09-09 23:00:00",
            checkout: null,
            site_id: "site-1",
          },
          is_overdue: false,
        },
      };

      const currentTime = parseWIBDate("2026-09-10 03:00:00")!; // 4 jam setelah checkin

      const result = resolveAttendanceSession({
        checkInData: [],
        todaySchedule: serverSchedule,
        currentTime,
      });

      expect(result.activeSession).not.toBeNull();
      expect(result.activeSession?.id).toBe("att-night-1");
      expect(result.isExpiredSession).toBe(false);
    });

    it("tidak menganggap active_overnight_session aktif jika sudah ada checkout", () => {
      const serverSchedule: IScheduleToday = {
        has_schedule: true,
        shift: null,
        status: "on_time",
        scheduled_start: null,
        scheduled_end: null,
        message: "",
        active_overnight_session: {
          shift: {
            id: "shift-malam",
            code: "SHIFT-MALAM",
            name: "Shift Malam",
            start_time: "23:00:00",
            end_time: "07:00:00",
            grace_late: 15,
            grace_early: 15,
            is_overnight: true,
            color: "#5B21B6",
          },
          attendance: {
            id: "att-night-done",
            checkin: "2026-09-09 23:00:00",
            checkout: "2026-09-10 07:05:00",
            site_id: "site-1",
          },
          is_overdue: false,
        },
      };

      const attCompleted = makeAtt("att-night-done", "2026-09-09 23:00:00", "2026-09-10 07:05:00");
      const currentTime = parseWIBDate("2026-09-10 14:00:00")!;

      const result = resolveAttendanceSession({
        checkInData: [attCompleted],
        todaySchedule: serverSchedule,
        currentTime,
      });

      expect(result.activeSession).toBeNull();
      expect(result.recentlyCompletedSession?.id).toBe("att-night-done");
    });
  });

  describe("getOperationalDateWIB (ADR-245 Cut-off 04:00 WIB)", () => {
    it("menghitung jam 00:00:00 s.d. 03:59:59 WIB sebagai hari operasional kemarin (H-1)", () => {
      expect(getOperationalDateWIB("2026-09-10 00:00:00")).toBe("2026-09-09");
      expect(getOperationalDateWIB("2026-09-10 01:30:00")).toBe("2026-09-09");
      expect(getOperationalDateWIB("2026-09-10 03:59:59")).toBe("2026-09-09");
    });

    it("menghitung jam 04:00:00 s.d. 23:59:59 WIB sebagai hari operasional hari ini (H)", () => {
      expect(getOperationalDateWIB("2026-09-10 04:00:00")).toBe("2026-09-10");
      expect(getOperationalDateWIB("2026-09-10 12:00:00")).toBe("2026-09-10");
      expect(getOperationalDateWIB("2026-09-10 23:59:59")).toBe("2026-09-10");
    });

    it("mendukung objek Date arbitrer secara timezone-aware", () => {
      const midnightDate = parseWIBDate("2026-09-10 02:00:00")!;
      expect(getOperationalDateWIB(midnightDate)).toBe("2026-09-09");

      const morningDate = parseWIBDate("2026-09-10 08:30:00")!;
      expect(getOperationalDateWIB(morningDate)).toBe("2026-09-10");
    });
  });

  describe("getCompletedShiftBannerInfo (UX BLOCKER-01 & Audit 256)", () => {
    it("menampilkan 'Shift Telah Selesai' jika masih dalam hari operasional berjalan (<04:00 WIB)", () => {
      // Skenario: Teknisi shift siang checkout 00:05 dini hari, cek app pukul 02:00 (< 04:00 WIB)
      const session = {
        checkin: "2026-09-09 14:49:37",
        checkout: "2026-09-10 00:05:31",
      };
      const currentTime = parseWIBDate("2026-09-10 02:00:00")!;

      const banner = getCompletedShiftBannerInfo({
        session,
        currentTime,
      });

      expect(banner.title).toBe("Shift Telah Selesai");
      expect(banner.subtitle).toBe(
        "Masuk 14:49 WIB, keluar 00:05 WIB. Hari operasional baru dimulai pukul 04:00 WIB."
      );
      expect(banner.isNewOperationalDay).toBe(false);
    });

    it("menampilkan 'Riwayat Shift Kemarin' jika hari operasional sudah berganti (>=04:00 WIB)", () => {
      // Skenario: Teknisi shift sore kemarin membuka aplikasi jam 14:00 siang hari ini untuk dinas baru
      const session = {
        checkin: "2026-09-09 14:49:37",
        checkout: "2026-09-10 00:05:31",
      };
      const currentTime = parseWIBDate("2026-09-10 14:00:00")!;

      const banner = getCompletedShiftBannerInfo({
        session,
        currentTime,
      });

      expect(banner.title).toBe("Riwayat Shift Kemarin");
      expect(banner.subtitle).toBe(
        "Selesai: masuk 14:49 WIB, keluar 00:05 WIB. Anda dapat melakukan check-in untuk jadwal hari ini."
      );
      expect(banner.isNewOperationalDay).toBe(true);
    });

    it("menangani shift reguler siang yang selesai hari ini lalu dicek sebelum cut-off 04:00 WIB esoknya", () => {
      const session = {
        checkin: "2026-09-10 08:00:00",
        checkout: "2026-09-10 17:00:00",
      };
      const currentTime = parseWIBDate("2026-09-10 17:30:00")!;

      const banner = getCompletedShiftBannerInfo({
        session,
        currentTime,
      });

      expect(banner.title).toBe("Shift Telah Selesai");
      expect(banner.subtitle).toBe(
        "Masuk 08:00 WIB, keluar 17:00 WIB. Hari operasional baru dimulai pukul 04:00 WIB."
      );
      expect(banner.isNewOperationalDay).toBe(false);
    });

    it("menangani shift reguler kemarin yang dicek keesokan paginya (>=04:00 WIB)", () => {
      const session = {
        checkin: "2026-09-10 08:00:00",
        checkout: "2026-09-10 17:00:00",
      };
      const currentTime = parseWIBDate("2026-09-11 06:00:00")!;

      const banner = getCompletedShiftBannerInfo({
        session,
        currentTime,
      });

      expect(banner.title).toBe("Riwayat Shift Kemarin");
      expect(banner.subtitle).toBe(
        "Selesai: masuk 08:00 WIB, keluar 17:00 WIB. Anda dapat melakukan check-in untuk jadwal hari ini."
      );
      expect(banner.isNewOperationalDay).toBe(true);
    });

    it("menangani parameter null/kosong secara aman tanpa error", () => {
      const banner = getCompletedShiftBannerInfo({
        session: null,
      });
      expect(banner.title).toBe("Riwayat Shift Kemarin");
      expect(banner.subtitle).toContain("masuk --:-- WIB, keluar --:--");
      expect(banner.isNewOperationalDay).toBe(true);
    });
  });
});

