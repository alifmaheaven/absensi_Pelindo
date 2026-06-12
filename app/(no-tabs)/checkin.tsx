import { ArrowLeft, ImageIcon } from "@/components/icon";
import { MapEmbed } from "@/components/ui/map-embed";
import { useToast } from "@/components/ui/toast";
import {
  ATTENDANCE_STATUS_CODE_CHECKIN,
  DEFAULT_PAGE_SIZE,
  MAX_SITES_PROXIMITY,
  TIMEZONE,
} from "@/constants";
import { useImagePicker } from "@/hooks/useImagePicker";
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
import { getDistanceInMeters } from "@/utils/utils";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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

const imageUploadService = {
  uploadTemp: uploadEvid,
  deleteTemp: deleteEvidtmp,
};

export default function CheckinScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [siteData, setSiteData] = useState<IAttendanceSite[]>([]);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [checkinStatusId, setCheckinStatusId] = useState<string>("");
  const { user } = useAuthStore();
  const {
    images,
    loadingImage,
    isModalVisible,
    pickImage,
    removeImage,
    openModal,
    closeModal,
  } = useImagePicker();

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
        // Try finding checkin status: first by known code, then by name keywords
        let checkinStatus = statuses.find(
          (s) => s.code === ATTENDANCE_STATUS_CODE_CHECKIN,
        );
        if (!checkinStatus) {
          checkinStatus = statuses.find((s) => {
            const name = s.name?.toLowerCase() ?? "";
            const code = s.code?.toLowerCase() ?? "";
            return (
              name.includes("hadir") ||
              name.includes("check") ||
              name.includes("attend") ||
              name.includes("masuk") ||
              code.includes("hadir") ||
              code.includes("checkin") ||
              code.includes("attend") ||
              code.includes("masuk")
            );
          });
        }
        if (!checkinStatus && statuses.length > 0) {
          checkinStatus = statuses[0];
        }
        if (checkinStatus) {
          setCheckinStatusId(checkinStatus.id);
        } else {
          Alert.alert(
            "Error",
            "Attendance status tidak ditemukan. Hubungi admin untuk setup attendance status terlebih dahulu.",
          );
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

    if (isNaN(lat) || isNaN(lon)) return sites.map((s) => ({ ...s, distance: Infinity, inRange: false }));

    const withDistance = sites
      .map((s) => ({
        ...s,
        distance: getDistanceInMeters(lat, lon, s.latitude, s.longitude),
        inRange: getDistanceInMeters(lat, lon, s.latitude, s.longitude) <= s.tolerance,
      }))
      .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_SITES_PROXIMITY);

    return withDistance;
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
        console.debug("Location error:", e);
      } finally {
        if (mounted) setLoadingLocation(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

    // Validasi inRange
    const selectedSite = sitesList.find(s => s.id === selectedLocation);
    if (!selectedSite?.inRange) {
      Alert.alert('Error', 'You must be within range of the selected site to check in.');
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
      console.debug("Group ID", groupId);

      for (const img of images) {
        const uploaded = await uploadEvidPermanent({ links: [img.path] });
        const file = uploaded.data?.links?.[0];

        if (!file) continue;
        console.debug("File uploaded", file);

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
        code: `CHK-${Date.now()}`,
        checkin: new Date().toLocaleString("sv-SE", {
          timeZone: TIMEZONE,
        }),
        attendance_status_id: checkinStatusId,
        evidence_group_id: groupId,
        longitude: location.coords.longitude,
        latitude: location.coords.latitude,
      });
      console.debug("Attendance created");

      await saveCheckInId(res.data?.id ?? "");

      showToast("Berhasil Check In!", "success");

      router.replace("/");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(JSON.stringify(err, null, 2));
      Alert.alert(
        "Gagal Check In",
        err?.message || "Terjadi kesalahan, coba lagi.",
      );
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

            {location && sitesList?.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateEmoji}>📍</Text>
                <Text style={styles.emptyStateText}>
                  Tidak ada lokasi absen terdaftar
                </Text>
                <Text style={styles.emptyStateSubText}>
                  Hubungi admin untuk menambahkan lokasi
                </Text>
              </View>
            ) : (
              sitesList?.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.locationOption,
                    selectedLocation === item.id &&
                      styles.locationOptionSelected,
                    item.inRange === false && styles.locationOptionOutOfRange,
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
                    <View style={styles.locationTitleRow}>
                      <Text style={styles.locationTitle}>{item.name}</Text>
                      {item.inRange === false && (
                        <Text style={styles.outOfRangeBadge}>Di luar jangkauan</Text>
                      )}
                    </View>
                    <Text style={styles.locationAddress}>
                      {item.description}
                    </Text>
                    <Text style={styles.locationCoords}>
                      {item.longitude}, {item.latitude}
                      {item.distance != null && isFinite(item.distance)
                        ? " • " + (item.distance < 1000
                          ? Math.round(item.distance) + " m"
                          : (item.distance / 1000).toFixed(1) + " km")
                        : ""}
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
                maxLength={2000}
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
                      onPress={() => removeImage(index, imageUploadService)}
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
              onPress={() => openModal()}
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
          onRequestClose={() => closeModal()}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => closeModal()}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalIndicator} />
              <Text style={styles.modalTitle}>Pilih sumber Gambar</Text>

              <TouchableOpacity
                style={[
                  styles.modalButtonPrimary,
                  { opacity: loadingImage ? 0.7 : 1 },
                ]}
                onPress={() => pickImage("camera", imageUploadService)}
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
                onPress={() => pickImage("gallery", imageUploadService)}
                disabled={loadingImage}
              >
                <Text style={styles.modalButtonTextSecondary}>
                  Ambil Dari Galeri
                </Text>
              </TouchableOpacity> */}

              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => closeModal()}
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
  locationOptionOutOfRange: {
    opacity: 0.6,
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
  locationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
  },
  outOfRangeBadge: {
    fontSize: 10,
    color: "#e67e22",
    backgroundColor: "#fef3e2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
    fontWeight: "600",
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
