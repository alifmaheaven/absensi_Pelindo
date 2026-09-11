import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import AttendanceCard, { mapTimeToColor } from "../components/home/AttendanceCard";
import { Ishift } from "../types";
import {
  parseWIBDate,
  getCompletedShiftBannerInfo,
  getWorkStatus,
  calculateAttendanceStatus,
  getOperationalDateWIB,
} from "../utils/utils";

jest.mock("../hooks/use-theme-color", () => ({
  useThemeColors: () => ({
    text: "#1A1C1E",
    textMuted: "#64748B",
    surface: "#F7F9FC",
    primary: "#1D4ED8",
    danger: "#DC2626",
    dangerSoft: "#FFE9E9",
    success: "#0D7A53",
    successSoft: "#E8F5E9",
    borderStrong: "#CBD5E1",
  }),
}));

describe("ADR-267 OI-2: Attendance Card Locking & Lateness Retention", () => {
  const regularShift: Ishift = {
    id: "shift-pagi",
    code: "PAGI",
    name: "Shift Pagi",
    start_time: "08:00:00",
    end_time: "17:00:00",
    grace_late: 15,
    grace_early: 15,
    reminder_minutes: 30,
    is_overnight: false,
    color: "#2563EB",
  };

  const overnightShift: Ishift = {
    id: "shift-malam",
    code: "MALAM",
    name: "Shift Malam",
    start_time: "20:00:00",
    end_time: "04:00:00",
    grace_late: 15,
    grace_early: 15,
    reminder_minutes: 30,
    is_overnight: true,
    color: "#4F46E5",
  };

  describe("1. Single Helper calculateAttendanceStatus (Task A & OD267-7)", () => {
    it("reports ON_TIME when check-in is exact or within grace window", () => {
      // Tepat waktu pas 08:00
      const exact = calculateAttendanceStatus({
        datetime: "2026-09-11 08:00:00",
        type: "checkin",
        shift: regularShift,
        shiftDate: "2026-09-11",
      });
      expect(exact.state).toBe("ON_TIME");
      expect(exact.deltaMinutes).toBe(0);
      expect(exact.displayText).toBe("Tepat Waktu");

      // Masih dalam batas grace (08:10 <= 08:00 + 15m)
      const withinGrace = calculateAttendanceStatus({
        datetime: "2026-09-11 08:10:00",
        type: "checkin",
        shift: regularShift,
        shiftDate: "2026-09-11",
      });
      expect(withinGrace.state).toBe("ON_TIME");
      expect(withinGrace.deltaMinutes).toBe(0);
      expect(withinGrace.displayText).toBe("Tepat Waktu");
    });

    it("reports ON_TIME with early minutes when coming >= 5 minutes before scheduled start", () => {
      // Datang 07:45 (15 menit lebih awal dari 08:00)
      const early = calculateAttendanceStatus({
        datetime: "2026-09-11 07:45:00",
        type: "checkin",
        shift: regularShift,
        shiftDate: "2026-09-11",
      });
      expect(early.state).toBe("ON_TIME");
      expect(early.deltaMinutes).toBe(15);
      expect(early.displayText).toBe("Lebih Awal 15 Menit");
    });

    it("calculates deltaMinutes from ORIGINAL SCHEDULE time when late (> grace_late), matching backend", () => {
      // Jadwal 08:00, grace 15, checkin 08:25
      // Backend: Math.round((checkinMs - shiftStart.getTime()) / 60000) = 25 menit
      // BUKAN 10 menit (bukan dari grace threshold)
      const late = calculateAttendanceStatus({
        datetime: "2026-09-11 08:25:00",
        type: "checkin",
        shift: regularShift,
        shiftDate: "2026-09-11",
      });
      expect(late.state).toBe("LATE");
      expect(late.deltaMinutes).toBe(25);
      expect(late.displayText).toBe("Terlambat 25 Menit");

      // Cek juga adapter getWorkStatus
      const text = getWorkStatus(
        "2026-09-11 08:25:00",
        "checkin",
        regularShift,
        "2026-09-11"
      );
      expect(text).toBe("Terlambat 25 Menit");
    });

    it("reports EARLY_CHECKOUT when checkout is earlier than end_time - grace_early", () => {
      // Jadwal pulang 17:00, grace_early 15m -> batas 16:45
      // Checkout 16:30 -> Pulang Awal 30 Menit (dari 17:00)
      const earlyCheckout = calculateAttendanceStatus({
        datetime: "2026-09-11 16:30:00",
        type: "checkout",
        shift: regularShift,
        shiftDate: "2026-09-11",
      });
      expect(earlyCheckout.state).toBe("EARLY_CHECKOUT");
      expect(earlyCheckout.deltaMinutes).toBe(30);
      expect(earlyCheckout.displayText).toBe("Pulang Awal 30 Menit");
    });

    it("reports ON_TIME when checkout is within grace_early or after end_time", () => {
      // Checkout 16:50 (dalam toleransi 15 menit dari 17:00)
      const withinGrace = calculateAttendanceStatus({
        datetime: "2026-09-11 16:50:00",
        type: "checkout",
        shift: regularShift,
        shiftDate: "2026-09-11",
      });
      expect(withinGrace.state).toBe("ON_TIME");
      expect(withinGrace.deltaMinutes).toBe(0);
      expect(withinGrace.displayText).toBe("Tepat Waktu");

      // Checkout 17:05 (setelah jadwal)
      const normal = calculateAttendanceStatus({
        datetime: "2026-09-11 17:05:00",
        type: "checkout",
        shift: regularShift,
        shiftDate: "2026-09-11",
      });
      expect(normal.state).toBe("ON_TIME");
      expect(normal.displayText).toBe("Tepat Waktu");
    });

    it("handles missing shift or null datetime gracefully without false late accusations", () => {
      // Tanpa shift (dinas mandiri)
      const noShift = calculateAttendanceStatus({
        datetime: "2026-09-11 08:25:00",
        type: "checkin",
        shift: null,
      });
      expect(noShift.state).toBe("UNKNOWN_SCHEDULE");
      expect(noShift.displayText).toBe("Dinas Mandiri (Jadwal Terbuka)");

      // Belum absen (datetime null)
      const pendingCheckin = calculateAttendanceStatus({
        datetime: null,
        type: "checkin",
        shift: regularShift,
      });
      expect(pendingCheckin.state).toBe("UNKNOWN_SCHEDULE");
      expect(pendingCheckin.displayText).toBe("Mulai 08:00 WIB");

      const pendingCheckout = calculateAttendanceStatus({
        datetime: null,
        type: "checkout",
        shift: regularShift,
      });
      expect(pendingCheckout.state).toBe("UNKNOWN_SCHEDULE");
      expect(pendingCheckout.displayText).toBe("Selesai 17:00 WIB");
    });
  });

  describe("2. AttendanceCard UI Component & Lock State (Task B & OD267-6)", () => {
    it("renders real check-in time and 'Checked In' badge when shift is completed", () => {
      const { getByText } = render(
        <AttendanceCard
          type="checkin"
          time="2026-09-11 08:25:00"
          subtitle="Terlambat 25 Menit"
          shift={regularShift}
          shiftDate="2026-09-11"
          badgeText="Checked In"
          disabled={true}
          disabledReason="Sesi dinas hari ini telah selesai"
        />
      );

      expect(getByText("08:25")).toBeTruthy();
      expect(getByText("Checked In")).toBeTruthy();
      expect(getByText("Terlambat 25 Menit")).toBeTruthy();
      expect(getByText("Sesi dinas hari ini telah selesai")).toBeTruthy();
    });

    it("renders real checkout time and 'Checked Out' badge when shift is completed", () => {
      const { getByText } = render(
        <AttendanceCard
          type="checkout"
          time="2026-09-11 17:05:00"
          subtitle="Tepat Waktu"
          shift={regularShift}
          shiftDate="2026-09-11"
          badgeText="Checked Out"
          disabled={true}
          disabledReason="Sesi dinas hari ini telah selesai"
        />
      );

      expect(getByText("17:05")).toBeTruthy();
      expect(getByText("Checked Out")).toBeTruthy();
      expect(getByText("Tepat Waktu")).toBeTruthy();
      expect(getByText("Sesi dinas hari ini telah selesai")).toBeTruthy();
    });

    it("locks button strictly when disabled=true (OD267-6: no toast, no handler call)", () => {
      const onPressMock = jest.fn();
      const { getByRole } = render(
        <AttendanceCard
          type="checkin"
          time="2026-09-11 08:00:00"
          subtitle="Tepat Waktu"
          shift={regularShift}
          shiftDate="2026-09-11"
          badgeText="Checked In"
          disabled={true}
          disabledReason="Sesi dinas hari ini telah selesai"
          onPress={onPressMock}
        />
      );

      const button = getByRole("button");
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });

      // Button is disabled, fireEvent.press does not trigger onPress
      fireEvent.press(button);
      expect(onPressMock).not.toHaveBeenCalled();
    });

    it("permits click when disabled is false or undefined", () => {
      const onPressMock = jest.fn();
      const { getByRole } = render(
        <AttendanceCard
          type="checkin"
          time={null}
          shift={regularShift}
          shiftDate="2026-09-11"
          badgeText="Check In"
          disabled={false}
          onPress={onPressMock}
        />
      );

      const button = getByRole("button");
      expect(button.props.accessibilityState).toMatchObject({ disabled: false });
      fireEvent.press(button);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. mapTimeToColor Lateness Retention", () => {
    it("preserves danger/red styling for late check-in (> grace_late)", () => {
      const lateColors = mapTimeToColor(
        "2026-09-11 08:20:00",
        "checkin",
        regularShift,
        undefined,
        "2026-09-11"
      );

      expect(lateColors.text).toBe("#991B1B");
      expect(lateColors.container).toBe("#FFE9E9");
      expect(lateColors.button).toBe("#DC2626");
    });

    it("preserves success/green styling for on-time check-in (<= grace_late)", () => {
      const onTimeColors = mapTimeToColor(
        "2026-09-11 08:10:00",
        "checkin",
        regularShift,
        undefined,
        "2026-09-11"
      );

      expect(onTimeColors.text).toBe("#166534");
      expect(onTimeColors.container).toBe("#E8F5E9");
      expect(onTimeColors.button).toBe("#0D7A53");
    });

    it("returns neutral fallback when time is undefined (reset state)", () => {
      const neutralColors = mapTimeToColor(
        undefined,
        "checkin",
        regularShift,
        undefined,
        "2026-09-11"
      );

      expect(neutralColors.text).toBe("#1A1C1E");
      expect(neutralColors.container).toBe("#F7F9FC");
      expect(neutralColors.button).toBe("#2F73FF");
    });
  });

  describe("4. Operational Day Lifecycle & Card Locking Logic (Task E & ADR-245)", () => {
    it("locks cards pasca-checkout within same operational day (<04:00 WIB)", () => {
      const activeSession = null;
      const recentlyCompletedSession = {
        id: "att-today",
        checkin: "2026-09-11 08:25:00",
        checkout: "2026-09-11 17:05:00",
      };
      // Current time: 18:00 WIB same day
      const currentTime = parseWIBDate("2026-09-11 18:00:00")!;

      const completedBannerInfo = getCompletedShiftBannerInfo({
        session: recentlyCompletedSession,
        currentTime,
      });

      expect(completedBannerInfo.isNewOperationalDay).toBe(false);

      const isTodayShiftCompleted =
        !activeSession &&
        Boolean(recentlyCompletedSession && !completedBannerInfo.isNewOperationalDay);
      expect(isTodayShiftCompleted).toBe(true);

      const displaySession =
        activeSession ?? (isTodayShiftCompleted ? recentlyCompletedSession : null);
      expect(displaySession).not.toBeNull();
      expect(displaySession?.checkin).toBe("2026-09-11 08:25:00");
      expect(displaySession?.checkout).toBe("2026-09-11 17:05:00");

      // Work status calculation retains formal Indonesian lateness text
      const status = getWorkStatus(
        displaySession?.checkin,
        "checkin",
        regularShift,
        "2026-09-11"
      );
      expect(status).toBe("Terlambat 25 Menit");
    });

    it("unlocks cards pasca 04:00 WIB cut-off next day (new operational day)", () => {
      const activeSession = null;
      const recentlyCompletedSession = {
        id: "att-today",
        checkin: "2026-09-11 08:25:00",
        checkout: "2026-09-11 17:05:00",
      };
      // Current time: 05:00 WIB next day (past 04:00 cut-off)
      const currentTime = parseWIBDate("2026-09-12 05:00:00")!;

      const completedBannerInfo = getCompletedShiftBannerInfo({
        session: recentlyCompletedSession,
        currentTime,
      });

      expect(completedBannerInfo.isNewOperationalDay).toBe(true);

      const isTodayShiftCompleted =
        !activeSession &&
        Boolean(recentlyCompletedSession && !completedBannerInfo.isNewOperationalDay);
      expect(isTodayShiftCompleted).toBe(false);

      const displaySession =
        activeSession ?? (isTodayShiftCompleted ? recentlyCompletedSession : null);
      expect(displaySession).toBeNull();
    });
  });

  describe("5. ADR-245 Overnight Shift H+1 Safety (RSK-267-01)", () => {
    it("allows night shift technician who checked out at 04:30 WIB to check-in for today's shift", () => {
      // Shift malam Hari 1: 2026-09-11 20:00 s.d. 2026-09-12 04:00
      // Check-in: 2026-09-11 20:05:00
      // Check-out: 2026-09-12 04:30:00 (H+1 pagi)
      const overnightSession = {
        id: "att-night",
        checkin: "2026-09-11 20:05:00",
        checkout: "2026-09-12 04:30:00",
      };

      // Waktu saat ini: 2026-09-12 04:30:00 WIB (setelah cut-off 04:00 WIB)
      const currentTime = parseWIBDate("2026-09-12 04:30:00")!;

      // Cek hari operasional masing-masing
      const checkinOpDate = getOperationalDateWIB(overnightSession.checkin);
      const currentOpDate = getOperationalDateWIB(currentTime);

      expect(checkinOpDate).toBe("2026-09-11");
      expect(currentOpDate).toBe("2026-09-12");
      expect(checkinOpDate).not.toBe(currentOpDate);

      // Evaluasi getCompletedShiftBannerInfo
      const bannerInfo = getCompletedShiftBannerInfo({
        session: overnightSession,
        currentTime,
      });
      expect(bannerInfo.isNewOperationalDay).toBe(true);

      // Kartu tidak terkunci untuk hari ini
      const isTodayShiftCompleted =
        Boolean(overnightSession && !bannerInfo.isNewOperationalDay);
      expect(isTodayShiftCompleted).toBe(false);
    });

    it("strictly verifies operational day cutoff boundary at 03:59 WIB (locked) vs 04:01 WIB (unlocked)", () => {
      const overnightSession = {
        id: "att-night",
        checkin: "2026-09-11 20:05:00",
        checkout: "2026-09-12 03:55:00",
      };

      // Kasus 1: Pukul 03:59:00 WIB (sebelum cutoff 04:00 WIB) -> masih hari operasional 2026-09-11
      const timeBeforeCutoff = parseWIBDate("2026-09-12 03:59:00")!;
      expect(getOperationalDateWIB(timeBeforeCutoff)).toBe("2026-09-11");

      const bannerBefore = getCompletedShiftBannerInfo({
        session: overnightSession,
        currentTime: timeBeforeCutoff,
      });
      expect(bannerBefore.isNewOperationalDay).toBe(false);
      const isLockedBefore = Boolean(overnightSession && !bannerBefore.isNewOperationalDay);
      expect(isLockedBefore).toBe(true);

      // Kasus 2: Pukul 04:01:00 WIB (setelah cutoff 04:00 WIB) -> sudah hari operasional 2026-09-12
      const timeAfterCutoff = parseWIBDate("2026-09-12 04:01:00")!;
      expect(getOperationalDateWIB(timeAfterCutoff)).toBe("2026-09-12");

      const bannerAfter = getCompletedShiftBannerInfo({
        session: overnightSession,
        currentTime: timeAfterCutoff,
      });
      expect(bannerAfter.isNewOperationalDay).toBe(true);
      const isLockedAfter = Boolean(overnightSession && !bannerAfter.isNewOperationalDay);
      expect(isLockedAfter).toBe(false);
    });
  });

  describe("6. Direct Route Protection Logic (Task D)", () => {
    it("locks direct route when completed session belongs to current operational day", () => {
      const completedSession = {
        checkin: "2026-09-11 08:15:00",
        checkout: "2026-09-11 17:05:00",
      };
      const currentTime = parseWIBDate("2026-09-11 17:30:00")!;

      const isSameDay =
        getOperationalDateWIB(completedSession.checkin) ===
        getOperationalDateWIB(currentTime);

      expect(isSameDay).toBe(true);
    });

    it("allows direct route when completed session belongs to previous operational day", () => {
      const completedSession = {
        checkin: "2026-09-11 20:00:00",
        checkout: "2026-09-12 04:30:00",
      };
      const currentTime = parseWIBDate("2026-09-12 08:00:00")!;

      const isSameDay =
        getOperationalDateWIB(completedSession.checkin) ===
        getOperationalDateWIB(currentTime);

      expect(isSameDay).toBe(false);
    });
  });

  describe("7. Timezone Independence & Determinism (WIB UTC+7)", () => {
    it("consistently parses timestamps and calculates operational dates regardless of local TZ", () => {
      // 2026-09-11 10:00:00 WIB is 2026-09-11 03:00:00 UTC
      const parsed = parseWIBDate("2026-09-11 10:00:00");
      expect(parsed).not.toBeNull();
      expect(parsed!.toISOString()).toBe("2026-09-11T03:00:00.000Z");

      // 03:30 WIB is prior day operasional
      expect(getOperationalDateWIB("2026-09-11 03:30:00")).toBe("2026-09-10");
      // 04:30 WIB is current day operasional
      expect(getOperationalDateWIB("2026-09-11 04:30:00")).toBe("2026-09-11");
    });

    it("locks overnight-shift early morning checkout calculation identically across timezones and DST transitions", () => {
      // Kasus 1: 2026-11-02 00:30:00 WIB (transisi DST America/New_York pada 2026-11-01).
      // Shift malam: 20:00 s.d. 04:00 WIB, grace_early 15m.
      // Implementasi lama setDate(-1) menggeser baseDate ke 2026-10-31 (mundur 2 hari kalender WIB),
      // mengevaluasi scheduledEnd di 2026-11-01 04:00 WIB (sudah lewat) dan menghasilkan ON_TIME palsu.
      // Nilai benar: EARLY_CHECKOUT dengan deltaMinutes 210 (pulang 3.5 jam lebih awal dari 04:00 WIB).
      const nyResult = calculateAttendanceStatus({
        datetime: "2026-11-02 00:30:00",
        type: "checkout",
        shift: overnightShift,
      });

      expect(nyResult.state).toBe("EARLY_CHECKOUT");
      expect(nyResult.deltaMinutes).toBe(210);
      expect(nyResult.displayText).toBe("Pulang Awal 210 Menit");

      // Kasus 2: 2026-10-26 00:30:00 WIB (transisi DST Europe/London pada 2026-10-25).
      const londonResult = calculateAttendanceStatus({
        datetime: "2026-10-26 00:30:00",
        type: "checkout",
        shift: overnightShift,
      });

      expect(londonResult.state).toBe("EARLY_CHECKOUT");
      expect(londonResult.deltaMinutes).toBe(210);
      expect(londonResult.displayText).toBe("Pulang Awal 210 Menit");
    });
  });
});

