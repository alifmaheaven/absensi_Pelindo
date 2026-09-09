import {
  getDistanceInMeters,
  smartCapitalize,
  parseWIBDate,
  parseUTCDate,
  getAccessibleTextColor,
  calculateEarlyCheckoutStatus,
} from "../utils/utils";

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
});
