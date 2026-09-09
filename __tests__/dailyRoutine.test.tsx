jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-image-picker", () => ({
  launchCameraAsync: jest.fn(),
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  PermissionStatus: {
    GRANTED: "granted",
    UNDETERMINED: "undetermined",
    DENIED: "denied",
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import {
  formatRoutineFrequency,
  isRoutineActiveToday,
  validateEvidenceFile,
  formatFileSize,
  resolveEvidenceType,
  getEvidenceRequirementLabel,
  MAX_FILE_SIZE_BYTES,
} from "../utils/dailyRoutineHelpers";
import ChecklistItemCard, {
  IItemState,
} from "../components/daily-routine/ChecklistItemCard";
import { IDailyRoutineItem } from "../types";

describe("Daily & Weekly Routine Evaluation & Helper Suite (D132)", () => {
  describe("isRoutineActiveToday (ADR-132-03)", () => {
    it("daily routine always appears every day", () => {
      expect(isRoutineActiveToday({ frequency: "daily" })).toBe(true);
      expect(
        isRoutineActiveToday(
          { frequency: "daily", work_days: null },
          { currentDayOfWeek: 0 }
        )
      ).toBe(true);
      expect(
        isRoutineActiveToday(
          { frequency: "daily", work_days: null },
          { currentDayOfWeek: 5 }
        )
      ).toBe(true);
      // Fallback for missing frequency (legacy server)
      expect(isRoutineActiveToday({ frequency: undefined })).toBe(true);
      expect(isRoutineActiveToday({ frequency: null })).toBe(true);
      expect(isRoutineActiveToday(null)).toBe(false);
    });

    it("weekly scheduled routine appears only on matching work_days", () => {
      // Routine scheduled for Monday (1) and Thursday (4)
      const scheduledRoutine = {
        frequency: "weekly",
        work_days: [1, 4],
      };

      // Monday (1) -> active
      expect(
        isRoutineActiveToday(scheduledRoutine, { currentDayOfWeek: 1 })
      ).toBe(true);

      // Thursday (4) -> active
      expect(
        isRoutineActiveToday(scheduledRoutine, { currentDayOfWeek: 4 })
      ).toBe(true);

      // Tuesday (2) -> inactive
      expect(
        isRoutineActiveToday(scheduledRoutine, { currentDayOfWeek: 2 })
      ).toBe(false);

      // Sunday (0) -> inactive
      expect(
        isRoutineActiveToday(scheduledRoutine, { currentDayOfWeek: 0 })
      ).toBe(false);

      // Friday (5) -> inactive
      expect(
        isRoutineActiveToday(scheduledRoutine, { currentDayOfWeek: 5 })
      ).toBe(false);
    });

    it("weekly flexible routine appears if not yet completed this week", () => {
      const flexibleRoutineNull = {
        frequency: "weekly",
        work_days: null,
      };
      const flexibleRoutineEmpty = {
        frequency: "weekly",
        work_days: [],
      };

      // Not yet completed this week -> active
      expect(
        isRoutineActiveToday(flexibleRoutineNull, {
          hasCompletedLogInCurrentWeek: false,
        })
      ).toBe(true);
      expect(
        isRoutineActiveToday(flexibleRoutineEmpty, {
          hasCompletedLogInCurrentWeek: false,
        })
      ).toBe(true);

      // Already completed this week -> locked / inactive
      expect(
        isRoutineActiveToday(flexibleRoutineNull, {
          hasCompletedLogInCurrentWeek: true,
        })
      ).toBe(false);
      expect(
        isRoutineActiveToday(flexibleRoutineEmpty, {
          hasCompletedLogInCurrentWeek: true,
        })
      ).toBe(false);
    });
  });

  describe("formatRoutineFrequency (UX Spec Copywriting ID)", () => {
    it("formats daily frequency correctly", () => {
      expect(formatRoutineFrequency("daily")).toBe("Harian");
      expect(formatRoutineFrequency(undefined)).toBe("Harian");
      expect(formatRoutineFrequency(null)).toBe("Harian");
    });

    it("formats weekly flexible frequency correctly", () => {
      expect(formatRoutineFrequency("weekly", null)).toBe(
        "Mingguan · Fleksibel"
      );
      expect(formatRoutineFrequency("weekly", undefined)).toBe(
        "Mingguan · Fleksibel"
      );
      expect(formatRoutineFrequency("weekly", [])).toBe(
        "Mingguan · Fleksibel"
      );
    });

    it("formats weekly scheduled frequency with single day correctly", () => {
      expect(formatRoutineFrequency("weekly", [1])).toBe(
        "Mingguan · Setiap Senin"
      );
      expect(formatRoutineFrequency("weekly", [4])).toBe(
        "Mingguan · Setiap Kamis"
      );
      expect(formatRoutineFrequency("weekly", [0])).toBe(
        "Mingguan · Setiap Minggu"
      );
      expect(formatRoutineFrequency("weekly", [5])).toBe(
        "Mingguan · Setiap Jumat"
      );
    });

    it("formats weekly scheduled frequency with multiple days correctly", () => {
      expect(formatRoutineFrequency("weekly", [1, 4])).toBe(
        "Mingguan · Sen, Kam"
      );
      expect(formatRoutineFrequency("weekly", [1, 3, 5])).toBe(
        "Mingguan · Sen, Rab, Jum"
      );
      // Handles unsorted input gracefully
      expect(formatRoutineFrequency("weekly", [4, 1])).toBe(
        "Mingguan · Sen, Kam"
      );
    });
  });

  describe("validateEvidenceFile (NFR-07: 5MB & JPG/PNG/WEBP/PDF)", () => {
    it("accepts valid files within 5MB limit", () => {
      // 2MB JPG
      expect(
        validateEvidenceFile({
          size: 2 * 1024 * 1024,
          name: "foto-panel.jpg",
          mimeType: "image/jpeg",
        }).valid
      ).toBe(true);

      // 4MB PNG
      expect(
        validateEvidenceFile({
          size: 4 * 1024 * 1024,
          name: "screenshot.png",
          mimeType: "image/png",
        }).valid
      ).toBe(true);

      // 1MB WEBP
      expect(
        validateEvidenceFile({
          size: 1024 * 1024,
          name: "dokumentasi.webp",
          mimeType: "image/webp",
        }).valid
      ).toBe(true);

      // 3.5MB PDF
      expect(
        validateEvidenceFile({
          size: 3.5 * 1024 * 1024,
          name: "laporan_kalibrasi.pdf",
          mimeType: "application/pdf",
        }).valid
      ).toBe(true);
    });

    it("rejects files exceeding 5MB with proper error message", () => {
      const oversized = validateEvidenceFile({
        size: 5.5 * 1024 * 1024,
        name: "foto-berat.jpg",
        mimeType: "image/jpeg",
      });

      expect(oversized.valid).toBe(false);
      expect(oversized.error).toContain("melebihi batas 5MB");
    });

    it("rejects unsupported file extensions with proper error message", () => {
      const invalidFiles = [
        { name: "script.sh", mimeType: "text/x-shellscript" },
        { name: "archive.zip", mimeType: "application/zip" },
        { name: "document.docx", mimeType: "application/vnd.openxmlformats" },
        { name: "video.mp4", mimeType: "video/mp4" },
      ];

      for (const f of invalidFiles) {
        const result = validateEvidenceFile({
          size: 1024,
          name: f.name,
          mimeType: f.mimeType,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Format berkas tidak didukung");
      }
    });

    it("handles null and undefined safely", () => {
      expect(validateEvidenceFile(null).valid).toBe(false);
      expect(validateEvidenceFile(undefined).valid).toBe(false);
    });
  });

  describe("formatFileSize", () => {
    it("formats bytes, kilobytes, and megabytes accurately", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(null)).toBe("0 B");
      expect(formatFileSize(512)).toBe("1 KB");
      expect(formatFileSize(840 * 1024)).toBe("840 KB");
      expect(formatFileSize(1.2 * 1024 * 1024)).toBe("1.2 MB");
      expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    });
  });

  describe("resolveEvidenceType and getEvidenceRequirementLabel (ADR-132-04)", () => {
    it("resolves evidence type with backward compatibility", () => {
      expect(resolveEvidenceType("photo")).toBe("photo");
      expect(resolveEvidenceType("file")).toBe("file");
      expect(resolveEvidenceType("both")).toBe("both");
      expect(resolveEvidenceType("none")).toBe("none");

      // Back-compat fallback using is_photo_required
      expect(resolveEvidenceType(undefined, true)).toBe("photo");
      expect(resolveEvidenceType(undefined, false)).toBe("none");
      expect(resolveEvidenceType(null, true)).toBe("photo");
      expect(resolveEvidenceType(null, false)).toBe("none");
    });

    it("returns correct Indonesian requirement labels", () => {
      expect(getEvidenceRequirementLabel("photo")).toBe("Wajib Foto");
      expect(getEvidenceRequirementLabel("file")).toBe("Wajib Berkas");
      expect(getEvidenceRequirementLabel("both")).toBe("Foto / Berkas");
      expect(getEvidenceRequirementLabel("none")).toBeNull();

      // Back-compat
      expect(getEvidenceRequirementLabel(undefined, true)).toBe("Wajib Foto");
      expect(getEvidenceRequirementLabel(undefined, false)).toBeNull();
    });
  });
});

describe("ChecklistItemCard Reveal-on-Check Component Tests", () => {
  const mockItem: IDailyRoutineItem = {
    id: "item-1",
    daily_routine_id: "dr-1",
    name: "Pemeriksaan Fisik Genset",
    description: "Pastikan tidak ada rembesan oli pada ruang genset",
    is_photo_required: true,
    evidence_type: "photo",
    sort_order: 1,
  };

  const defaultState: IItemState = {
    daily_routine_item_id: "item-1",
    is_checked: false,
    evidence_file: null,
    notes: "",
    local_uri: null,
    upload_failed: false,
  };

  const baseProps = {
    item: mockItem,
    state: defaultState,
    isReadOnly: false,
    onToggle: jest.fn(),
    onPickPhoto: jest.fn(),
    onPickDocument: jest.fn(),
    onRetryUpload: jest.fn(),
    onRemoveEvidence: jest.fn(),
    onPreviewImage: jest.fn(),
    onChangeNotes: jest.fn(),
    getImageUrl: (f: string) => `https://test.s3.com/${f}`,
  };

  it("before checked: evidence buttons and notes are hidden, requirement badge is shown", () => {
    const { queryByText, getByText } = render(
      <ChecklistItemCard
        {...baseProps}
        state={{ ...defaultState, is_checked: false }}
        evidenceType="photo"
      />
    );

    // Header label & requirement badge are visible
    expect(getByText("Pemeriksaan Fisik Genset")).toBeTruthy();
    expect(getByText("Wajib Foto")).toBeTruthy();

    // Reveal-on-check: Evidence buttons and notes MUST be hidden before check
    expect(queryByText("Ambil Foto")).toBeNull();
    expect(queryByText("Pilih Berkas")).toBeNull();
    expect(queryByText("Bukti terlampir")).toBeNull();
  });

  it("when checked with evidence_type='photo': reveals 'Ambil Foto' button", () => {
    const { getByText, queryByText } = render(
      <ChecklistItemCard
        {...baseProps}
        state={{ ...defaultState, is_checked: true }}
        evidenceType="photo"
      />
    );

    expect(getByText("Ambil Foto")).toBeTruthy();
    expect(queryByText("Pilih Berkas")).toBeNull();
  });

  it("when checked with evidence_type='file': reveals 'Pilih Berkas Dokumen' button", () => {
    const { getByText, queryByText } = render(
      <ChecklistItemCard
        {...baseProps}
        item={{ ...mockItem, evidence_type: "file" }}
        state={{ ...defaultState, is_checked: true }}
        evidenceType="file"
      />
    );

    expect(getByText("Pilih Berkas Dokumen (PDF/JPG/PNG)")).toBeTruthy();
    expect(queryByText("Ambil Foto")).toBeNull();
  });

  it("when checked with evidence_type='both': reveals both buttons separated by 'atau'", () => {
    const { getByText } = render(
      <ChecklistItemCard
        {...baseProps}
        item={{ ...mockItem, evidence_type: "both" }}
        state={{ ...defaultState, is_checked: true }}
        evidenceType="both"
      />
    );

    expect(getByText("Pilih salah satu bukti pelaksanaan *:")).toBeTruthy();
    expect(getByText("Ambil Foto")).toBeTruthy();
    expect(getByText("atau")).toBeTruthy();
    expect(getByText("Pilih Berkas")).toBeTruthy();
  });

  it("when checked with evidence_type='none': no evidence buttons shown, only notes", () => {
    const { queryByText, getByPlaceholderText } = render(
      <ChecklistItemCard
        {...baseProps}
        item={{ ...mockItem, evidence_type: "none", is_photo_required: false }}
        state={{ ...defaultState, is_checked: true }}
        evidenceType="none"
        requiresPhoto={false}
      />
    );

    expect(queryByText("Ambil Foto")).toBeNull();
    expect(queryByText("Pilih Berkas")).toBeNull();
    expect(getByPlaceholderText("Catatan tambahan (opsional)")).toBeTruthy();
  });

  it("when evidence is attached: displays 'Bukti terlampir', file name, and Ganti/Hapus buttons", () => {
    const { getByText } = render(
      <ChecklistItemCard
        {...baseProps}
        state={{
          ...defaultState,
          is_checked: true,
          evidence_file: "daily-routine/genset-01.jpg",
          file_name: "genset-01.jpg",
          file_size: 860160,
          file_type: "image",
        }}
        evidenceType="photo"
      />
    );

    expect(getByText("Bukti terlampir")).toBeTruthy();
    expect(getByText("genset-01.jpg (840 KB)")).toBeTruthy();
    expect(getByText("Ganti")).toBeTruthy();
    expect(getByText("Hapus")).toBeTruthy();
  });

  it("when upload fails: displays 'Gagal Upload' and 'Coba Lagi' button", () => {
    const { getByText } = render(
      <ChecklistItemCard
        {...baseProps}
        state={{
          ...defaultState,
          is_checked: true,
          local_uri: "file:///local/draft.jpg",
          evidence_file: null,
          upload_failed: true,
          file_name: "draft.jpg",
          file_size: 1048576,
        }}
        evidenceType="photo"
      />
    );

    expect(getByText("Gagal Upload")).toBeTruthy();
    expect(getByText("Coba Lagi")).toBeTruthy();
    expect(getByText("Ganti")).toBeTruthy();
    expect(getByText("Hapus")).toBeTruthy();
  });
});
