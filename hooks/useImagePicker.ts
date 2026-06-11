import { useToast } from "@/components/ui/toast";
import {
  IMAGE_MAX_WIDTH,
  IMAGE_QUALITY,
} from "@/constants";
import { THttpErrorResult } from "@/types";
import { compressImage } from "@/utils/utils";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Linking,
} from "react-native";

export interface IImage {
  uri: string;
  path: string;
  link: string;
}

export interface IImageUploadService {
  uploadTemp: (file: any) => Promise<{ data?: { path: string; link: string }[] }>;
  deleteTemp: (payload: { links: string[] }) => Promise<any>;
}

export function useImagePicker() {
  const { showToast } = useToast();
  const [images, setImages] = useState<IImage[]>([]);
  const [loadingImage, setLoadingImage] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const pickImage = async (
    source: "camera" | "gallery",
    uploadService: IImageUploadService,
  ) => {
    // Gallery is disabled - camera only
    if (source !== "camera") {
      Alert.alert("Error", "Hanya kamera yang diizinkan untuk mengambil gambar.");
      setLoadingImage(false);
      return;
    }

    setLoadingImage(true);
    try {
      const isCamera = source === "camera";
      console.debug(`[PickImage] Starting... Source: ${source}`);

      const getPermission = isCamera
        ? ImagePicker.getCameraPermissionsAsync
        : ImagePicker.getMediaLibraryPermissionsAsync;

      const requestPermission = isCamera
        ? ImagePicker.requestCameraPermissionsAsync
        : ImagePicker.requestMediaLibraryPermissionsAsync;

      const launchPicker = isCamera
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

      // 1. Cek Status Izin Saat Ini
      let { status, canAskAgain } = await getPermission();
      console.debug(
        `[PickImage] Initial Status: ${status}, CanAskAgain: ${canAskAgain}`,
      );

      // 2. Jika belum ditentukan (Undetermined), minta izin
      if (status === ImagePicker.PermissionStatus.UNDETERMINED) {
        console.debug("[PickImage] Requesting Permission...");
        const newPermission = await requestPermission();
        status = newPermission.status;
      }

      // 3. Jika Ditolak (Denied), arahkan ke Settings
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert(
          "Izin Diperlukan",
          `Aplikasi membutuhkan akses ${
            isCamera ? "Kamera" : "Galeri"
          } untuk fitur ini. Mohon aktifkan di pengaturan.`,
          [
            { text: "Batal", style: "cancel" },
            { text: "Buka Pengaturan", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      // 4. Jika Diizinkan (Granted), Buka Picker
      console.debug("[PickImage] Launching picker...");
      const result = await launchPicker({
        mediaTypes: ["images"],
        allowsEditing: false,
        aspect: [4, 3],
        quality: 1,
      });

      setIsModalVisible(false);

      if (result.canceled) {
        setLoadingImage(false);
        return;
      }

      const compressed = await compressImage(result.assets?.[0], {
        maxWidth: IMAGE_MAX_WIDTH,
        quality: IMAGE_QUALITY,
      });
      console.debug("[PickImage] Compressed result:", compressed);

      try {
        const res = await uploadService.uploadTemp({
          uri: compressed?.uri,
          name: `image-${Date.now()}.jpg`,
          type: "image/jpeg",
        } as any);
        console.debug("[PickImage] Upload result:", res);

        if (compressed?.uri) {
          setImages((prev) => [
            ...prev,
            {
              uri: compressed.uri,
              path: res.data?.[0]?.path ?? "",
              link: res.data?.[0]?.link ?? "",
            },
          ]);
        }
      } finally {
        setLoadingImage(false);
      }
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error("[PickImage Error]", err);
      Alert.alert("Error", "Gagal: " + (err?.message || "Unknown error"));
      setLoadingImage(false);
    }
  };

  const removeImage = async (index: number, uploadService: IImageUploadService) => {
    try {
      setLoadingImage(true);
      const newImages = [...images];
      const target = images[index];
      if (target?.path) await uploadService.deleteTemp({ links: [target.path] });
      console.debug("Image deleted");
      newImages.splice(index, 1);
      setImages(newImages);
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error("Remove Image Error:", err);
      showToast("Gagal menghapus gambar", "error");
    } finally {
      setLoadingImage(false);
    }
  };

  const clearImages = () => {
    setImages([]);
  };

  const openModal = () => setIsModalVisible(true);
  const closeModal = () => setIsModalVisible(false);

  return {
    images,
    loadingImage,
    isModalVisible,
    pickImage,
    removeImage,
    clearImages,
    openModal,
    closeModal,
    setImages,
  };
}
