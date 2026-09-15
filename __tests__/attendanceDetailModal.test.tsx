jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

jest.mock("../services/attendance", () => ({
  getEvidGroupId: jest.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: "ev-1",
          evidence_group_id: "grp-1",
          code: "EV001",
          name: "Foto Masuk",
          description: "Foto selfie checkin",
          file: "files/evidence/2026/09/15/photo1.jpg",
          created_at: "2026-09-15 08:00:00",
        },
      ],
    },
  }),
}));

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AttendanceDetailModal, {
  calculateWorkDuration,
  resolveEvidenceUrl,
} from "../components/attendance/AttendanceDetailModal";
import { IAttendance } from "../types";
import { getEvidGroupId } from "../services/attendance";

describe("AttendanceDetailModal & Helpers", () => {
  describe("calculateWorkDuration", () => {
    it("returns '-' when checkin is missing or invalid", () => {
      expect(calculateWorkDuration(null, null)).toBe("-");
      expect(calculateWorkDuration("", "2026-09-15 17:00:00")).toBe("-");
      expect(calculateWorkDuration("invalid-date", "2026-09-15 17:00:00")).toBe("-");
    });

    it("returns 'Sedang Berlangsung' when checkout is not yet recorded", () => {
      expect(calculateWorkDuration("2026-09-15 08:00:00", null)).toBe(
        "Sedang Berlangsung"
      );
      expect(calculateWorkDuration("2026-09-15 08:00:00", undefined)).toBe(
        "Sedang Berlangsung"
      );
    });

    it("computes duration in hours and minutes accurately", () => {
      // 8 hours 30 mins
      const duration = calculateWorkDuration(
        "2026-09-15 08:00:00",
        "2026-09-15 16:30:00"
      );
      expect(duration).toBe("8 jam 30 menit");
    });

    it("returns only minutes when duration is under 1 hour", () => {
      const duration = calculateWorkDuration(
        "2026-09-15 08:00:00",
        "2026-09-15 08:45:00"
      );
      expect(duration).toBe("45 menit");
    });
  });

  describe("resolveEvidenceUrl", () => {
    it("returns original url if already absolute http or file uri", () => {
      expect(resolveEvidenceUrl("https://storage.pelindo.co.id/img.jpg")).toBe(
        "https://storage.pelindo.co.id/img.jpg"
      );
      expect(resolveEvidenceUrl("file:///local/photo.jpg")).toBe(
        "file:///local/photo.jpg"
      );
    });

    it("prepends IMAGE_BASE_PATH to relative path", () => {
      const resolved = resolveEvidenceUrl("files/evidence/abc.jpg");
      expect(resolved).toContain("/public/images/files/evidence/abc.jpg");
    });

    it("handles keys already starting with public/images/", () => {
      const resolved = resolveEvidenceUrl("public/images/abc.jpg");
      expect(resolved).toContain("/public/images/abc.jpg");
      expect(resolved).not.toContain("/public/images/public/images/");
    });

    it("returns empty string on empty input", () => {
      expect(resolveEvidenceUrl(null)).toBe("");
      expect(resolveEvidenceUrl("")).toBe("");
    });
  });

  describe("AttendanceDetailModal Rendering", () => {
    const mockAttendance: IAttendance = {
      id: "att-123",
      code: "AT001",
      name: "Budi Santoso",
      user_id: "user-1",
      company_id: "comp-1",
      contract_id: "contract-1",
      site_id: "site-1",
      evidence_group_id: "grp-1",
      attendance_status_id: "ATST001",
      checkin: "2026-09-15 07:55:00",
      checkout: "2026-09-15 16:05:00",
      latitude: -6.123456,
      longitude: 106.123456,
      checkout_latitude: -6.123458,
      checkout_longitude: 106.123459,
      description: "Patroli dermaga utara selesai aman",
      created_at: "2026-09-15 07:55:00",
      updated_at: "2026-09-15 16:05:00",
      deleted_at: null,
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
      shift: {
        id: "shift-1",
        code: "SH-01",
        name: "Shift Pagi",
        start_time: "08:00:00",
        end_time: "16:00:00",
        color: "#1D4ED8",
        reminder_minutes: 30,
        is_overnight: false,
        grace_late: 15,
        grace_early: 10,
      },
      site: {
        id: "site-1",
        name: "Terminal Petikemas Domestik",
        code: "TPK-01",
      },
    };

    it("renders attendance code, site name, shift name, and duration", async () => {
      const onClose = jest.fn();
      const { getByText, queryByText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={mockAttendance}
          onClose={onClose}
        />
      );

      expect(getByText("AT001")).toBeTruthy();
      expect(getByText("Detail Kehadiran")).toBeTruthy();
      expect(getByText("Shift Pagi")).toBeTruthy();
      expect(getByText("Terminal Petikemas Domestik (TPK-01)")).toBeTruthy();
      expect(getByText("8 jam 10 menit")).toBeTruthy();
      expect(getByText("Patroli dermaga utara selesai aman")).toBeTruthy();

      await waitFor(() => {
        expect(getEvidGroupId).toHaveBeenCalledWith(
          expect.objectContaining({
            evidence_group_id_exact: ["grp-1"],
          })
        );
      });
    });

    it("renders overnight badge when shift is overnight", async () => {
      const overnightAttendance: IAttendance = {
        ...mockAttendance,
        evidence_group_id: "",
        shift: {
          ...mockAttendance.shift!,
          is_overnight: true,
          name: "Shift Malam",
        },
      };

      const { getByText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={overnightAttendance}
          onClose={jest.fn()}
        />
      );

      expect(getByText("Lintas Hari (+1)")).toBeTruthy();
    });

    it("handles active attendance without checkout", async () => {
      const activeAttendance: IAttendance = {
        ...mockAttendance,
        evidence_group_id: "",
        checkout: null,
        checkout_latitude: null,
        checkout_longitude: null,
      };

      const { getByText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={activeAttendance}
          onClose={jest.fn()}
        />
      );

      expect(getByText("Sedang Aktif")).toBeTruthy();
      expect(getByText("Sedang Berlangsung")).toBeTruthy();
      expect(getByText("Belum Checkout")).toBeTruthy();
    });

    it("calls onClose when close button is pressed", async () => {
      const onClose = jest.fn();
      const { getByLabelText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={{ ...mockAttendance, evidence_group_id: "" }}
          onClose={onClose}
        />
      );

      const closeBtn = getByLabelText("Tutup modal detail kehadiran");
      fireEvent.press(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders fallback when shift is not assigned", async () => {
      const noShiftAttendance: IAttendance = {
        ...mockAttendance,
        evidence_group_id: "",
        shift: null,
      };

      const { getByText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={noShiftAttendance}
          onClose={jest.fn()}
        />
      );

      expect(getByText("Dinas Terbuka (Non-Shift)")).toBeTruthy();
    });

    it("renders fallback site name 'Site / Lokasi Terdaftar' when site relation is null", () => {
      const noSiteAttendance: IAttendance = {
        ...mockAttendance,
        evidence_group_id: "",
        site: null,
      };

      const { getByText, queryByText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={noSiteAttendance}
          onClose={jest.fn()}
        />
      );

      expect(getByText("Site / Lokasi Terdaftar")).toBeTruthy();
      // Must not fall back to attendance.name ("Budi Santoso")
      expect(queryByText("Budi Santoso")).toBeNull();
    });

    it("preserves modal content during dismiss when attendance becomes null", () => {
      const { rerender, getByText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={mockAttendance}
          onClose={jest.fn()}
        />
      );

      expect(getByText("AT001")).toBeTruthy();

      // Even if attendance prop is reset to null while dismiss is animating, content remains preserved
      rerender(
        <AttendanceDetailModal
          visible={true}
          attendance={null}
          onClose={jest.fn()}
        />
      );

      expect(getByText("AT001")).toBeTruthy();
    });

    it("clears evidence and does not fetch when switching to an attendance record without evidence", async () => {
      const { rerender, queryByText } = render(
        <AttendanceDetailModal
          visible={true}
          attendance={mockAttendance}
          onClose={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(getEvidGroupId).toHaveBeenCalledWith(
          expect.objectContaining({
            evidence_group_id_exact: ["grp-1"],
          })
        );
      });

      const noEvidenceAttendance: IAttendance = {
        ...mockAttendance,
        id: "att-456",
        code: "AT002",
        evidence_group_id: "",
      };

      rerender(
        <AttendanceDetailModal
          visible={true}
          attendance={noEvidenceAttendance}
          onClose={jest.fn()}
        />
      );

      expect(queryByText("Tidak ada foto bukti terlampir")).toBeTruthy();
    });
  });
});
