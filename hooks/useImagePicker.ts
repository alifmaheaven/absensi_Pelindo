import { useToast } from "@/components/ui/toast";
import {
  IMAGE_MAX_WIDTH,
  IMAGE_QUALITY,
} from "@/constants";
import { persistEvidenceImage, removePersistedEvidence } from "@/lib/evidenceStorage";
import { THttpErrorResult } from "@/types";
import { compressImage } from "@/utils/utils";
import NetInfo from "@react-native-community/netinfo";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Linking,
} from "react-native";

export interface IImage {
  id?: string | null;
  uri: string;
  path: string;
  link: string;
  name?: string;
  type?: string;
}

export interface IImageUploadService {
  uploadTemp: (file: any) => Promise<{ data?: any } | any>;
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
    setLoadingImage(true);
    try {
      const isCamera = source === "camera";
      if (__DEV__) console.debug(`[PickImage] Starting... Source: ${source}`);

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
      let { status } = await getPermission();
      console.debug(
        `[PickImage] Initial Status: ${status}`,
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

      const fileUri = compressed?.uri || result.assets?.[0]?.uri;
      if (!fileUri) {
        setLoadingImage(false);
        return;
      }

      // WAVE-0 P0-0.6 — pindahkan foto ke penyimpanan persisten SEBELUM masuk
      // state/antrean. Uri cache dari ImagePicker boleh di-evict OS kapan pun;
      // antrean offline yang disinkronkan berjam-jam kemudian tidak boleh
      // mengirim absensi tanpa bukti. Kegagalan persistensi = LOUD dan foto
      // TIDAK ditambahkan (lebih baik gagal terlihat daripada hilang senyap).
      let durableUri: string;
      try {
        durableUri = await persistEvidenceImage(fileUri);
      } catch (persistError) {
        console.error("[PickImage] Gagal menyimpan bukti ke penyimpanan perangkat:", persistError);
        Alert.alert(
          "Bukti Gagal Disimpan",
          "Foto tidak dapat disimpan ke penyimpanan aplikasi. Ruang penyimpanan perangkat mungkin penuh. Kosongkan ruang, lalu ambil ulang foto bukti ini.",
        );
        setLoadingImage(false);
        return;
      }

      const fileName = `image-${Date.now()}.jpg`;
      const localImage: IImage = {
        uri: durableUri,
        path: "",
        link: durableUri,
        name: fileName,
        type: "image/jpeg",
      };

      // Store local URI in state immediately so captured photo is preserved for offline queue
      setImages((prev) => [...prev, localImage]);

      // Check network status before attempting remote upload
      let isOffline = false;
      try {
        const netState = await NetInfo.fetch();
        isOffline = !netState.isConnected || !netState.isInternetReachable;
      } catch {
        // Assume online if NetInfo fails
      }

      if (isOffline) {
        console.debug("[PickImage] Offline detected, preserved local photo:", fileUri);
        setLoadingImage(false);
        return;
      }

      try {
        const res = await uploadService.uploadTemp({
          uri: fileUri,
          name: fileName,
          type: "image/jpeg",
        } as any);
        console.debug("[PickImage] Upload result:", res);

        const serverPath = res?.data?.[0]?.path ?? res?.[0]?.path ?? "";
        const serverLink = res?.data?.[0]?.link ?? res?.[0]?.link ?? "";

        if (serverPath || serverLink) {
          setImages((prev) =>
            prev.map((img) =>
              img.uri === fileUri
                ? {
                    ...img,
                    path: serverPath || img.path,
                    link: serverLink || img.link,
                  }
                : img,
            ),
          );
        }
      } catch (uploadError) {
        // ponytail: offline photo preservation - keep local URI in state for queueOfflineCheckIn/Out
        console.warn("[PickImage] Remote upload failed, keeping local image:", uploadError);
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
      if (target?.path) {
        try {
          await uploadService.deleteTemp({ links: [target.path] });
          console.debug("Image deleted from server");
        } catch (delErr) {
          console.warn("Failed to delete temp image on server:", delErr);
        }
      }
      newImages.splice(index, 1);
      setImages(newImages);
      // WAVE-0 P0-0.6 — file persisten yang tidak lagi dirujuk state layar
      // dihapus agar penyimpanan perangkat tidak menumpuk. Best-effort.
      if (target?.uri) {
        void removePersistedEvidence([target.uri]);
      }
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

  const localImages = images.map((img) => ({
    uri: img.uri,
    name: img.path || img.name || `image-${Date.now()}.jpg`,
    type: img.type || "image/jpeg",
  }));

  return {
    images,
    localImages,
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
