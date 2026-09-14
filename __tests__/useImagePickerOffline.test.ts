import { renderHook, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as ImagePicker from "expo-image-picker";
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

describe("useImagePicker - Offline Photo Preservation (MOB-01 / P0-7)", () => {
  const mockUploadService = {
    uploadTemp: jest.fn(),
    deleteTemp: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("preserves local image URI and does not drop photo when offline", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///local/offline-photo.jpg" }],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.pickImage("camera", mockUploadService);
    });

    // Does NOT call uploadTemp when offline
    expect(mockUploadService.uploadTemp).not.toHaveBeenCalled();

    // Preserves local photo in images and localImages
    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].uri).toBe("file:///local/offline-photo.jpg");
    expect(result.current.localImages).toHaveLength(1);
    expect(result.current.localImages[0].uri).toBe("file:///local/offline-photo.jpg");

    // Does NOT alert error to user
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.loadingImage).toBe(false);
  });

  it("preserves local image URI when remote upload fails due to network error", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///local/spotty-connection.jpg" }],
    });

    mockUploadService.uploadTemp.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.pickImage("camera", mockUploadService);
    });

    // Upload was attempted
    expect(mockUploadService.uploadTemp).toHaveBeenCalled();

    // Photo is NOT dropped, local URI remains in state
    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].uri).toBe("file:///local/spotty-connection.jpg");

    // Does NOT display blocking Alert dialog (graceful offline fallback)
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.loadingImage).toBe(false);
  });

  it("updates server path and link when upload succeeds online", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///local/online-photo.jpg" }],
    });

    mockUploadService.uploadTemp.mockResolvedValue({
      data: [{ path: "attendance/server-photo-123.jpg", link: "https://s3.pelindo.co.id/attendance/server-photo-123.jpg" }],
    });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.pickImage("camera", mockUploadService);
    });

    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].uri).toBe("file:///local/online-photo.jpg");
    expect(result.current.images[0].path).toBe("attendance/server-photo-123.jpg");
    expect(result.current.images[0].link).toBe("https://s3.pelindo.co.id/attendance/server-photo-123.jpg");
  });

  it("removes image from local state even if remote deleteTemp fails", async () => {
    mockUploadService.deleteTemp.mockRejectedValue(new Error("Delete failed"));

    const { result } = renderHook(() => useImagePicker());

    act(() => {
      result.current.setImages([
        { uri: "file:///local/image-to-delete.jpg", path: "server/path.jpg", link: "https://link" },
      ]);
    });

    expect(result.current.images).toHaveLength(1);

    await act(async () => {
      await result.current.removeImage(0, mockUploadService);
    });

    expect(result.current.images).toHaveLength(0);
  });
});
