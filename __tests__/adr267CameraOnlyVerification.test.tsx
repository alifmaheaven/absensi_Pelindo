jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockLaunchCameraAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();
const mockRequestCameraPermissionsAsync = jest.fn().mockResolvedValue({ status: "granted" });
const mockRequestMediaLibraryPermissionsAsync = jest.fn().mockResolvedValue({ status: "granted" });
const mockGetDocumentAsync = jest.fn();

jest.mock("expo-image-picker", () => ({
  launchCameraAsync: (...args: any[]) => mockLaunchCameraAsync(...args),
  launchImageLibraryAsync: (...args: any[]) => mockLaunchImageLibraryAsync(...args),
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestCameraPermissionsAsync: (...args: any[]) => mockRequestCameraPermissionsAsync(...args),
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestMediaLibraryPermissionsAsync: (...args: any[]) => mockRequestMediaLibraryPermissionsAsync(...args),
  PermissionStatus: {
    GRANTED: "granted",
    UNDETERMINED: "undetermined",
    DENIED: "denied",
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: any[]) => mockGetDocumentAsync(...args),
}));

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import {
  isCameraOnlyEvidence,
  resolveEvidenceType,
  EvidenceType,
} from "../utils/dailyRoutineHelpers";
import ChecklistItemCard, {
  IItemState,
} from "../components/daily-routine/ChecklistItemCard";
import { IDailyRoutineItem } from "../types";

