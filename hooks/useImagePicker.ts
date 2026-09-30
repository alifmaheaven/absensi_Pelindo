import { useToast } from "@/components/ui/toast";
import {
  IMAGE_MAX_WIDTH,
  IMAGE_QUALITY,
} from "@/constants";
import { persistEvidenceImage, removePersistedEvidence } from "@/lib/evidenceStorage";
import { useAuthStore } from "@/stores/auth";
import { THttpErrorResult } from "@/types";
import { compressImage } from "@/utils/utils";
import { applyCameraWatermark } from "@/utils/watermark";
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
  // Nama pengguna untuk baris keterangan watermark (permintaan user
  // 2026-09-29). Dibaca DI SINI — bukan di utils/watermark — supaya modul
  // watermark tidak perlu mengimpor store auth (menarik AsyncStorage dan
  // memerahkan suite Jest yang tidak menyentuh auth).
  const userName = useAuthStore((s) => s.user?.name ?? null);
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

      let fileUri = compressed?.uri || result.assets?.[0]?.uri;
      if (!fileUri) {
        setLoadingImage(false);
        return;
      }

      // WATERMARK foto KAMERA (keputusan user 2026-09-19):
      // isi = tanggal/jam WIB + GPS, cakupan = foto kamera saja (galeri tidak
      // distamp), dan FAIL-SOFT — absensi tidak boleh terblokir oleh watermark.
      // Ditempatkan SESUDAH compress (tidak ada kompresi ganda dari resize) dan
      // SEBELUM persistEvidenceImage, sehingga salinan persisten di
      // `attendance-evidence/` — termasuk yang dikirim jalur antrean offline
      // berjam-jam kemudian — sudah ber-watermark.
      //
      // `applyCameraWatermark` memang TIDAK PERNAH throw (kontraknya), tetapi
      // guard try/catch ini disengaja: bila helper suatu saat gagal dengan cara
      // tak terduga (mis. kegagalan native Skia), foto TIDAK boleh hilang.
      // Tanpa guard ini, throw akan jatuh ke catch terluar pickImage() dan
      // membatalkan seluruh pemilihan foto — pelanggaran kontrak P0-0.6
      // (tidak ada bukti yang hilang senyap) hanya demi sebuah cap.
      if (isCamera) {
        try {
          fileUri = await applyCameraWatermark(fileUri, userName);
        } catch (wmError) {
          console.warn(
            "[PickImage] Watermark gagal, memakai foto asli:",
            wmError,
          );
        }
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
              // REGRESI WAVE-0 (diperbaiki 2026-09-28): state menyimpan
              // `durableUri` (salinan persisten P0-0.6), BUKAN `fileUri` cache
              // yang diunggah. Membandingkan terhadap `fileUri` membuat
              // pembaruan path/link TIDAK PERNAH cocok sejak b14c9bc —
              // akibatnya alur online izin resubmit / leave create /
              // ticketing create & edit (yang TIDAK punya fallback re-upload)
              // mengirim `uploadEvidPermanent({ links: [""] })` dan gagal
              // keras (backend: moveToPermanentInS3 menolak key kosong).
              img.uri === durableUri
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
      // WAVE-0 P0-0.6 / CHECK-2a — konteks sah (b): user MEMBUANG fotonya
      // sendiri sebelum submit, jadi uri ini tidak akan pernah terkirim.
      // Kontrak lihat lib/evidenceStorage.ts. Best-effort.
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
