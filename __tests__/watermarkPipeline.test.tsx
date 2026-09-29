/**
 * Tes integrasi watermark pada pipeline bukti (keputusan user 2026-09-19).
 *
 * Yang WAJIB dibuktikan di sini — tiga hal yang tidak boleh hanya diasumsikan:
 *   1. foto KAMERA   → uri hasil watermark yang dipakai (bukan uri asli);
 *   2. foto GALERI   → TIDAK distamp (watermark tidak boleh dipanggil);
 *   3. FAIL-SOFT     → bila watermark gagal, uri ASAL tetap dipakai dan
 *                      pemilihan foto TIDAK dibatalkan (absensi tidak boleh
 *                      terblokir oleh watermark).
 *
 * `@/utils/watermark` di-mock penuh: modul aslinya memuat Skia native yang
 * tidak tersedia di lingkungan Jest. Mock ini justru membuat perilaku
 * watermark dapat DIKONTROL dan di-Assert secara deterministik.
 */
import { renderHook, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import NetInfo from "@react-native-community/netinfo";
import { useImagePicker } from "../hooks/useImagePicker";

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(),
}));

jest.mock("@/utils/utils", () => ({
  compressImage: jest.fn(async (asset: any) => asset),
}));

const mockApplyCameraWatermark = jest.fn(async (uri: string) => uri);

jest.mock("@/utils/watermark", () => ({
  applyCameraWatermark: (uri: string) => mockApplyCameraWatermark(uri),
}));

jest.mock("@/lib/evidenceStorage", () => ({
  persistEvidenceImage: jest.fn(async (uri: string) => uri),
  isPersistedEvidence: jest.fn(() => false),
  removePersistedEvidence: jest.fn(async () => {}),
  evidenceFileExists: jest.fn(async () => true),
}));

jest.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  PermissionStatus: {
    GRANTED: "granted",
    UNDETERMINED: "undetermined",
    DENIED: "denied",
  },
}));

const uploadService = {
  uploadTemp: jest.fn(),
  deleteTemp: jest.fn(),
};

/** Kamera & online: jalur terpendek yang tetap melewati watermark. */
function arrangeCameraOnline() {
  (NetInfo.fetch as jest.Mock).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///cache/photo.jpg", width: 2000, height: 1500 }],
  });
  uploadService.uploadTemp.mockResolvedValue({ data: [{ path: "p", link: "l" }] });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockApplyCameraWatermark.mockImplementation(async (uri: string) => uri);
});

describe("watermark pada pipeline bukti — foto KAMERA", () => {
  it("memanggil watermark untuk foto kamera", async () => {
    arrangeCameraOnline();
    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.pickImage("camera", uploadService);
    });

    expect(mockApplyCameraWatermark).toHaveBeenCalledTimes(1);
    expect(mockApplyCameraWatermark).toHaveBeenCalledWith(
      "file:///cache/photo.jpg",
    );
  });

  it("memakai uri HASIL watermark, bukan uri asli", async () => {
    arrangeCameraOnline();
    mockApplyCameraWatermark.mockResolvedValue("file:///marked/wm.jpg");

    const { result } = renderHook(() => useImagePicker());
    await act(async () => {
      await result.current.pickImage("camera", uploadService);
    });

    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].uri).toBe("file:///marked/wm.jpg");
  });
});

describe("watermark pada pipeline bukti — foto GALERI", () => {
  it("TIDAK memanggil watermark untuk foto galeri", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///gallery/old.jpg", width: 1200, height: 900 }],
    });
    uploadService.uploadTemp.mockResolvedValue({ data: [{ path: "p", link: "l" }] });

    const { result } = renderHook(() => useImagePicker());
    await act(async () => {
      await result.current.pickImage("gallery", uploadService);
    });

    expect(mockApplyCameraWatermark).not.toHaveBeenCalled();
    expect(result.current.images[0].uri).toBe("file:///gallery/old.jpg");
  });
});

describe("watermark pada pipeline bukti — kontrak FAIL-SOFT", () => {
  it("tetap memakai foto asli dan TIDAK membatalkan pilihan bila watermark gagal", async () => {
    arrangeCameraOnline();
    // Helper asli tidak pernah throw, tetapi kita uji jalur terburuk:
    // seandainya ia melempar, alur bukti tetap tidak boleh kehilangan foto.
    mockApplyCameraWatermark.mockRejectedValue(new Error("skia mati"));

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.pickImage("camera", uploadService);
    });

    // Foto TETAP ada (tidak hilang) — kontrak P0-0.6 terjaga.
    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].uri).toBe("file:///cache/photo.jpg");
  });
});