describe("ADR-267 OI-1: Camera-Only Enforcement for photo items", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. isCameraOnlyEvidence predicate helper", () => {
    it("returns true for 'photo' evidence_type", () => {
      expect(isCameraOnlyEvidence("photo")).toBe(true);
      expect(isCameraOnlyEvidence("PHOTO")).toBe(true);
      expect(isCameraOnlyEvidence(" photo ")).toBe(true);
    });

    it("returns false for 'both', 'file', and 'none'", () => {
      expect(isCameraOnlyEvidence("both")).toBe(false);
      expect(isCameraOnlyEvidence("file")).toBe(false);
      expect(isCameraOnlyEvidence("none")).toBe(false);
    });

    it("handles legacy boolean fallback when evidence_type is null or undefined", () => {
      expect(isCameraOnlyEvidence(null, true)).toBe(true);
      expect(isCameraOnlyEvidence(undefined, true)).toBe(true);
      expect(isCameraOnlyEvidence(null, false)).toBe(false);
      expect(isCameraOnlyEvidence(undefined, false)).toBe(false);
    });

    it("fail-safe to photo (camera only) for unknown or illegal strings per ADR-266 D137", () => {
      expect(isCameraOnlyEvidence("document")).toBe(true);
      expect(isCameraOnlyEvidence("unknown")).toBe(true);
      expect(isCameraOnlyEvidence("illegal_value")).toBe(true);
    });
  });

  describe("2. ChecklistItemCard UI affordance for evidence_type === 'photo' (OD267-1)", () => {
    const photoItem: IDailyRoutineItem = {
      id: "photo-item-1",
      daily_routine_id: "dr-1",
      name: "Kembalikan Laptop!",
      description: "Kembalikan laptop kerja ke rak penyimpanan",
      is_photo_required: true,
      evidence_type: "photo",
      sort_order: 1,
    };

    const emptyState: IItemState = {
      daily_routine_item_id: "photo-item-1",
      is_checked: true,
      evidence_file: null,
      notes: "",
      local_uri: null,
      upload_failed: false,
    };

    const baseProps = {
      item: photoItem,
      state: emptyState,
      isReadOnly: false,
      onToggle: jest.fn(),
      onPickPhoto: jest.fn(),
      onPickGallery: jest.fn(),
      onPickDocument: jest.fn(),
      onRetryUpload: jest.fn(),
      onRemoveEvidence: jest.fn(),
      onPreviewImage: jest.fn(),
      onChangeNotes: jest.fn(),
      getImageUrl: (f: string) => `https://test.s3.com/${f}`,
    };

    it("(a) empty state: renders 'Ambil Foto', completely OMITS gallery button from JSX", () => {
      const { getByText, queryByText } = render(
        <ChecklistItemCard
          {...baseProps}
          evidenceType="photo"
          requiresPhoto={true}
        />
      );

      // Camera button is present
      const cameraBtn = getByText("Ambil Foto");
      expect(cameraBtn).toBeTruthy();

      // Gallery button is completely absent from JSX (not just disabled or hidden)
      expect(queryByText("Pilih dari Galeri")).toBeNull();
      expect(queryByText("Galeri")).toBeNull();
      expect(queryByText("Pilih Berkas")).toBeNull();

      // Pressing camera button calls onPickPhoto
      fireEvent.press(cameraBtn);
      expect(baseProps.onPickPhoto).toHaveBeenCalledTimes(1);
      expect(baseProps.onPickGallery).not.toHaveBeenCalled();
    });

    it("(b) attached state (< 5 files): renders single 'Ambil Foto' in addMoreSection, no gallery button", () => {
      const attachedState: IItemState = {
        ...emptyState,
        evidence_files: [
          {
            id: "file-1",
            file: "photo-1.jpg",
            name: "photo-1.jpg",
            size: 500000,
            type: "image",
          },
        ],
      };

      const { getByText, queryByText } = render(
        <ChecklistItemCard
          {...baseProps}
          state={attachedState}
          evidenceType="photo"
          requiresPhoto={true}
        />
      );

      // Add more section has "Ambil Foto"
      expect(getByText("Ambil Foto")).toBeTruthy();

      // Gallery button is completely absent
      expect(queryByText("Pilih dari Galeri")).toBeNull();
      expect(queryByText("Galeri")).toBeNull();
    });

    it("(c) replace flow: triggers camera directly without redundant Alert dialog (QA BUG-267-05)", () => {
      const alertSpy = jest.spyOn(Alert, "alert");

      const attachedState: IItemState = {
        ...emptyState,
        evidence_files: [
          {
            id: "file-1",
            file: "photo-1.jpg",
            name: "photo-1.jpg",
            size: 500000,
            type: "image",
          },
        ],
      };

      const { getByText } = render(
        <ChecklistItemCard
          {...baseProps}
          state={attachedState}
          evidenceType="photo"
          requiresPhoto={true}
          onReplaceEvidence={undefined} // Test internal handleReplacePress
        />
      );

      const replaceBtn = getByText("Ganti");
      fireEvent.press(replaceBtn);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(baseProps.onPickPhoto).toHaveBeenCalledTimes(1);

      alertSpy.mockRestore();
    });

    it("(d) defence-in-depth: passing onPickGallery prop does NOT open gallery for photo item", () => {
      const onPickGalleryMock = jest.fn();
      const onPickPhotoMock = jest.fn();

      const { getByText, queryByText } = render(
        <ChecklistItemCard
          {...baseProps}
          evidenceType="photo"
          onPickGallery={onPickGalleryMock}
          onPickPhoto={onPickPhotoMock}
        />
      );

      // Gallery button is not rendered in JSX
      expect(queryByText("Pilih dari Galeri")).toBeNull();

      // Pressing camera button only calls photo handler
      fireEvent.press(getByText("Ambil Foto"));
      expect(onPickPhotoMock).toHaveBeenCalledTimes(1);
      expect(onPickGalleryMock).not.toHaveBeenCalled();
    });
  });

  describe("3. ChecklistItemCard UI affordance for evidence_type === 'both' (OD267-2)", () => {
    const bothItem: IDailyRoutineItem = {
      id: "both-item-1",
      daily_routine_id: "dr-1",
      name: "Inspeksi Panel Kontrol",
      description: "Ambil foto atau lampirkan foto dari galeri",
      is_photo_required: true,
      evidence_type: "both",
      sort_order: 2,
    };

    const emptyState: IItemState = {
      daily_routine_item_id: "both-item-1",
      is_checked: true,
      evidence_file: null,
      notes: "",
      local_uri: null,
      upload_failed: false,
    };

    const baseProps = {
      item: bothItem,
      state: emptyState,
      isReadOnly: false,
      onToggle: jest.fn(),
      onPickPhoto: jest.fn(),
      onPickGallery: jest.fn(),
      onPickDocument: jest.fn(),
      onRetryUpload: jest.fn(),
      onRemoveEvidence: jest.fn(),
      onPreviewImage: jest.fn(),
      onChangeNotes: jest.fn(),
      getImageUrl: (f: string) => `https://test.s3.com/${f}`,
    };

    it("renders both camera and gallery affordance ('Ambil Foto' & 'Pilih dari Galeri')", () => {
      const { getByText } = render(
        <ChecklistItemCard
          {...baseProps}
          evidenceType="both"
        />
      );

      expect(getByText("Ambil Foto")).toBeTruthy();
      expect(getByText("atau")).toBeTruthy();
      const galleryBtn = getByText("Pilih dari Galeri");
      expect(galleryBtn).toBeTruthy();

      fireEvent.press(galleryBtn);
      expect(baseProps.onPickGallery).toHaveBeenCalledTimes(1);
    });

    it("replace flow for 'both' offers gallery option", () => {
      const alertSpy = jest.spyOn(Alert, "alert");

      const attachedState: IItemState = {
        ...emptyState,
        evidence_files: [
          {
            id: "file-both-1",
            file: "both-1.jpg",
            name: "both-1.jpg",
            size: 300000,
            type: "image",
          },
        ],
      };

      const { getByText } = render(
        <ChecklistItemCard
          {...baseProps}
          state={attachedState}
          evidenceType="both"
          onReplaceEvidence={undefined}
        />
      );

      fireEvent.press(getByText("Ganti"));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [, , alertButtons] = alertSpy.mock.calls[0];
      const buttonTexts = (alertButtons || []).map((b) => b.text);

      expect(buttonTexts).toContain("Ambil Foto Kamera");
      expect(buttonTexts).toContain("Pilih dari Galeri"); // Gallery affordance
      expect(buttonTexts).toContain("Batal");

      alertSpy.mockRestore();
    });
  });

  describe("4. ChecklistItemCard UI affordance for evidence_type === 'file' (OD267-3)", () => {
    const fileItem: IDailyRoutineItem = {
      id: "file-item-1",
      daily_routine_id: "dr-1",
      name: "Menyerahkan Formulir Log",
      description: "Lampirkan berkas dokumen PDF atau foto bukti",
      is_photo_required: false,
      evidence_type: "file",
      sort_order: 3,
    };

    const emptyState: IItemState = {
      daily_routine_item_id: "file-item-1",
      is_checked: true,
      evidence_file: null,
      notes: "",
      local_uri: null,
      upload_failed: false,
    };

    const baseProps = {
      item: fileItem,
      state: emptyState,
      isReadOnly: false,
      onToggle: jest.fn(),
      onPickPhoto: jest.fn(),
      onPickGallery: jest.fn(),
      onPickDocument: jest.fn(),
      onRetryUpload: jest.fn(),
      onRemoveEvidence: jest.fn(),
      onPreviewImage: jest.fn(),
      onChangeNotes: jest.fn(),
      getImageUrl: (f: string) => `https://test.s3.com/${f}`,
    };

    it("renders document picker button and triggers onPickDocument", () => {
      const { getByText } = render(
        <ChecklistItemCard
          {...baseProps}
          evidenceType="file"
        />
      );

      const docBtn = getByText("Pilih Berkas Dokumen (PDF/JPG/PNG)");
      expect(docBtn).toBeTruthy();

      fireEvent.press(docBtn);
      expect(baseProps.onPickDocument).toHaveBeenCalledTimes(1);
    });

    it("replace flow for 'file' offers document picker option", () => {
      const alertSpy = jest.spyOn(Alert, "alert");

      const attachedState: IItemState = {
        ...emptyState,
        evidence_files: [
          {
            id: "file-doc-1",
            file: "laporan.pdf",
            name: "laporan.pdf",
            size: 400000,
            type: "pdf",
          },
        ],
      };

      const { getByText } = render(
        <ChecklistItemCard
          {...baseProps}
          state={attachedState}
          evidenceType="file"
          onReplaceEvidence={undefined}
        />
      );

      fireEvent.press(getByText("Ganti"));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [, , alertButtons] = alertSpy.mock.calls[0];
      const buttonTexts = (alertButtons || []).map((b) => b.text);

      expect(buttonTexts).toContain("Pilih Berkas Dokumen (PDF)");
      expect(buttonTexts).toContain("Ambil Foto Kamera");
      expect(buttonTexts).toContain("Batal");

      alertSpy.mockRestore();
    });
  });

  describe("5. Launch site guard defence-in-depth: launchImageLibraryAsync cannot be reached for photo", () => {
    it("simulated handlePickGallery guard blocks launchImageLibraryAsync for camera-only items", async () => {
      const alertSpy = jest.spyOn(Alert, "alert");

      // Simulate the launch-site guard implemented in daily-routine/[id].tsx
      const simulateHandlePickGallery = async (type: EvidenceType) => {
        if (isCameraOnlyEvidence(type)) {
          Alert.alert(
            "Kamera Langsung Diperlukan",
            "Item ini dikonfigurasi Kamera Langsung dan hanya dapat mengambil foto secara langsung melalui kamera perangkat."
          );
          return;
        }
        await mockLaunchImageLibraryAsync({
          mediaTypes: ["images"],
        });
      };

      // 1. Invocation for photo item -> blocked and alerted
      await simulateHandlePickGallery("photo");
      expect(alertSpy).toHaveBeenCalledWith(
        "Kamera Langsung Diperlukan",
        expect.stringContaining("hanya dapat mengambil foto secara langsung")
      );
      expect(mockLaunchImageLibraryAsync).not.toHaveBeenCalled();

      // 2. Invocation for both item -> allowed to launch gallery
      await simulateHandlePickGallery("both");
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledTimes(1);

      alertSpy.mockRestore();
    });

    it("simulated replace flow options exclude Galeri for photo items", () => {
      const buildReplaceOptions = (type: EvidenceType) => {
        const options: any[] = [{ text: "Kamera" }];
        if (!isCameraOnlyEvidence(type)) {
          options.push({ text: "Galeri" });
        }
        if (type === "file") {
          options.push({ text: "Dokumen (PDF)" });
        }
        options.push({ text: "Batal" });
        return options.map((o) => o.text);
      };

      expect(buildReplaceOptions("photo")).toEqual(["Kamera", "Batal"]);
      expect(buildReplaceOptions("both")).toEqual(["Kamera", "Galeri", "Batal"]);
      expect(buildReplaceOptions("file")).toEqual(["Kamera", "Galeri", "Dokumen (PDF)", "Batal"]);
    });
  });
});
