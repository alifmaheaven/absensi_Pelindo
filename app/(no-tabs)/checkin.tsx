import { ArrowLeft, ImageIcon } from "@/components/icon";
import { MapEmbed } from "@/components/ui/map-embed";
import { useToast } from "@/components/ui/toast";
import {
  ATTENDANCE_STATUS_CODE_CHECKIN,
  DEFAULT_PAGE_SIZE,
  IMAGE_MAX_WIDTH,
  IMAGE_QUALITY,
  MAX_SITES_PROXIMITY,
  TIMEZONE,
} from "@/constants";
import { useRequest } from "@/hooks/use-request";
import { saveCheckInId } from "@/lib/storage";
import {
  createAttendance,
  createGroupId,
  deleteEvidtmp,
  getAttendanceSite,
  getAttendanceStatus,
  uploadEvid,
  uploadEvidGroupId,
  uploadEvidPermanent,
} from "@/services/attendance";
import { useAuthStore } from "@/stores/auth";
import { IAttendanceSite, IAttendanceStatus, THttpErrorResult } from "@/types";
import { compressImage, getDistanceInMeters } from "@/utils/utils";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface IImage {
  uri: string;
  path: string;
  link: string;
}

export default function CheckinScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<IImage[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [siteData, setSiteData] = useState<IAttendanceSite[]>([]);
  const [loadingImage, setLoadingImage] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [checkinStatusId, setCheckinStatusId] = useState<string>("");
  const { user } = useAuthStore();

  const { run: getSite } = useRequest(() =>
    getAttendanceSite({ page: 1, per_page: DEFAULT_PAGE_SIZE }),
  );
  const { run: getStatus } = useRequest(() =>
    getAttendanceStatus({ page: 1, per_page: 100 }),
  );

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const [siteRes, statusRes] = await Promise.all([getSite(), getStatus()]);
        const sites = siteRes.data?.data;
        setSiteData(sites ? sites : []);

        const statuses: IAttendanceStatus[] = statusRes.data?.data || [];
        const checkinStatus = statuses.find(
          (s) => s.code === ATTENDANCE_STATUS_CODE_CHECKIN,
        );
        if (checkinStatus) {
          setCheckinStatusId(checkinStatus.id);
        } else {
          console.error("Check-in status not found in attendance_status table");
        }
      } catch (error) {
        console.error("Error fetching sites:", error);
        setSiteData([]);
      }
    };
    fetchSites();
  }, []);

  const sitesList = useMemo(() => {
    const sites = siteData;
    if (!sites?.length) return [];
    const lat = Number(location?.coords.latitude);
    const lon = Number(location?.coords.longitude);

    if (isNaN(lat) || isNaN(lon)) return [];

    const limitedSites = sites.slice(0, MAX_SITES_PROXIMITY);
    const match = limitedSites.find((s) => {
      return (
        getDistanceInMeters(lat, lon, s.latitude, s.longitude) <= s.tolerance
      );
    });
    return match ? [match] : [];
  }, [siteData, location]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          showToast("Izin lokasi diperlukan", "error");
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (mounted) setLocation(loc);
      } catch (e) {
        console.log("Location error:", e);
      } finally {
        if (mounted) setLoadingLocation(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const pickImage = async (source: "camera" | "gallery") => {
    setLoadingImage(true);
    try {
      const isCamera = source === "camera";
      console.log(`[PickImage] Starting... Source: ${source}`);

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
      console.log(
        `[PickImage] Initial Status: ${status}, CanAskAgain: ${canAskAgain}`,
      );

      // 2. Jika belum ditentukan (Undetermined), minta izin
      if (status === ImagePicker.PermissionStatus.UNDETERMINED) {
        console.log("[PickImage] Requesting Permission...");
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
      console.log("[PickImage] Launching picker...");
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
      console.log("[PickImage] Compressed result:", compressed);

      try {
        const res = await uploadEvid({
          uri: compressed?.uri,
          name: `image-${Date.now()}.jpg`,
          type: "image/jpeg",
        } as any);
        console.log("[PickImage] Upload result:", res);

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

  const removeImage = async (index: number) => {
    try {
      setLoadingImage(true);
      const newImages = [...images];
      const target = images[index];
      if (target?.path) await deleteEvidtmp({ links: [target.path] });
      console.log("Image deleted");
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

  const handleSubmit = async () => {
    // Validasi lokasi GPS
    if (!location) {
      showToast("Tunggu deteksi lokasi...", "info");
      return;
    }

    if (!selectedLocation) {
      showToast("Pilih lokasi terlebih dahulu!", "error");
      return;
    }

    // Validasi gambar wajib minimal 1
    if (images.length === 0) {
      showToast("Upload minimal 1 gambar sebagai bukti!", "error");
      return;
    }

    setLoadingSubmit(true);
    try {
      const group = await createGroupId({
        name: `Attendance ${user?.name}`,
        description: "Attendance evidence",
      });

      const groupId = group.data?.id ?? "";
      console.log("Group ID", groupId);

      for (const img of images) {
        const uploaded = await uploadEvidPermanent({ links: [img.path] });
        const file = uploaded.data?.links?.[0];

        if (!file) continue;
        console.log("File uploaded", file);

        await uploadEvidGroupId({
          name: `Attendance ${user?.name}`,
          description: "Evidence",
          file,
          evidence_group_id: groupId,
        });
      }

      const res = await createAttendance({
        user_id: user?.id ?? "",
        company_id: user?.company_id ?? "",
        contract_id: user?.contract_id ?? "",
        site_id: selectedLocation || "",
        name: "attendance",
        description: notes || "Attendance",
        code: "",
        checkin: new Date().toLocaleString("sv-SE", {
          timeZone: TIMEZONE,
        }),
        attendance_status_id: checkinStatusId,
        evidence_group_id: groupId,
        longitude: location.coords.longitude,
        latitude: location.coords.latitude,
      });
      console.log("Attendance created");

      await saveCheckInId(res.data?.id ?? "");

      showToast("Berhasil Check In!", "success");

      router.replace("/");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(err);
      showToast("Gagal Check In!", "error");
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={["#1e90ff", "#8fd5f5ff"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <SafeAreaView style={styles.headerSafeArea}>
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <ArrowLeft color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Check In</Text>
              <View style={styles.notificationButtonPlaceholder}>
                {/* Spacer for centering title */}
                <View style={{ width: 40 }} />
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.contentContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Map View */}
            <View style={styles.mapContainer}>
              {loadingLocation || !location ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#1e90ff" />
                  <Text style={styles.loadingText}>Mendeteksi lokasi...</Text>
                </View>
              ) : (
                <MapEmbed location={location} />
              )}
              <View style={styles.locationOverlay}>
                <Text style={styles.locationOverlayText}>
                  {location
                    ? `${location.coords.latitude}, ${location.coords.longitude}`
                    : "Menunggu..."}
                </Text>
              </View>
            </View>

            {/* Select Location */}
            <Text style={styles.sectionTitle}>Select Location</Text>

            {sitesList?.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateEmoji}>📍</Text>
                <Text style={styles.emptyStateText}>
                  Tidak ada lokasi absen di sekitar Anda
                </Text>
                <Text style={styles.emptyStateSubText}>
                  Pastikan Anda berada di lokasi yang terdaftar
                </Text>
              </View>
            ) : (
              sitesList?.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.locationOption,
                    selectedLocation === item.id &&
                      styles.locationOptionSelected,
                  ]}
                  onPress={() => setSelectedLocation(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.radioContainer}>
                    <View
                      style={[
                        styles.radioOuter,
                        selectedLocation === item.id &&
                          styles.radioOuterSelected,
                      ]}
                    >
                      {selectedLocation === item.id && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                  </View>
                  <View style={styles.locationTextContainer}>
                    <Text style={styles.locationTitle}>{item.name}</Text>
                    <Text style={styles.locationAddress}>
                      {item.description}
                    </Text>
                    <Text style={styles.locationCoords}>
                      {item.longitude}, {item.latitude}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* Notes */}
            <Text style={styles.sectionTitle}>Notes (opsional)</Text>
            <View style={styles.notesContainer}>
              <TextInput
                style={styles.notesInput}
                placeholder="Add any notes here"
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
                value={notes}
                onChangeText={setNotes}
                textAlignVertical="top"
              />
            </View>

            {/* Upload Gambar */}
            <Text style={styles.sectionTitle}>Upload Gambar</Text>
            <View style={styles.imageGrid}>
              {images.map((image, index) => (
                <View key={index} style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: image.uri }}
                    style={[
                      styles.imagePreview,
                      loadingImage && { opacity: 0.5 },
                    ]}
                  />
                  {!loadingImage && (
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(index)}
                    >
                      <Text style={styles.removeImageText}>✕</Text>
                    </TouchableOpacity>
                  )}
                  {loadingImage && (
                    <View style={styles.imageLoadingOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.uploadButton,
                (loadingImage || loadingSubmit) && styles.uploadButtonDisabled,
              ]}
              onPress={() => setIsModalVisible(true)}
              disabled={loadingImage || loadingSubmit}
            >
              {loadingImage ? (
                <ActivityIndicator
                  size="small"
                  color="#666"
                  style={{ marginRight: 8 }}
                />
              ) : (
                <ImageIcon color="#999" style={styles.uploadButtonIcon} />
              )}
              <Text style={styles.uploadButtonText}>
                {loadingImage ? "Memproses..." : "Tambah Gambar"}
              </Text>
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (loadingSubmit || loadingImage) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loadingSubmit || loadingImage}
            >
              {loadingSubmit ? (
                <ActivityIndicator
                  size="small"
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
              ) : null}
              <Text style={styles.submitButtonText}>
                {loadingSubmit ? "Memproses..." : "Submit check in"}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {/* Image Picker Modal */}
        <Modal
          visible={isModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsModalVisible(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalIndicator} />
              <Text style={styles.modalTitle}>Pilih sumber Gambar</Text>

              <TouchableOpacity
                style={[
                  styles.modalButtonPrimary,
                  { opacity: loadingImage ? 0.7 : 1 },
                ]}
                onPress={() => pickImage("camera")}
                disabled={loadingImage}
              >
                <Text style={styles.modalButtonTextPrimary}>
                  Ambil Dari Kamera
                </Text>
              </TouchableOpacity>

              {/* <TouchableOpacity
                style={[
                  styles.modalButtonSecondary,
                  { opacity: loadingImage ? 0.7 : 1 },
                ]}
                onPress={() => pickImage("gallery")}
                disabled={loadingImage}
              >
                <Text style={styles.modalButtonTextSecondary}>
                  Ambil Dari Galeri
                </Text>
              </TouchableOpacity> */}

              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Kembali</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerGradient: {
    height: 150, // Tinggi gradient
    paddingBottom: 30,
  },
  headerSafeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  notificationButtonPlaceholder: {
    width: 40,
    height: 40,
  },

  contentContainer: {
    flex: 1,
    marginTop: -40, // Overlap dengan header
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  scrollContent: {
    padding: 20,
    paddingTop: 25,
  },

  // Map
  mapContainer: {
    height: 180,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: "#f5f5f5",
    // Shadow for map container
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#666",
  },
  locationOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  locationOverlayText: {
    fontSize: 10,
    color: "#333",
    textAlign: "center",
    fontWeight: "600",
  },

  // Section Title
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 12,
  },

  // Location Options
  locationOption: {
    flexDirection: "row",
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#f0f0f0",
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  locationOptionSelected: {
    borderColor: "#1e90ff",
    backgroundColor: "#f8fbff",
  },
  radioContainer: {
    marginRight: 14,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
  },
  radioOuterSelected: {
    borderColor: "#1e90ff",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1e90ff",
  },
  locationTextContainer: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 12,
    color: "#666",
    marginBottom: 6,
    lineHeight: 18,
  },
  locationCoords: {
    fontSize: 10,
    color: "#999",
  },

  // Info Card
  infoCard: {
    backgroundColor: "#F0F7FF", // Hijau muda/Biru muda yang lembut
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E3F2FD",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  infoDivider: {
    height: 1,
    backgroundColor: "rgba(30, 144, 255, 0.1)",
    marginBottom: 12,
  },
  infoDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },

  // Notes
  notesContainer: {
    backgroundColor: "#fafafa",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    marginBottom: 24,
  },
  notesInput: {
    padding: 16,
    height: 100,
    fontSize: 14,
    color: "#333",
  },

  // Image Upload
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  imagePreviewContainer: {
    width: 100,
    height: 100,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#f0f0f0",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  removeImageButton: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  removeImageText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 16,
    padding: 16,
    marginBottom: 30,
    borderStyle: "dashed",
    backgroundColor: "#fafafa",
  },
  uploadButtonIcon: {
    marginRight: 8,
    fontSize: 18,
  },
  uploadButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },

  // Submit Button
  submitButton: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "#3B82F6", // Modern blue
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "capitalize",
    letterSpacing: 0.5,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  uploadButtonDisabled: {
    opacity: 0.7,
    backgroundColor: "#f5f5f5",
  },
  imageLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: 40,
  },
  modalIndicator: {
    width: 40,
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 24,
    color: "#1a1a1a",
  },
  modalButtonPrimary: {
    backgroundColor: "#3B82F6",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  modalButtonTextPrimary: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  modalButtonSecondary: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "#eee",
  },
  modalButtonTextSecondary: {
    color: "#333",
    fontWeight: "600",
    fontSize: 15,
  },
  modalButtonCancel: {
    backgroundColor: "#f8f9fa",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  modalButtonTextCancel: {
    color: "#666",
    fontWeight: "600",
    fontSize: 15,
  },
  // Empty State
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#f0f0f0",
    marginBottom: 24,
    borderStyle: "dashed",
  },
  emptyStateEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 4,
  },
  emptyStateSubText: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
  },
});
