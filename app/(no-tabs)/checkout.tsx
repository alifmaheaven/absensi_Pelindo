import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
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
  getAttendanceList,
  updateAttendance,
  uploadEvidPermanent,
  uploadEvidGroupId,
} from "@/services/attendance";
import { getActiveCheckins } from "@/services/ticket";
import { useAuthStore } from "@/stores/auth";
import { IAttendance, THttpErrorResult } from "@/types";
import { parseWIBDate } from "@/utils/utils";
import NetInfo from "@react-native-community/netinfo";
import { queueOfflineCheckOut } from "@/lib/offlineQueue";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState , useMemo } from "react";
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
import ImageViewerModal from "@/components/ImageViewerModal";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function CheckoutScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const params = useLocalSearchParams<{ attendance_id?: string }>();
  const { run: fetchActiveCheckinsReq } = useRequest(() => getActiveCheckins());

  // Load check-in data on mount dengan pertahanan berlapis (D89.2)
  useEffect(() => {
    const fetchCheckIn = async () => {
      // 1. Coba dari /attendance/active-checkins
      try {
        const res = await fetchActiveCheckinsReq();
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        if (Array.isArray(list) && list.length > 0) {
          if (params.attendance_id) {
            const matched = list.find((item: any) => item.id === params.attendance_id);
            if (matched) {
              setActiveCheckin(matched as IAttendance);
              return;
            }
          }
          setActiveCheckin(list[0] as IAttendance);
          return;
        }
      } catch (error) {
        console.error("Error fetching checkIn from active-checkins:", error);
      }

      // 2. Pertahanan berlapis (D89.2): Fallback ke getAttendanceList jika kosong
      // (mis. backend lama dengan filter checkin::date = today atau koneksi belum ter-refresh)
      try {
        const userId = user?.id || useAuthStore.getState().user?.id;
        if (userId) {
          const attRes = await getAttendanceList({
            page: 1,
            per_page: 5,
            order_by_desc: ["created_at"],
            user_id_exact: [userId],
          });
          const attList: IAttendance[] = attRes.data?.data || [];

          // Prioritaskan yang cocok dengan attendance_id dari parameter rute
          if (params.attendance_id) {
            const matched = attList.find((c) => c.id === params.attendance_id && !c.checkout);
            if (matched) {
              setActiveCheckin(matched);
              return;
            }
          }

          // Cari record terakhir yang belum checkout dalam rentang <= 18 jam
          const candidate = attList.find((c) => c.checkin && !c.checkout);
          if (candidate?.checkin) {
            const parsed = parseWIBDate(candidate.checkin);
            if (parsed) {
              const elapsedHours = (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
              if (elapsedHours >= 0 && elapsedHours <= 18) {
                setActiveCheckin(candidate);
                return;
              }
            }
          }
        }
      } catch (fallbackError) {
        console.error("Error in fallback attendance fetch:", fallbackError);
      }

      setActiveCheckin(null);
    };
    fetchCheckIn();
  }, [params.attendance_id, user?.id]);

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
      if (loc.mocked) {
        setLocation(null);
        Alert.alert(
          "Peringatan Keamanan",
          "Terdeteksi Penggunaan Fake GPS / Mock Location. Harap matikan aplikasi Fake GPS dan nonaktifkan fitur Mock Location di Pengaturan Pengembang (Developer Options) perangkat Anda untuk melanjutkan absensi."
        );
        return;
      }
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
      const response = await axios.post("/api/v2/attendance/upload", formData, {
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

    if (location.mocked) {
      Alert.alert(
        "Peringatan Keamanan",
        "Terdeteksi Penggunaan Fake GPS / Mock Location. Harap matikan aplikasi Fake GPS untuk melanjutkan."
      );
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

    const checkoutTimeStr = new Date().toLocaleString("sv-SE", { timeZone: TIMEZONE });
    let finalDescription = activeCheckin?.description || "";
    if (checkoutNotes.trim()) {
      finalDescription = finalDescription
        ? `${finalDescription}\n[Check Out]: ${checkoutNotes.trim()}`
        : `[Check Out]: ${checkoutNotes.trim()}`;
    }

    try {
      const netState = await NetInfo.fetch();
      const isOffline = !netState.isConnected || !netState.isInternetReachable;

      if (isOffline) {
        await queueOfflineCheckOut({
          attendance_id: activeCheckin.id,
          user_name: user?.name || "User",
          evidence_group_id: activeCheckin.evidence_group_id,
          checkout: checkoutTimeStr,
          checkout_latitude: location.coords.latitude,
          checkout_longitude: location.coords.longitude,
          description: finalDescription,
          localImages: newCheckoutImages.map((img) => ({
            uri: img.uri,
            name: img.path || `checkout_${Date.now()}.jpg`,
            type: "image/jpeg",
          })),
        });

        Alert.alert(
          "Check Out Tersimpan Offline",
          "Koneksi internet tidak terdeteksi. Data kepulangan dan foto bukti Anda telah disimpan di perangkat dan akan disinkronkan saat terhubung kembali ke internet.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
        return;
      }

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

      // Update attendance checkout with GPS location + notes
      await updateAttendance({
        id: activeCheckin.id,
        checkout: checkoutTimeStr,
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

      // Fallback offline queue
      try {
        await queueOfflineCheckOut({
          attendance_id: activeCheckin.id,
          user_name: user?.name || "User",
          evidence_group_id: activeCheckin.evidence_group_id,
          checkout: checkoutTimeStr,
          checkout_latitude: location.coords.latitude,
          checkout_longitude: location.coords.longitude,
          description: finalDescription,
          localImages: newCheckoutImages.map((img) => ({
            uri: img.uri,
            name: img.path || `checkout_${Date.now()}.jpg`,
            type: "image/jpeg",
          })),
        });

        Alert.alert(
          "Check Out Tersimpan Offline",
          "Koneksi jaringan terputus saat pengiriman. Data check out telah disimpan secara aman di perangkat dan akan dikirim saat koneksi online kembali.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
        return;
      } catch {}

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
          colors={[colors.primary, colors.background]}
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
                    <ActivityIndicator size="large" color={colors.primary} />
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
                placeholderTextColor={colors.textMuted}
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
                  color={colors.textSecondary}
                  style={{ marginRight: 8 }}
                />
              ) : (
                <ImageIcon color={colors.textMuted} style={styles.uploadButtonIcon} />
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  headerGradient: { height: 150, paddingBottom: 30 },
  headerSafeArea: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 10 },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: c.onGradient },
  notificationButtonPlaceholder: { width: 40, height: 40 },
  contentContainer: { flex: 1, marginTop: -40, backgroundColor: c.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: "hidden" },
  scrollContent: { padding: 20, paddingTop: 25 },
  mapContainer: { height: 180, borderRadius: 20, overflow: "hidden", marginBottom: 24, backgroundColor: c.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  map: { width: "100%", height: "100%" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: c.textSecondary },
  locationDeniedEmoji: { fontSize: 40, marginBottom: 10 },
  locationDeniedTitle: { fontSize: 16, fontWeight: "bold", color: c.text, marginBottom: 4 },
  locationDeniedText: { fontSize: 13, color: c.textMuted, textAlign: "center", marginBottom: 16, paddingHorizontal: 20 },
  retryButton: { backgroundColor: c.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginBottom: 10 },
  retryButtonText: { color: c.onGradient, fontWeight: "bold", fontSize: 14 },
  settingsButton: { paddingVertical: 10, paddingHorizontal: 24 },
  settingsButtonText: { color: c.primary, fontWeight: "600", fontSize: 14 },
  locationOverlay: { position: "absolute", bottom: 10, left: 10, right: 10, backgroundColor: "rgba(255, 255, 255, 0.95)", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  locationOverlayText: { fontSize: 10, color: c.text, textAlign: "center", fontWeight: "600" },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: c.textStrong, marginBottom: 10 },
  requiredSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  requiredBadge: { fontSize: 12, fontWeight: "700", color: c.danger },
  locationOption: { flexDirection: "row", padding: 16, borderWidth: 1.5, borderColor: c.border, borderRadius: 16, marginBottom: 20, backgroundColor: c.card },
  locationOptionSelected: { borderColor: c.primary, backgroundColor: c.primarySoft },
  locationIconContainer: { marginRight: 14, marginTop: 2, width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, justifyContent: "center", alignItems: "center" },
  locationTextContainer: { flex: 1 },
  locationTitle: { fontSize: 14, fontWeight: "bold", color: c.text, marginBottom: 4 },
  locationCoords: { fontSize: 10, color: c.textMuted },
  readOnlyCard: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.borderStrong, padding: 14, marginBottom: 20 },
  readOnlyText: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
  notesContainer: { backgroundColor: c.inputBg, borderRadius: 16, borderWidth: 1, borderColor: c.border, marginBottom: 20 },
  notesInput: { padding: 14, height: 80, fontSize: 14, color: c.text },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  imagePreviewContainer: { width: 100, height: 100, borderRadius: 16, overflow: "hidden", position: "relative", backgroundColor: c.border },
  imagePreview: { width: "100%", height: "100%" },
  imageLockedBadge: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(30, 144, 255, 0.88)", paddingVertical: 4, alignItems: "center", justifyContent: "center" },
  imageLockedText: { color: c.onGradient, fontSize: 9, fontWeight: "700" },
  emptyEvidenceCard: { backgroundColor: c.inputBg, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: c.border },
  emptyEvidenceText: { fontSize: 12, color: c.textMuted },
  removeImageButton: { position: "absolute", top: 6, right: 6, backgroundColor: c.overlay, width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: c.onGradient },
  removeImageText: { color: c.onGradient, fontSize: 10, fontWeight: "bold" },
  uploadButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.primary, borderRadius: 16, padding: 16, marginBottom: 24, borderStyle: "dashed", backgroundColor: c.primarySoft },
  uploadButtonIcon: { marginRight: 8, fontSize: 18 },
  uploadButtonText: { fontSize: 14, color: c.primary, fontWeight: "700" },
  submitButton: { display: "flex", flexDirection: "row", justifyContent: "center", backgroundColor: c.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center", shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  submitButtonText: { color: c.onGradient, fontSize: 16, fontWeight: "bold", textTransform: "capitalize", letterSpacing: 0.5 },
  submitButtonDisabled: { opacity: 0.7 },
  uploadButtonDisabled: { opacity: 0.7, backgroundColor: c.surface },
  imageLoadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  modalContent: { backgroundColor: c.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40 },
  modalIndicator: { width: 40, height: 4, backgroundColor: c.border, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center", marginBottom: 24, color: c.textStrong },
  modalButtonPrimary: { backgroundColor: c.primary, padding: 18, borderRadius: 16, alignItems: "center", marginBottom: 12 },
  modalButtonTextPrimary: { color: c.onGradient, fontWeight: "bold", fontSize: 15 },
  modalButtonCancel: { backgroundColor: c.surface, padding: 18, borderRadius: 16, alignItems: "center" },
  modalButtonTextCancel: { color: c.textSecondary, fontWeight: "600", fontSize: 15 },
  emptyStateContainer: { alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, marginBottom: 24, borderStyle: "dashed" },
  emptyStateEmoji: { fontSize: 40, marginBottom: 10 },
  emptyStateText: { fontSize: 16, fontWeight: "bold", color: c.text, textAlign: "center", marginBottom: 4 },
});
