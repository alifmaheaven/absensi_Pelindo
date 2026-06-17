import { ArrowLeft, ImageIcon } from "@/components/icon";
import TicketSkeleton from "@/components/ticketing/ticket-skeleton";
import { useToast } from "@/components/ui/toast";
import {
  ATTENDANCE_WINDOW_HOURS,
  IMAGE_BASE_PATH,
  IMAGE_MAX_WIDTH,
  IMAGE_QUALITY,
  TIMEZONE,
} from "@/constants";
import {
  deleteEvid,
  deleteEvidtmp,
  getAttendanceOption,
  getDataEvid,
  getDataSeverity,
  getDataStatus,
  getTicketDevice,
  updateTicket,
  uploadEvidGroupId,
  uploadEvidPermanent,
  uploadEvidtmp,
} from "@/services/ticket";
import { useAuthStore } from "@/stores/auth";
import { useTicketStore } from "@/stores/ticket";
import {
  IAttendanceOptions,
  ITicketDevice,
  ITicketSeverity,
  ITicketStatus,
  THttpErrorResult,
} from "@/types";
import { compressImage } from "@/utils/utils";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
  id: string | null;
  uri: string;
  path: string;
  link: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ITicketSeverity[];
}

const DEFAULT_SEVERITY_COLOR = { bg: "rgba(150,150,150,0.15)", border: "#999", text: "#555" };

