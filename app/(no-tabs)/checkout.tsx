import { ArrowLeft, ImageIcon } from "@/components/icon";
import { MapEmbed } from "@/components/ui/map-embed";
import { FormSkeleton } from "@/components/ui/form-skeleton";
import { useToast } from "@/components/ui/toast";
import {
  IMAGE_BASE_PATH,
  TIMEZONE,
} from "@/constants";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useRequest } from "@/hooks/use-request";
import axios from "@/lib/axios";
import {
  getEvidGroupId,
  updateAttendance,
  uploadEvidPermanent,
  uploadEvidGroupId,
} from "@/services/attendance";
import { getActiveCheckins } from "@/services/ticket";
import { useAuthStore } from "@/stores/auth";
import { IAttendance, THttpErrorResult } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import ImageViewerModal from "@/components/ImageViewerModal";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function CheckoutScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  // --- Location state ---
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const {
    images,
    loadingImage,
    isModalVisible,
    pickImage,
    removeImage,
    openModal,
    closeModal,
    setImages,
  } = useImagePicker();
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // --- State ---
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const submittingRef = useRef(false);
  const [activeCheckin, setActiveCheckin] = useState<IAttendance | null>(null);

  const { run: fetchActiveCheckinsReq } = useRequest(() => getActiveCheckins());

  // Load check-in data on mount
  useEffect(() => {
    const fetchCheckIn = async () => {
      try {
        const res = await fetchActiveCheckinsReq();
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setActiveCheckin(Array.isArray(list) && list.length > 0 ? (list[0] as IAttendance) : null);
      } catch (error) {
        console.error("Error fetching checkIn:", error);
        setActiveCheckin(null);
      }
    };
    fetchCheckIn();
  }, []);

  // Get GPS location
  const requestLocation = async () => {
    setLoadingLocation(true);
    setPermissionDenied(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        setLoadingLocation(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc);
    } catch (e) {
      console.debug("Location error:", e);
      setPermissionDenied(true);
    } finally {
      setLoadingLocation(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => requestLocation());
  }, []);

  // Fetch check-in evidence photos
  useEffect(() => {
    if (!activeCheckin?.evidence_group_id) return;

    (async () => {
      try {
        const evidData = await getEvidGroupId({
          page: 1,
          per_page: 5,
          evidence_group_id_exact: [activeCheckin.evidence_group_id],
        });
        const evidences = evidData?.data?.data?.filter(
          (e) => e.evidence_group_id === activeCheckin.evidence_group_id,
        );
        if (evidences?.length) {
          setImages(
            evidences.map((e) => ({
              uri: new URL(`${IMAGE_BASE_PATH}${e.file}`, BASE_URL).toString(),
              path: e.file,
              link: e.file,
              id: e.id,
            })),
          );
        }
      } catch (error) {
        console.error(error);
      }
    })();
  }, [activeCheckin]);

  // Upload service adapter for useImagePicker
  const uploadService = {
    uploadTemp: async (file: { uri: string; name: string; type: string }) => {
      const formData = new FormData();
      formData.append("files", {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);
      const response = await axios.post("/attendance/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    },
    deleteTemp: async (payload: { links: string[] }) => {
      // no-op for temp deletion
    },
  };

  // Filter existing (check-in) vs new (check-out) images
  const existingCheckinImages = images.filter((img) => !!img.id);
  const newCheckoutImages = images.filter((img) => !img.id);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!location) {
      showToast("Tunggu deteksi lokasi...", "info");
      return;
    }

    // Wajib melampirkan minimal 1 gambar kedua (evidence checkout baru)
    if (newCheckoutImages.length === 0) {
      showToast("Wajib melampirkan foto bukti check out baru melalui kamera!", "error");
      return;
    }

    if (!activeCheckin?.id) {
      showToast("Data check-in tidak ditemukan!", "error");
      return;
    }

    // Lolos validasi → kunci submit
    submittingRef.current = true;
    setLoadingSubmit(true);
    try {
      const groupId = activeCheckin?.evidence_group_id ?? "";

      // Upload ONLY new checkout evidence to group
      for (const img of newCheckoutImages) {
        const uploaded = await uploadEvidPermanent({ links: [img.path] });
        const file = uploaded.data?.links?.[0];
        if (file) {
          await uploadEvidGroupId({
            name: `Attendance ${user?.name}`,
            description: "Checkout Evidence",
            file,
            evidence_group_id: groupId,
          });
        }
      }

      // Build updated description without removing check-in notes
      let finalDescription = activeCheckin?.description || "";
      if (checkoutNotes.trim()) {
        finalDescription = finalDescription
          ? `${finalDescription}\n[Check Out]: ${checkoutNotes.trim()}`
          : `[Check Out]: ${checkoutNotes.trim()}`;
      }

      // Update attendance checkout with GPS location + notes
      await updateAttendance({
        id: activeCheckin.id,
        checkout: new Date().toLocaleString("sv-SE", { timeZone: TIMEZONE }),
        ...(finalDescription ? { description: finalDescription } : {}),
        ...(location ? {
          checkout_longitude: location.coords.longitude,
          checkout_latitude: location.coords.latitude,
        } : {}),
      });

      showToast("Berhasil Check Out!", "success");
      router.replace("/");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(err);
      showToast("Gagal Check Out!", "error");
    } finally {
      setLoadingSubmit(false);
      submittingRef.current = false;
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
              <Text style={styles.headerTitle}>Check Out</Text>
              <View style={styles.notificationButtonPlaceholder}>
                <View style={{ width: 40 }} />
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.contentContainer}>
          {loadingLocation ? (
            <FormSkeleton />
          ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Map */}
            <View style={styles.mapContainer}>
              {!location ? (
                permissionDenied ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.locationDeniedEmoji}>📍</Text>
                    <Text style={styles.locationDeniedTitle}>
                      Izin lokasi diperlukan
                    </Text>
                    <Text style={styles.locationDeniedText}>
                      Aktifkan izin lokasi untuk melakukan check-out
                    </Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={requestLocation}
                    >
                      <Text style={styles.retryButtonText}>Coba Lagi</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.settingsButton}
                      onPress={() => Linking.openSettings()}
                    >
                      <Text style={styles.settingsButtonText}>
                        Buka Pengaturan
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1e90ff" />
                    <Text style={styles.loadingText}>Mendeteksi lokasi...</Text>
                  </View>
                )
              ) : (
                <MapEmbed location={location} />
              )}
              <View style={styles.locationOverlay}>
                <Text style={styles.locationOverlayText}>{location ? `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}` : "Menunggu..."}</Text>
              </View>
            </View>

            {/* Location Info — from check-in record (Read-Only) */}
            <Text style={styles.sectionTitle}>Lokasi Check In</Text>
            {activeCheckin ? (
              <View style={[styles.locationOption, styles.locationOptionSelected]}>
                <View style={styles.locationIconContainer}>
                  <Text style={{ fontSize: 22 }}>📍</Text>
                </View>
                <View style={styles.locationTextContainer}>
                  <Text style={styles.locationTitle}>{activeCheckin?.name || activeCheckin?.code || "Site"}</Text>
                  <Text style={styles.locationCoords}>
                    {activeCheckin.latitude}, {activeCheckin.longitude}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateEmoji}>📍</Text>
                <Text style={styles.emptyStateText}>
                  Data check-in tidak ditemukan
                </Text>
              </View>
            )}

            {/* Catatan Check In (Read-Only) */}
            <Text style={styles.sectionTitle}>Catatan Check In (Terkunci)</Text>
            <View style={styles.readOnlyCard}>
              <Text style={styles.readOnlyText}>
                {activeCheckin?.description?.trim()
                  ? activeCheckin.description
                  : "Tidak ada catatan saat check in"}
              </Text>
            </View>

            {/* Catatan Check Out (opsional) */}
            <Text style={styles.sectionTitle}>Catatan Check Out (opsional)</Text>
            <View style={styles.notesContainer}>
              <TextInput
                style={styles.notesInput}
                placeholder="Tambahkan catatan check out di sini"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                value={checkoutNotes}
                onChangeText={setCheckoutNotes}
                textAlignVertical="top"
                maxLength={2000}
              />
            </View>

            {/* Foto Bukti Check In (Tersimpan - Tidak bisa dihapus) */}
            <Text style={styles.sectionTitle}>Bukti Foto Check In (Tersimpan)</Text>
            {existingCheckinImages.length > 0 ? (
              <View style={styles.imageGrid}>
                {existingCheckinImages.map((image, index) => (
                  <View key={`checkin-img-${image.id || index}`} style={styles.imagePreviewContainer}>
                    <TouchableOpacity onPress={() => setPreviewImage(image.uri)}>
                      <Image
                        source={{ uri: image.uri }}
                        style={styles.imagePreview}
                      />
                    </TouchableOpacity>
                    <View style={styles.imageLockedBadge}>
                      <Text style={styles.imageLockedText}>🔒 Check In</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyEvidenceCard}>
                <Text style={styles.emptyEvidenceText}>Tidak ada foto bukti check in tersimpan</Text>
              </View>
            )}

            {/* Foto Bukti Check Out (Wajib - Hanya via Kamera) */}
            <View style={styles.requiredSectionHeader}>
              <Text style={styles.sectionTitle}>Bukti Foto Check Out</Text>
              <Text style={styles.requiredBadge}>* Wajib (Kamera)</Text>
            </View>

            {newCheckoutImages.length > 0 && (
              <View style={styles.imageGrid}>
                {newCheckoutImages.map((image, index) => {
                  const fullIndex = images.findIndex((img) => img === image);
                  return (
                    <View key={`checkout-new-${image.path || index}`} style={styles.imagePreviewContainer}>
                      <TouchableOpacity onPress={() => setPreviewImage(image.uri)}>
                        <Image
                          source={{ uri: image.uri }}
                          style={[
                            styles.imagePreview,
                            loadingImage && { opacity: 0.5 },
                          ]}
                        />
                      </TouchableOpacity>
                      {!loadingImage && (
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => removeImage(fullIndex, uploadService)}
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
                  );
                })}
              </View>
            )}

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
                {loadingImage ? "Memproses..." : "Tambah Foto Check Out"}
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
                {loadingSubmit ? "Memproses..." : "Submit check out"}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
        </View>

        {/* Image Picker Modal (Gallery option hidden - Camera only) */}
        <Modal
          visible={isModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={closeModal}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={closeModal}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalIndicator} />
              <Text style={styles.modalTitle}>Pilih sumber Gambar</Text>

              <TouchableOpacity
                style={[
                  styles.modalButtonPrimary,
                  { opacity: loadingImage ? 0.7 : 1 },
                ]}
                onPress={() => pickImage("camera", uploadService)}
                disabled={loadingImage}
              >
                <Text style={styles.modalButtonTextPrimary}>
                  Ambil Dari Kamera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={closeModal}
              >
                <Text style={styles.modalButtonTextCancel}>Kembali</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Image Preview Modal */}
        <ImageViewerModal visible={!!previewImage} uri={previewImage} onClose={() => setPreviewImage(null)} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerGradient: { height: 150, paddingBottom: 30 },
  headerSafeArea: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 10 },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  notificationButtonPlaceholder: { width: 40, height: 40 },
  contentContainer: { flex: 1, marginTop: -40, backgroundColor: "#ffffff", borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: "hidden" },
  scrollContent: { padding: 20, paddingTop: 25 },
  mapContainer: { height: 180, borderRadius: 20, overflow: "hidden", marginBottom: 24, backgroundColor: "#f5f5f5", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  map: { width: "100%", height: "100%" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#666" },
  locationDeniedEmoji: { fontSize: 40, marginBottom: 10 },
  locationDeniedTitle: { fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 4 },
  locationDeniedText: { fontSize: 13, color: "#999", textAlign: "center", marginBottom: 16, paddingHorizontal: 20 },
  retryButton: { backgroundColor: "#3B82F6", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginBottom: 10 },
  retryButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  settingsButton: { paddingVertical: 10, paddingHorizontal: 24 },
  settingsButtonText: { color: "#3B82F6", fontWeight: "600", fontSize: 14 },
  locationOverlay: { position: "absolute", bottom: 10, left: 10, right: 10, backgroundColor: "rgba(255, 255, 255, 0.95)", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  locationOverlayText: { fontSize: 10, color: "#333", textAlign: "center", fontWeight: "600" },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: "#1a1a1a", marginBottom: 10 },
  requiredSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  requiredBadge: { fontSize: 12, fontWeight: "700", color: "#E53935" },
  locationOption: { flexDirection: "row", padding: 16, borderWidth: 1.5, borderColor: "#f0f0f0", borderRadius: 16, marginBottom: 20, backgroundColor: "#fff" },
  locationOptionSelected: { borderColor: "#1e90ff", backgroundColor: "#f8fbff" },
  locationIconContainer: { marginRight: 14, marginTop: 2, width: 36, height: 36, borderRadius: 18, backgroundColor: "#e9f0ff", justifyContent: "center", alignItems: "center" },
  locationTextContainer: { flex: 1 },
  locationTitle: { fontSize: 14, fontWeight: "bold", color: "#333", marginBottom: 4 },
  locationCoords: { fontSize: 10, color: "#999" },
  readOnlyCard: { backgroundColor: "#f8f9fa", borderRadius: 14, borderWidth: 1, borderColor: "#e9ecef", padding: 14, marginBottom: 20 },
  readOnlyText: { fontSize: 13, color: "#495057", lineHeight: 18 },
  notesContainer: { backgroundColor: "#fafafa", borderRadius: 16, borderWidth: 1, borderColor: "#f0f0f0", marginBottom: 20 },
  notesInput: { padding: 14, height: 80, fontSize: 14, color: "#333" },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  imagePreviewContainer: { width: 100, height: 100, borderRadius: 16, overflow: "hidden", position: "relative", backgroundColor: "#f0f0f0" },
  imagePreview: { width: "100%", height: "100%" },
  imageLockedBadge: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(30, 144, 255, 0.88)", paddingVertical: 4, alignItems: "center", justifyContent: "center" },
  imageLockedText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  emptyEvidenceCard: { backgroundColor: "#fafafa", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: "#f0f0f0" },
  emptyEvidenceText: { fontSize: 12, color: "#999" },
  removeImageButton: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.55)", width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#fff" },
  removeImageText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  uploadButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#1e90ff", borderRadius: 16, padding: 16, marginBottom: 24, borderStyle: "dashed", backgroundColor: "#f8fbff" },
  uploadButtonIcon: { marginRight: 8, fontSize: 18 },
  uploadButtonText: { fontSize: 14, color: "#1e90ff", fontWeight: "700" },
  submitButton: { display: "flex", flexDirection: "row", justifyContent: "center", backgroundColor: "#3B82F6", borderRadius: 16, paddingVertical: 18, alignItems: "center", shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", textTransform: "capitalize", letterSpacing: 0.5 },
  submitButtonDisabled: { opacity: 0.7 },
  uploadButtonDisabled: { opacity: 0.7, backgroundColor: "#f5f5f5" },
  imageLoadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40 },
  modalIndicator: { width: 40, height: 4, backgroundColor: "#e0e0e0", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center", marginBottom: 24, color: "#1a1a1a" },
  modalButtonPrimary: { backgroundColor: "#3B82F6", padding: 18, borderRadius: 16, alignItems: "center", marginBottom: 12 },
  modalButtonTextPrimary: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  modalButtonCancel: { backgroundColor: "#f8f9fa", padding: 18, borderRadius: 16, alignItems: "center" },
  modalButtonTextCancel: { color: "#666", fontWeight: "600", fontSize: 15 },
  emptyStateContainer: { alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#f0f0f0", marginBottom: 24, borderStyle: "dashed" },
  emptyStateEmoji: { fontSize: 40, marginBottom: 10 },
  emptyStateText: { fontSize: 16, fontWeight: "bold", color: "#333", textAlign: "center", marginBottom: 4 },
});
