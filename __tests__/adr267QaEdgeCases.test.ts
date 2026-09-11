import {
  calculateAttendanceStatus,
  parseWIBDate,
  getCompletedShiftBannerInfo,
  getOperationalDateWIB,
  resolveHomeScreenCurrentShift,
  FALLBACK_OVERNIGHT_SHIFT,
} from "../utils/utils";
import { isCameraOnlyEvidence } from "../utils/dailyRoutineHelpers";
import { Colors } from "../constants/theme";
import appJson from "../app.json";

describe("ADR-267 QA Adversarial Verification & Edge Cases", () => {
  // 1. Audit Versi (OD267-11 & TSK-267-15)
  it("VERIFIES FIX: app.json version and versionCode should be bumped to 1.0.27 / 41", () => {
    // OD267-11: "Naikkan versi di Mobile/app.json ke 1.0.27 / versionCode 41 sebagai bagian wave."
    const version = appJson.expo.version;
    const versionCode = appJson.expo.android.versionCode;

    expect(version).toBe("1.0.27");
    expect(versionCode).toBe(41);
  });

  // 2. Audit Perhitungan Kontras WCAG AA pada Disabled Button (OD267-4 & OI-3)
  it("VERIFIES FIX: WCAG 2.1 AA contrast ratio of theme.textSecondary on theme.surface passes 4.5:1", () => {
    // Luminance formula per W3C WCAG 2.1
    function getLuminance(hex: string): number {
      const rgb = [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    function getContrastRatio(hex1: string, hex2: string): number {
      const lum1 = getLuminance(hex1);
      const lum2 = getLuminance(hex2);
      const bright = Math.max(lum1, lum2);
      const dark = Math.min(lum1, lum2);
      return (bright + 0.05) / (dark + 0.05);
    }

    const textSecondaryLight = Colors.light.textSecondary; // #666666
    const surfaceLight = Colors.light.surface;             // #f8f9fa
    const cardLight = Colors.light.card;                   // #ffffff

    const contrastSecondaryOnSurface = getContrastRatio(textSecondaryLight, surfaceLight);
    const contrastSecondaryOnCard = getContrastRatio(textSecondaryLight, cardLight);

    // WCAG AA for regular text requires >= 4.5:1
    expect(contrastSecondaryOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(contrastSecondaryOnCard).toBeGreaterThanOrEqual(4.5);

    // Dark theme token contrast verification
    const textSecondaryDark = Colors.dark.textSecondary;
    const surfaceDark = Colors.dark.surface;
    const contrastSecondaryOnSurfaceDark = getContrastRatio(textSecondaryDark, surfaceDark);
    expect(contrastSecondaryOnSurfaceDark).toBeGreaterThanOrEqual(4.5);
  });

  // 3. Audit Regresi Sesi Shift Malam Pasca-Checkout Sebelum 04:00 WIB (QA BUG-267-03)
  it("VERIFIES FIX: Overnight shift post-checkout retains shift context via resolveHomeScreenCurrentShift, preventing false 'Terlambat 725 Menit'", () => {
    // Night shift Day 1: 20:00 - 04:00
    const nightShift = {
      id: "shift-malam",
      code: "MALAM",
      name: "Shift Malam",
      start_time: "20:00:00",
      end_time: "04:00:00",
      grace_late: 15,
      grace_early: 15,
      is_overnight: true,
      color: "#5B21B6",
    };

    // Day 2 morning shift or null schedule on Day 2
    const day2MorningShift = {
      id: "shift-pagi",
      code: "PAGI",
      name: "Shift Pagi",
      start_time: "08:00:00",
      end_time: "17:00:00",
      grace_late: 15,
      grace_early: 15,
      is_overnight: false,
      color: "#2563EB",
    };

    const recentlyCompletedNightSession = {
      id: "att-night",
      checkin: "2026-09-11 20:05:00",
      checkout: "2026-09-12 03:50:00", // Checked out at 03:50 WIB before 04:00 cut-off
    };

    const todaySchedule = {
      date: "2026-09-12",
      shift: day2MorningShift,
      active_overnight_session: {
        attendance_id: "att-night",
        shift_date: "2026-09-11",
        shift: nightShift,
        attendance: recentlyCompletedNightSession,
      },
    };

    // Scenario A: When evaluated against the actual night shift, technician is ON_TIME
    const correctStatus = calculateAttendanceStatus({
      datetime: recentlyCompletedNightSession.checkin,
      type: "checkin",
      shift: nightShift,
      shiftDate: "2026-09-11",
    });
    expect(correctStatus.state).toBe("ON_TIME");
    expect(correctStatus.displayText).toBe("Tepat Waktu");

    // Scenario B: With resolveHomeScreenCurrentShift, completed overnight session
    // resolves to the night shift instead of falling back to day2MorningShift (08:00)
    const resolvedShift = resolveHomeScreenCurrentShift({
      isOvernightActive: false, // Checkout completed
      overnightShift: null,
      isTodayShiftCompleted: true,
      displaySession: recentlyCompletedNightSession,
      todaySchedule: todaySchedule as any,
      todayDateStr: "2026-09-12",
    });

    expect(resolvedShift).toEqual(nightShift);

    // Evaluating status with resolvedShift gives ON_TIME, NOT "Terlambat 725 Menit"
    const statusWithResolvedShift = calculateAttendanceStatus({
      datetime: recentlyCompletedNightSession.checkin,
      type: "checkin",
      shift: resolvedShift,
      shiftDate: "2026-09-11",
    });
    expect(statusWithResolvedShift.state).toBe("ON_TIME");
    expect(statusWithResolvedShift.displayText).toBe("Tepat Waktu");
  });

  // 4. Audit Edge Case: Perilaku fallback jika shift kemarin non-overnight (BUG-267-08)
  it("VERIFIES FIX BUG-267-08: resolveHomeScreenCurrentShift does NOT fall back to FALLBACK_OVERNIGHT_SHIFT for daytime checkin (14:00 or 09:30)", () => {
    const afternoonSession = {
      id: "att-day-yesterday",
      checkin: "2026-09-11 14:00:00",
      checkout: "2026-09-11 22:00:00",
    };

    // Skenario A: Tidak ada server overnight shift dan tidak ada jadwal hari ini -> resolves to null
    const resolvedNull = resolveHomeScreenCurrentShift({
      isOvernightActive: false,
      overnightShift: null,
      isTodayShiftCompleted: true,
      displaySession: afternoonSession,
      todaySchedule: { shift: null, active_overnight_session: null } as any,
      todayDateStr: "2026-09-12",
    });

    expect(resolvedNull).toBeNull();
    expect(resolvedNull).not.toEqual(FALLBACK_OVERNIGHT_SHIFT);

    // Skenario B: Ada jadwal shift hari ini -> resolves to todaySchedule.shift
    const dayShift = {
      id: "shift-siang",
      code: "SIANG",
      name: "Shift Siang",
      start_time: "14:00:00",
      end_time: "22:00:00",
      grace_late: 15,
      grace_early: 15,
      is_overnight: false,
      color: "#2563EB",
    };

    const resolvedWithSchedule = resolveHomeScreenCurrentShift({
      isOvernightActive: false,
      overnightShift: null,
      isTodayShiftCompleted: true,
      displaySession: afternoonSession,
      todaySchedule: { shift: dayShift, active_overnight_session: null } as any,
      todayDateStr: "2026-09-12",
    });

    expect(resolvedWithSchedule).toEqual(dayShift);
    expect(resolvedWithSchedule).not.toEqual(FALLBACK_OVERNIGHT_SHIFT);

    // Skenario C: Sesi 09:30 kemarin tanpa jadwal hari ini
    const morningSession930 = {
      id: "att-day-930",
      checkin: "2026-09-11 09:30:00",
      checkout: "2026-09-11 17:30:00",
    };

    const resolved930Null = resolveHomeScreenCurrentShift({
      isOvernightActive: false,
      overnightShift: null,
      isTodayShiftCompleted: true,
      displaySession: morningSession930,
      todaySchedule: { shift: null, active_overnight_session: null } as any,
      todayDateStr: "2026-09-12",
    });

    expect(resolved930Null).toBeNull();
    expect(resolved930Null).not.toEqual(FALLBACK_OVERNIGHT_SHIFT);
  });

  it("VERIFIES FIX BUG-267-08: morning checkin (09:33) post-midnight returns null (not Shift Malam) when no today schedule", () => {
    // Skenario User alif@prakhya.id (Working Hours 09:00 - 17:00, Senin-Jumat)
    // Checkin Jumat 09:33 WIB, buka aplikasi Sabtu 01:15 WIB (pasca tengah malam)
    const morningSession = {
      id: "att-morning-yesterday",
      checkin: "2026-09-11 09:33:00",
      checkout: "2026-09-11 17:05:00",
    };

    const resolvedShift = resolveHomeScreenCurrentShift({
      isOvernightActive: false,
      overnightShift: null,
      isTodayShiftCompleted: true,
      displaySession: morningSession,
      todaySchedule: { shift: null, active_overnight_session: null } as any,
      todayDateStr: "2026-09-12",
    });

    // Harus bernilai null, TIDAK BOLEH fallback ke FALLBACK_OVERNIGHT_SHIFT ("Shift Malam")
    expect(resolvedShift).toBeNull();
    expect(resolvedShift).not.toEqual(FALLBACK_OVERNIGHT_SHIFT);
  });

  // 5. Audit Kontras Visual: Warna teks sukses on-time terhadap kartu successSoft (BUG-267-10)
  it("EDGE CASE BUG-267-10: Audit contrast ratio of theme.success on theme.successSoft in light mode", () => {
    function getLuminance(hex: string): number {
      const rgb = [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    function getContrastRatio(hex1: string, hex2: string): number {
      const lum1 = getLuminance(hex1);
      const lum2 = getLuminance(hex2);
      const bright = Math.max(lum1, lum2);
      const dark = Math.min(lum1, lum2);
      return (bright + 0.05) / (dark + 0.05);
    }

    const successLight = Colors.light.success;         // #22c55e
    const successSoftLight = Colors.light.successSoft; // #E8F5E9
    const contrastRatio = getContrastRatio(successLight, successSoftLight);

    // Rasio kontras terhitung ~2.03:1, berada di bawah ambang batas WCAG AA 4.5:1
    expect(contrastRatio).toBeLessThan(3.0);
  });
});