const getNowJakarta = () =>
  new Date().toLocaleString("sv-SE", { timeZone: TIMEZONE });

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function TicketingEditScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { ticket } = useTicketStore();

  // form values
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [deviceSelected, setDeviceSelected] = useState("");
  const [images, setImages] = useState<IImage[]>([]);
  const [severitySelected, setSeveritySelected] = useState("");
  const [attendanceSelected, setAttendanceSelected] = useState("");
  const [statusSelected, setStatusSelected] = useState("");

  // form state
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const { user } = useAuthStore();
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [attendanceDropdownOpen, setAttendanceDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [removedImages, setRemovedImages] = useState<IImage[]>([]);
  const [loadingSkeleton, setLoadingSkeleton] = useState(true);

  // Data Options
  const [deviceData, setDeviceData] = useState<ITicketDevice[]>([]);
  const [statusData, setStatusData] = useState<ITicketStatus[]>([]);
  const [attendanceOptions, setAttendanceOptions] = useState<
    IAttendanceOptions[]
  >([]);
  const [severitys, setSeveritys] = useState<ITicketSeverity[]>([]);

  useFocusEffect(
    useCallback(() => {
      async function fetchData() {
        try {
          setLoadingSkeleton(true);

          const [devices, attendanceOptions, severitys, evids, status] =
            await Promise.all([
              getTicketDevice({
                page: 1,
                per_page: 100,
                company_id_exact: [user?.company_id || ""],
                user_id_exact: [user?.id || ""],
                order_by_desc: ["created_at"],
              }),
              getAttendanceOption({
                page: 1,
                per_page: 100,
                company_id_exact: [user?.company_id || ""],
                user_id_exact: [user?.id || ""],
                order_by_desc: ["created_at"],
              }),
              getDataSeverity({ page: 1, per_page: 100 }),
              getDataEvid({
                page: 1,
                per_page: 100,
                evidence_group_id_exact: [ticket?.evidence_group_id ?? ""],
              }),
              getDataStatus({
                page: 1,
                per_page: 100,
                company_id_exact: [ticket?.company_id || ""],
              }),
            ]);

          const device = devices.data?.data || [];
          const attendanceOption = attendanceOptions.data?.data || [];
          const severityData = severitys.data?.data || [];
          const statusData = status.data?.data || [];

          const attendanceOptionFilter =
            attendanceOption
              ?.filter((item) => {
                const checkinDate = new Date(item.checkin);
                const now = new Date();
                const windowEnd = new Date(
                  checkinDate.getTime() + ATTENDANCE_WINDOW_HOURS * 60 * 60 * 1000,
                );
                return now > checkinDate && now < windowEnd;
              })
              ?.map((item) => ({
                ...item,
                name: `${item.code} - ${new Date(
                  item.checkin,
                ).toLocaleString()}`,
              })) || [];

          const sortSeverity =
            severityData?.sort((a, b) => a.code.localeCompare(b.code)) || [];

          const evidsData = evids.data?.data || [];

          if (evidsData?.length) {
            const evidencesData = evidsData?.map((e) => ({
              id: e?.id,
              uri: new URL(`${IMAGE_BASE_PATH}${e.file}`, BASE_URL).toString(),
              path: e.file,
              link: e.file,
            }));

            setImages(evidencesData ? evidencesData : []);
          }

          setSeveritys(sortSeverity);
          setDeviceData(device);
          setAttendanceOptions(attendanceOptionFilter);
          setStatusData(statusData);

          setTitle(ticket?.name || "");
          setNotes(ticket?.description || "");
          setDeviceSelected(ticket?.device_id || "");
          setAttendanceSelected(ticket?.attendance_id || "");
          setSeveritySelected(ticket?.severity_id || "");
          setStatusSelected(ticket?.status_id || "");
        } catch (error) {
          const err = error as THttpErrorResult;
          console.error("[FetchData Error]", err);
        } finally {
          setLoadingSkeleton(false);
        }
      }

      fetchData();
    }, []),
  );

  const pickImage = async (source: "camera" | "gallery") => {
    // Gallery is disabled - camera only
    if (source !== "camera") {
      Alert.alert('Error', 'Hanya kamera yang diizinkan untuk mengambil gambar.');
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

      try {
        const res = await uploadEvidtmp({
          uri: compressed?.uri,
          name: `image-${Date.now()}.jpg`,
          type: "image/jpeg",
        } as any);
        console.debug("[PickImage] Upload result:", res);

        if (compressed?.uri) {
          setImages((prev) => [
            ...prev,
            {
              id: null,
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

      if (target?.path) {
        if (target?.id) {
          setRemovedImages((prev) => [...prev, target]);
        } else {
          await deleteEvidtmp({ links: [target.path] });
        }
      }

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

  const handleSubmit = async () => {
    // Title
    if (!title) {
      showToast("Masukkan title!", "error");
      return;
    }
    // Device
    if (!deviceSelected) {
      showToast("Pilih device!", "error");
      return;
    }
    // Attendance
    if (!attendanceSelected) {
      showToast("Pilih attendance!", "error");
      return;
    }
    // Severity
    if (!severitySelected) {
      showToast("Pilih severity!", "error");
      return;
    }
    // Notes
    if (!notes) {
      showToast("Masukkan description!", "error");
      return;
    }
    // Validasi gambar wajib minimal 1
    if (images.length === 0) {
      showToast("Upload minimal 1 gambar sebagai bukti!", "error");
      return;
    }

    setLoadingSubmit(true);

    try {
      const groupId = ticket?.evidence_group_id ?? "";
      console.debug("Group ID", groupId);

      for (const img of removedImages) {
        const deleted = await deleteEvid({ id: img?.id || "" });

        if (deleted?.code !== 200) continue;
        console.debug("File deleted", deleted);
      }

      for (const img of images) {
        if (!img.id) {
          const uploaded = await uploadEvidPermanent({ links: [img.path] });
          const file = uploaded.data?.links?.[0];

          if (!file) continue;
          console.debug("File uploaded", file);

          await uploadEvidGroupId({
            name: `Ticket ${user?.name}`,
            description: "Evidence",
            file,
            evidence_group_id: groupId,
          });
        }
      }

      // Submit
      await updateTicket({
        id,
        end_ticket: ticket?.end_ticket || getNowJakarta(),
        user_id: ticket?.user_id || "",
        company_id: ticket?.company_id || "",
        contract_id: ticket?.contract_id || "",
        site_id: ticket?.site_id || "",
        code: ticket?.code || "",
        status_id: statusSelected || ticket?.status_id || "",
        start_ticket: ticket?.start_ticket || "",

        evidence_group_id: groupId,
        attendance_id: attendanceSelected,
        severity_id: severitySelected,
        device_id: deviceSelected,
        name: title,
        description: notes,
      });

      console.debug("Ticket created");

      showToast("Berhasil create ticket!", "success");

      router.replace("/ticketing");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(err);
      showToast("Gagal create ticket!", "error");
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
              <Text style={styles.headerTitle}>Edit Ticketing</Text>
              <View style={styles.notificationButtonPlaceholder}>
                {/* Spacer for centering title */}
                <View style={{ width: 40 }} />
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        {loadingSkeleton ? (
          <TicketSkeleton />
        ) : (
          <View style={styles.contentContainer}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Select Location */}
              <Text style={styles.sectionTitle}>Edit Ticket</Text>
              <Text style={styles.sectionDescription}>
                Edit your IT support ticket
              </Text>

              <View
                style={{
                  width: "100%",
                  height: 1,
                  backgroundColor: "#e0e0e0",
                  marginVertical: 12,
                }}
              />

              {/* Notes */}
              <Text style={styles.sectionTitle}>Title</Text>
              <View style={styles.titleContainer}>
                <TextInput
                  style={styles.titleInput}
                  placeholder="Enter Problem Title"
                  placeholderTextColor="#999"
                  value={title}
                  onChangeText={setTitle}
                  textAlignVertical="top"
                  maxLength={200}
                />
              </View>

              {/* Device */}
              <Text style={styles.sectionTitle}>Device</Text>
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity
                  style={styles.selectInputDropdown}
                  onPress={() => setDeviceDropdownOpen((p) => !p)}
                >
                  <Text
                    style={deviceSelected ? styles.value : styles.placeholder}
                  >
                    {deviceData?.find((d) => d.id === deviceSelected)?.name ||
                      "Select device"}
                  </Text>
                  <Ionicons
                    name={deviceDropdownOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                  />
                </TouchableOpacity>

                {deviceDropdownOpen && (
                  <View style={styles.dropdown}>
                    {deviceData?.map((device) => (
                      <TouchableOpacity
                        key={device.id}
                        style={styles.option}
                        onPress={() => {
                          setDeviceSelected(device.id);
                          setDeviceDropdownOpen((p) => !p);
                        }}
                      >
                        <View style={{ width: 20 }}>
                          {deviceSelected === device.id && (
                            <Ionicons
                              name={"checkmark"}
                              size={18}
                              color="#1e90ff"
                            />
                          )}
                        </View>
                        <Text style={styles.optionText}>{device.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Attendance */}
              <Text style={styles.sectionTitle}>Attendance</Text>
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity
                  style={styles.selectInputDropdown}
                  onPress={() => setAttendanceDropdownOpen((p) => !p)}
                >
                  <Text
                    style={
                      attendanceSelected ? styles.value : styles.placeholder
                    }
                  >
                    {attendanceOptions?.find((d) => d.id === attendanceSelected)
                      ?.name || "Select attendance"}
                  </Text>
                  <Ionicons
                    name={
                      attendanceDropdownOpen ? "chevron-up" : "chevron-down"
                    }
                    size={18}
                  />
                </TouchableOpacity>

                {attendanceDropdownOpen && (
                  <View style={styles.dropdown}>
                    {attendanceOptions?.map((attendance) => (
                      <TouchableOpacity
                        key={attendance.id}
                        style={styles.option}
                        onPress={() => {
                          setAttendanceSelected(attendance.id);
                          setAttendanceDropdownOpen((p) => !p);
                        }}
                      >
                        <View style={{ width: 20 }}>
                          {attendanceSelected === attendance.id && (
                            <Ionicons
                              name={"checkmark"}
                              size={18}
                              color="#1e90ff"
                            />
                          )}
                        </View>
                        <Text style={styles.optionText}>{attendance.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Status */}
              <Text style={styles.sectionTitle}>Status</Text>
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity
                  style={styles.selectInputDropdown}
                  onPress={() => setStatusDropdownOpen((p) => !p)}
                >
                  <Text
                    style={statusSelected ? styles.value : styles.placeholder}
                  >
                    {statusData?.find((d) => d.id === statusSelected)?.name ||
                      "Select status"}
                  </Text>
                  <Ionicons
                    name={statusDropdownOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                  />
                </TouchableOpacity>

                {statusDropdownOpen && (
                  <View style={styles.dropdown}>
                    {statusData?.map((status) => (
                      <TouchableOpacity
                        key={status.id}
                        style={styles.option}
                        onPress={() => {
                          setStatusSelected(status.id);
                          setStatusDropdownOpen((p) => !p);
                        }}
                      >
                        <View style={{ width: 20 }}>
                          {statusSelected === status.id && (
                            <Ionicons
                              name={"checkmark"}
                              size={18}
                              color="#1e90ff"
                            />
                          )}
                        </View>
                        <Text style={styles.optionText}>{status.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* SeveritySelector */}
              <Text style={styles.sectionTitle}>Severity</Text>
              <SeveritySelector
                options={severitys}
                value={severitySelected}
                onChange={setSeveritySelected}
              />

              {/* Description */}
              <Text style={styles.sectionTitle}>Description</Text>
              <View style={styles.notesContainer}>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Explain the problem in detail"
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
                  (loadingImage || loadingSubmit) &&
                    styles.uploadButtonDisabled,
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
                  (loadingSubmit || loadingImage) &&
                    styles.submitButtonDisabled,
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
                  {loadingSubmit ? "Memproses..." : "Submit ticket"}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        )}

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

function parseSeverityColor(hex: string | undefined) {
  if (!hex) return DEFAULT_SEVERITY_COLOR;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    bg: `rgba(${r},${g},${b},0.15)`,
    border: hex,
    text: hex,
  };
}

export function SeveritySelector({ value, onChange, options }: Props) {
  return (
    <View style={styles.severityContainer}>
      {options?.length > 0 ? (
        options?.map((item) => {
          const isActive = value === item.id;
          const color = parseSeverityColor(item.color);

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onChange(item.id)}
              activeOpacity={0.8}
              style={[
                styles.severityButton,
                isActive && {
                  backgroundColor: color.bg,
                  borderColor: color.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.severityText,
                  isActive && { color: color.text, fontWeight: "600" },
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })
      ) : (
        <Text>Tidak ada severity</Text>
      )}
    </View>
  );
}

/* =============================
   STYLES
============================= */

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

  // Section Title
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 14,
    fontWeight: "normal",
    color: "#1a1a1a",
    marginBottom: 12,
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

  // Title
  titleContainer: {
    backgroundColor: "#fafafa",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    marginBottom: 24,
  },
  titleInput: {
    padding: 16,
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

  // dropdown
  dropdownWrapper: { position: "relative", marginBottom: 24 },
  selectInputDropdown: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  dropdown: {
    position: "absolute",
    top: 50,
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    zIndex: 10,
  },
  placeholder: { color: "#999" },
  value: { color: "#111" },
  option: { padding: 12, flexDirection: "row", alignItems: "center" },
  optionText: { fontSize: 14 },

  // SeveritySelector
  severityContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },

  severityButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },

  severityText: {
    fontSize: 13,
    color: "#555",
  },
});
