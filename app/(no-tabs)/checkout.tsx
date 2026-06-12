import { ArrowLeft, ImageIcon } from "@/components/icon";
import { MapEmbed } from "@/components/ui/map-embed";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_PAGE_SIZE,
  IMAGE_BASE_PATH,
  TIMEZONE,
} from "@/constants";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useLocationCheck } from "@/hooks/useLocationCheck";
import { useRequest } from "@/hooks/use-request";
import {
  deleteEvid,
  getAttendanceList,
  getEvidGroupId,
  updateAttendance,
  uploadEvid,
  uploadEvidPermanent,
  uploadEvidGroupId,
} from "@/services/attendance";
import { useAuthStore } from "@/stores/auth";
import { IAttendance, THttpErrorResult } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
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

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function CheckoutScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  // --- Hooks ---
  const {
    location,
    loadingLocation,
    nearbySites,
    selectedLocation,
    setSelectedLocation,
    locationString,
  } = useLocationCheck();

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

  // --- State ---
  const [notes, setNotes] = useState("");
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [checkInData, setCheckInData] = useState<IAttendance[]>([]);
  const [removedImages, setRemovedImages] = useState<Array<{ id: string | null; path: string }>>([]);

  const { run: getCheckIn } = useRequest(() =>
    getAttendanceList({
      page: 1,
      per_page: DEFAULT_PAGE_SIZE,
      order_by_desc: ["created_at"],
      user_id_exact: [user?.id ?? ""],
    }),
  );

  // Find today's check-in record
  const checkInDataById = useMemo(() => {
    if (!checkInData?.length) return null;
    const today = new Date().toISOString().split("T")[0];
    return checkInData.find((c) => c.created_at?.split(" ")[0] === today) || null;
  }, [checkInData]);

  // Load check-in data + evidence on mount
  useEffect(() => {
    const fetchCheckIn = async () => {
      try {
        const res = await getCheckIn();
        setCheckInData(res.data?.data || []);
      } catch (error) {
        console.error("Error fetching checkIn:", error);
        setCheckInData([]);
      }
    };
    fetchCheckIn();
  }, []);

  useEffect(() => {
    if (!checkInDataById) return;
    setSelectedLocation(checkInDataById.site_id);
    setNotes(checkInDataById.description || "");

    (async () => {
      try {
        const evidData = await getEvidGroupId({
          page: 1,
          per_page: 5,
          evidence_group_id_exact: [checkInDataById.evidence_group_id],
        });
        const evidences = evidData?.data?.data?.filter(
          (e) => e.evidence_group_id === checkInDataById.evidence_group_id,
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
  }, [checkInDataById]);

  // Upload service adapter for useImagePicker
  const uploadService = {
    uploadTemp: async (file: any) => uploadEvid(file),
    deleteTemp: async (payload: { links: string[] }) => {
      // no-op for temp deletion
    },
  };

  const handleRemoveImage = async (index: number) => {
    const target = images[index];
    if (target?.id) {
      setRemovedImages((prev) => [...prev, { id: target.id as string, path: target.path }]);
    }
    await removeImage(index, uploadService);
  };

  const handleSubmit = async () => {
    if (!location) {
      showToast("Tunggu deteksi lokasi...", "info");
      return;
    }
    if (!selectedLocation) {
      showToast("Pilih lokasi terlebih dahulu!", "error");
      return;
    }
    if (images.length === 0) {
      showToast("Upload minimal 1 gambar sebagai bukti!", "error");
      return;
    }
    if (!checkInDataById?.id) {
      showToast("Data check-in tidak ditemukan!", "error");
      return;
    }

    setLoadingSubmit(true);
    try {
      const groupId = checkInDataById?.evidence_group_id ?? "";

      // Delete removed evidence
      for (const img of removedImages) {
        if (img.id) {
          try { await deleteEvid({ id: img.id }); } catch { /* continue */ }
        }
      }

      // Upload new evidence
      for (const img of images) {
        if (!img.id) {
          const uploaded = await uploadEvidPermanent({ links: [img.path] });
          const file = uploaded.data?.links?.[0];
          if (file) {
            await uploadEvidGroupId({
              name: `Attendance ${user?.name}`,
              description: "Evidence",
              file,
              evidence_group_id: groupId,
            });
          }
        }
      }

      // Update attendance checkout
      await updateAttendance({
        id: checkInDataById?.id!,
        checkout: new Date().toLocaleString("sv-SE", { timeZone: TIMEZONE }),
      });

      showToast("Berhasil Check Out!", "success");
      router.replace("/");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(err);
      showToast("Gagal Check Out!", "error");
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
              <Text style={styles.headerTitle}>Check Out</Text>
              <View style={styles.notificationButtonPlaceholder}>
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
            {/* Map */}
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
                <Text style={styles.locationOverlayText}>{locationString}</Text>
              </View>
            </View>

            {/* Location Selection */}
            <Text style={styles.sectionTitle}>Select Location</Text>
            {nearbySites.length === 0 ? (
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
              nearbySites.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.locationOption,
                    selectedLocation === item.id && styles.locationOptionSelected,
                  ]}
                  onPress={() => setSelectedLocation(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.radioContainer}>
                    <View
                      style={[
                        styles.radioOuter,
                        selectedLocation === item.id && styles.radioOuterSelected,
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
                maxLength={2000}
              />
            </View>

            {/* Image Upload */}
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
                      onPress={() => handleRemoveImage(index)}
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
              onPress={openModal}
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

            {/* Submit */}
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
        </View>

        {/* Image Picker Modal */}
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
                style={[styles.modalButtonPrimary, { opacity: loadingImage ? 0.7 : 1 }]}
                onPress={() => pickImage("camera", uploadService)}
                disabled={loadingImage}
              >
                <Text style={styles.modalButtonTextPrimary}>Ambil Dari Kamera</Text>
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
  locationOverlay: { position: "absolute", bottom: 10, left: 10, right: 10, backgroundColor: "rgba(255, 255, 255, 0.95)", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  locationOverlayText: { fontSize: 10, color: "#333", textAlign: "center", fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1a1a1a", marginBottom: 12 },
  locationOption: { flexDirection: "row", padding: 16, borderWidth: 1.5, borderColor: "#f0f0f0", borderRadius: 16, marginBottom: 12, backgroundColor: "#fff" },
  locationOptionSelected: { borderColor: "#1e90ff", backgroundColor: "#f8fbff" },
  radioContainer: { marginRight: 14, marginTop: 2 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#d1d5db", justifyContent: "center", alignItems: "center" },
  radioOuterSelected: { borderColor: "#1e90ff" },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#1e90ff" },
  locationTextContainer: { flex: 1 },
  locationTitle: { fontSize: 14, fontWeight: "bold", color: "#333", marginBottom: 4 },
  locationAddress: { fontSize: 12, color: "#666", marginBottom: 6, lineHeight: 18 },
  locationCoords: { fontSize: 10, color: "#999" },
  infoCard: { backgroundColor: "#F0F7FF", borderRadius: 16, padding: 20, marginBottom: 24, marginTop: 8, borderWidth: 1, borderColor: "#E3F2FD" },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  infoIcon: { fontSize: 16, marginRight: 8 },
  infoTitle: { fontSize: 15, fontWeight: "bold", color: "#1a1a1a" },
  infoDivider: { height: 1, backgroundColor: "rgba(30, 144, 255, 0.1)", marginBottom: 12 },
  infoDetailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  infoLabel: { fontSize: 14, color: "#666" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#333" },
  notesContainer: { backgroundColor: "#fafafa", borderRadius: 16, borderWidth: 1, borderColor: "#f0f0f0", marginBottom: 24 },
  notesInput: { padding: 16, height: 100, fontSize: 14, color: "#333" },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  imagePreviewContainer: { width: 100, height: 100, borderRadius: 16, overflow: "hidden", position: "relative", backgroundColor: "#f0f0f0" },
  imagePreview: { width: "100%", height: "100%" },
  removeImageButton: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.5)", width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#fff" },
  removeImageText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  uploadButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: 16, padding: 16, marginBottom: 30, borderStyle: "dashed", backgroundColor: "#fafafa" },
  uploadButtonIcon: { marginRight: 8, fontSize: 18 },
  uploadButtonText: { fontSize: 14, color: "#666", fontWeight: "600" },
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
  modalButtonSecondary: { backgroundColor: "#fff", padding: 18, borderRadius: 16, alignItems: "center", marginBottom: 12, borderWidth: 1.5, borderColor: "#eee" },
  modalButtonTextSecondary: { color: "#333", fontWeight: "600", fontSize: 15 },
  modalButtonCancel: { backgroundColor: "#f8f9fa", padding: 18, borderRadius: 16, alignItems: "center" },
  modalButtonTextCancel: { color: "#666", fontWeight: "600", fontSize: 15 },
  emptyStateContainer: { alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#f0f0f0", marginBottom: 24, borderStyle: "dashed" },
  emptyStateEmoji: { fontSize: 40, marginBottom: 10 },
  emptyStateText: { fontSize: 16, fontWeight: "bold", color: "#333", textAlign: "center", marginBottom: 4 },
  emptyStateSubText: { fontSize: 13, color: "#999", textAlign: "center" },
});
