import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, ImageIcon, InfoOutlineRounded } from "@/components/icon";
import { MapEmbed } from "@/components/ui/map-embed";
import { FormSkeleton } from "@/components/ui/form-skeleton";
import { useToast } from "@/components/ui/toast";
import {
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
import { getActiveCheckins } from "@/services/ticket";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/auth";
import { IAttendanceSite, IAttendanceStatus, THttpErrorResult } from "@/types";
import { getDistanceInMeters } from "@/utils/utils";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

import NetInfo from "@react-native-community/netinfo";
import {
  cacheSites,
  getCachedSites,
  cacheAttendanceStatuses,
  getCachedAttendanceStatuses,
  queueOfflineCheckIn,
} from "@/lib/offlineQueue";

const imageUploadService = {
  uploadTemp: uploadEvid,
  deleteTemp: deleteEvidtmp,
};

export default function CheckinScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { showToast } = useToast();
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [siteData, setSiteData] = useState<IAttendanceSite[]>([]);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const submittingRef = useRef(false);
  const [checkinStatusId, setCheckinStatusId] = useState<string>("");
  const [statusList, setStatusList] = useState<IAttendanceStatus[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { run: getSite } = useRequest(() =>
    getAttendanceSite({
      page: 1,
      per_page: 100,
      ...(user?.company_id ? { company_id_exact: [user?.company_id] } : {}),
      ...(user?.site_id ? { site_id_exact: [user?.site_id] } : {}),
    }),
  );
  const { run: getStatus } = useRequest(() =>
    getAttendanceStatus({ page: 1, per_page: 100 }),
  );

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const [siteRes, statusRes] = await Promise.allSettled([getSite(), getStatus()]);
        let sites: IAttendanceSite[] = [];
        if (siteRes.status === "fulfilled" && siteRes.value?.data?.data?.length) {
          sites = siteRes.value.data.data;
          await cacheSites(sites);
        } else {
          sites = await getCachedSites();
        }
        setSiteData(sites || []);

        let statuses: IAttendanceStatus[] = [];
        if (statusRes.status === "fulfilled" && statusRes.value?.data?.data?.length) {
          statuses = statusRes.value.data.data;
          await cacheAttendanceStatuses(statuses);
        } else {
          statuses = await getCachedAttendanceStatuses();
        }
        setStatusList(statuses || []);

        // Find checkin status by exact code (ATST001 = Attend)
        const checkinStatus = statuses.find(
          (s) => s.name?.toLowerCase() === "attend" || s.code === "ATST001",
        );
        if (checkinStatus) {
          setCheckinStatusId(checkinStatus.id);
        } else if (statuses.length > 0) {
          setCheckinStatusId(statuses[0].id);
        } else {
          setCheckinStatusId("ATST001");
        }

        // Cek sesi aktif yang belum checkout (D100 / laporan 76 §C1)
        try {
          const activeRes = await getActiveCheckins();
          const list = Array.isArray(activeRes) ? activeRes : (activeRes?.data ?? []);
          if (Array.isArray(list)) {
            setActiveSessions(list);
          }
        } catch { /* ignore */ }
      } catch (error) {
        console.debug("Error fetching sites, loading cache:", error);
        const cached = await getCachedSites();
        setSiteData(cached || []);
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

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

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
    // Defer ke microtask agar setState pertama di requestLocation tidak
    // synchronous-in-effect (React Compiler flag) — pola fetch async legit.
    Promise.resolve().then(() => requestLocation());
  }, []);

  const handleSubmit = async () => {
    // Guard double-submit: flag synchronous (loadingSubmit state async)
    if (submittingRef.current) return;
    // Validasi lokasi GPS
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

    // Lolos validasi → kunci submit
    submittingRef.current = true;
    setLoadingSubmit(true);

    const formattedNotes = notes.trim()
      ? `[Check In]: ${notes.trim()}`
      : "[Check In]: -";
    const checkinTimeStr = new Date().toLocaleString("sv-SE", {
      timeZone: TIMEZONE,
    });

    try {
      const netState = await NetInfo.fetch();
      const isOffline = !netState.isConnected || !netState.isInternetReachable;

      if (isOffline) {
        await queueOfflineCheckIn({
          user_id: user?.id ?? "",
          user_name: user?.name || "User",
          company_id: user?.company_id || null,
          site_id: selectedLocation || (user?.site_id ? String(user.site_id) : ""),
          checkin: checkinTimeStr,
          checkin_latitude: location.coords.latitude,
          checkin_longitude: location.coords.longitude,
          attendance_status_id: checkinStatusId || "ATST001",
          description: formattedNotes,
          localImages: images.map((img) => ({
            uri: img.uri,
            name: img.path || `checkin_${Date.now()}.jpg`,
            type: "image/jpeg",
          })),
          tolerance: selectedSite?.tolerance || 50,
        });

        Alert.alert(
          "Check In Tersimpan Offline",
          "Koneksi internet tidak terdeteksi. Data absensi dan foto bukti telah disimpan di perangkat Anda dan akan otomatis disinkronkan ke server saat sinyal kembali aktif.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
        return;
      }

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

      // Build payload — filter out empty UUID strings
      const payload: Record<string, any> = {
        user_id: user?.id ?? "",
        company_id: user?.company_id || null,
        site_id: selectedLocation || (user?.site_id as string | null) || null,
        name: "attendance",
        description: formattedNotes,
        code: `CHK-${Date.now()}`,
        checkin: checkinTimeStr,
        attendance_status_id: checkinStatusId,
        longitude: location.coords.longitude,
        latitude: location.coords.latitude,
      };
      if (user?.contract_id) payload.contract_id = user.contract_id;
      if (groupId) payload.evidence_group_id = groupId;
      const res = await createAttendance(payload as any);
      console.debug("Attendance created");

      // Simpan check-in id hanya jika server mengembalikannya
      if (res.data?.id) await saveCheckInId(res.data.id);

      showToast("Berhasil Check In!", "success");

      router.replace("/");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(JSON.stringify(err, null, 2));

      // Jika gagal karena kendala koneksi saat request berlangsung, simpan ke antrean offline
      try {
        await queueOfflineCheckIn({
          user_id: user?.id ?? "",
          user_name: user?.name || "User",
          company_id: user?.company_id || null,
          site_id: selectedLocation || (user?.site_id ? String(user.site_id) : ""),
          checkin: checkinTimeStr,
          checkin_latitude: location.coords.latitude,
          checkin_longitude: location.coords.longitude,
          attendance_status_id: checkinStatusId || "ATST001",
          description: formattedNotes,
          localImages: images.map((img) => ({
            uri: img.uri,
            name: img.path || `checkin_${Date.now()}.jpg`,
            type: "image/jpeg",
          })),
          tolerance: selectedSite?.tolerance || 50,
        });

        Alert.alert(
          "Check In Tersimpan Offline",
          "Koneksi jaringan terputus saat pengiriman. Data absensi dan foto bukti telah diamankan di perangkat dan akan otomatis disinkronkan saat terhubung kembali.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
        return;
      } catch {}

      Alert.alert(
        "Gagal Check In",
        err?.message || "Terjadi kesalahan, coba lagi.",
      );
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
              <Text style={styles.headerTitle}>Check In</Text>
              <View style={styles.notificationButtonPlaceholder}>
                {/* Spacer for centering title */}
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
            {/* Map View */}
            <View style={styles.mapContainer}>
              {!location ? (
                permissionDenied ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.locationDeniedEmoji}>📍</Text>
                    <Text style={styles.locationDeniedTitle}>
                      Izin lokasi diperlukan
                    </Text>
                    <Text style={styles.locationDeniedText}>
                      Aktifkan izin lokasi untuk melakukan check-in
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
                <Text style={styles.locationOverlayText}>
                  {location
                    ? `${location.coords.latitude}, ${location.coords.longitude}`
                    : "Menunggu..."}
                </Text>
              </View>
            </View>

            {/* Warning Sesi Aktif belum selesai bila ada */}
            {activeSessions.length > 0 && (
              <View style={styles.multiSessionBanner}>
                <InfoOutlineRounded color={colors.warning} width={22} height={22} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.multiSessionBannerTitle}>
                    {activeSessions.length > 1
                      ? `${activeSessions.length} sesi check-in belum selesai`
                      : "Sesi check-in aktif terdeteksi"}
                  </Text>
                  <Text style={styles.multiSessionBannerText}>
                    Sesi terakhir: {activeSessions[0]?.name || activeSessions[0]?.code || "Site"} ({activeSessions[0]?.checkin || "-"}). Anda dapat menyelesaikan sesi sebelumnya melalui menu Check Out.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push("/(no-tabs)/checkout")}
                  style={styles.checkoutNavButton}
                >
                  <Text style={styles.checkoutNavButtonText}>Checkout</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Status Kehadiran — penanda status terpilih + daftar pilihan bila > 1 */}
            <Text style={styles.sectionTitle}>Status Kehadiran</Text>
            {statusList.length > 1 ? (
              <View style={styles.statusDropdownContainer}>
                <TouchableOpacity
                  style={styles.statusSelectButton}
                  onPress={() => setStatusDropdownOpen((p) => !p)}
                  activeOpacity={0.7}
                >
                  <View style={styles.statusSelectRow}>
                    <View style={styles.statusBadgeDot} />
                    <Text style={styles.statusSelectValue}>
                      {statusList.find((s) => s.id === checkinStatusId)?.name || "Attend"}
                    </Text>
                  </View>
                  <Ionicons
                    name={statusDropdownOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {statusDropdownOpen && (
                  <View style={styles.statusDropdownMenu}>
                    {statusList.map((item) => {
                      const isSelected = item.id === checkinStatusId;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.statusOptionItem, isSelected && styles.statusOptionItemSelected]}
                          onPress={() => {
                            setCheckinStatusId(item.id);
                            setStatusDropdownOpen(false);
                          }}
                        >
                          <View style={{ width: 22 }}>
                            {isSelected && (
                              <Ionicons name="checkmark" size={18} color={colors.primary} />
                            )}
                          </View>
                          <Text style={[styles.statusOptionText, isSelected && { color: colors.primary, fontWeight: "600" }]}>
                            {item.name} {item.code ? `(${item.code})` : ""}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.statusCardSingle}>
                <View style={styles.statusBadgeDot} />
                <Text style={styles.statusCardSingleText}>
                  {statusList.find((s) => s.id === checkinStatusId)?.name || "Attend (Hadir)"}
                </Text>
              </View>
            )}

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
                placeholderTextColor={colors.textMuted}
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
                  color={colors.textSecondary}
                  style={{ marginRight: 8 }}
                />
              ) : (
                <ImageIcon color={colors.textMuted} style={styles.uploadButtonIcon} />
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
        )}
        </View>

        {/* Image Picker Modal (Gallery option hidden - Camera only) */}
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

              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => closeModal()}
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
    color: c.onGradient,
  },
  notificationButtonPlaceholder: {
    width: 40,
    height: 40,
  },

  contentContainer: {
    flex: 1,
    marginTop: -40, // Overlap dengan header
    backgroundColor: c.background,
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
    backgroundColor: c.surface,
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
    color: c.textSecondary,
  },
  locationDeniedEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  locationDeniedTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: c.text,
    marginBottom: 4,
  },
  locationDeniedText: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: c.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 10,
  },
  retryButtonText: {
    color: c.onGradient,
    fontWeight: "bold",
    fontSize: 14,
  },
  settingsButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  settingsButtonText: {
    color: c.primary,
    fontWeight: "600",
    fontSize: 14,
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
    color: c.text,
    textAlign: "center",
    fontWeight: "600",
  },

  // Section Title
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: c.textStrong,
    marginBottom: 12,
  },

  // Location Options
  locationOption: {
    flexDirection: "row",
    padding: 16,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: c.card,
  },
  locationOptionSelected: {
    borderColor: c.primary,
    backgroundColor: c.primarySoft,
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
    borderColor: c.borderStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  radioOuterSelected: {
    borderColor: c.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: c.primary,
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
    color: c.text,
    flex: 1,
  },
  outOfRangeBadge: {
    fontSize: 10,
    color: c.warning,
    backgroundColor: c.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
    fontWeight: "600",
  },
  locationAddress: {
    fontSize: 12,
    color: c.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  locationCoords: {
    fontSize: 10,
    color: c.textMuted,
  },

  // Info Card
  infoCard: {
    backgroundColor: c.primarySoft, // Hijau muda/Biru muda yang lembut
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    marginTop: 8,
    borderWidth: 1,
    borderColor: c.border,
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
    color: c.textStrong,
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
    color: c.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: c.text,
  },

  // Notes
  notesContainer: {
    backgroundColor: c.inputBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 24,
  },
  notesInput: {
    padding: 16,
    height: 100,
    fontSize: 14,
    color: c.text,
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
    backgroundColor: c.border,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  removeImageButton: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: c.overlay,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.onGradient,
  },
  removeImageText: {
    color: c.onGradient,
    fontSize: 10,
    fontWeight: "bold",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    borderRadius: 16,
    padding: 16,
    marginBottom: 30,
    borderStyle: "dashed",
    backgroundColor: c.inputBg,
  },
  uploadButtonIcon: {
    marginRight: 8,
    fontSize: 18,
  },
  uploadButtonText: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: "600",
  },

  // Submit Button
  submitButton: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: c.primary, // Modern blue
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
    color: c.onGradient,
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
    backgroundColor: c.surface,
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
    backgroundColor: c.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: c.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: 40,
  },
  modalIndicator: {
    width: 40,
    height: 4,
    backgroundColor: c.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 24,
    color: c.textStrong,
  },
  modalButtonPrimary: {
    backgroundColor: c.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  modalButtonTextPrimary: {
    color: c.onGradient,
    fontWeight: "bold",
    fontSize: 15,
  },
  modalButtonSecondary: {
    backgroundColor: c.card,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  modalButtonTextSecondary: {
    color: c.text,
    fontWeight: "600",
    fontSize: 15,
  },
  modalButtonCancel: {
    backgroundColor: c.surface,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  modalButtonTextCancel: {
    color: c.textSecondary,
    fontWeight: "600",
    fontSize: 15,
  },
  // Empty State
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.border,
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
    color: c.text,
    textAlign: "center",
    marginBottom: 4,
  },
  emptyStateSubText: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: "center",
  },
  multiSessionBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.warningSoft,
    borderColor: c.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  multiSessionBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: c.textStrong,
    marginBottom: 2,
  },
  multiSessionBannerText: {
    fontSize: 11,
    color: c.textSecondary,
    lineHeight: 16,
  },
  checkoutNavButton: {
    backgroundColor: c.warning,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  checkoutNavButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  statusDropdownContainer: {
    marginBottom: 16,
  },
  statusSelectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: c.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.success,
  },
  statusSelectValue: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textStrong,
  },
  statusDropdownMenu: {
    backgroundColor: c.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    marginTop: 6,
    overflow: "hidden",
  },
  statusOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  statusOptionItemSelected: {
    backgroundColor: c.primarySoft,
  },
  statusOptionText: {
    fontSize: 13,
    color: c.text,
  },
  statusCardSingle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 16,
  },
  statusCardSingleText: {
    fontSize: 14,
    fontWeight: "500",
    color: c.text,
  },
});
