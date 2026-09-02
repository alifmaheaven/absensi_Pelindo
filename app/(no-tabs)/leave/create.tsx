import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, ImageIcon } from "@/components/icon";
import DatePicker from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast";
import API from "@/lib/axios";
import { useRequest } from "@/hooks/use-request";
import { useImagePicker } from "@/hooks/useImagePicker";
import { getMyLeaves } from "@/services/leave";
import {
  createGroupId,
  deleteEvidtmp,
  getAttendanceStatus,
  uploadEvid,
  uploadEvidGroupId,
  uploadEvidPermanent,
} from "@/services/attendance";
import { useAuthStore } from "@/stores/auth";
import { IAttendanceStatus, THttpErrorResult } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState , useMemo } from "react";
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
import ImageViewerModal from "@/components/ImageViewerModal";

const imageUploadService = {
  uploadTemp: uploadEvid,
  deleteTemp: deleteEvidtmp,
};

export default function LeaveScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  const [notes, setNotes] = useState("");
  const [leaveDate, setLeaveDate] = useState("");
  const [statusData, setStatusData] = useState<IAttendanceStatus[]>([]);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [attendanceDropdownOpen, setAttendanceDropdownOpen] = useState(false);
  const [attendanceSelected, setAttendanceSelected] = useState("");
  const [disabledDates, setDisabledDates] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const {
    images,
    loadingImage,
    isModalVisible,
    pickImage,
    removeImage,
    openModal,
    closeModal,
  } = useImagePicker();

  const { run: getStatus } = useRequest(() =>
    getAttendanceStatus({ page: 1, per_page: 100 }),
  );

  useEffect(() => {
    const fetchStatuses = async () => {
      try {
        const statusRes = await getStatus();
        const status = statusRes.data?.data;

        // Exclude only "Attend" — show Izin, Cuti, Sakit, Alpha, dll
        setStatusData(
          status
            ? status.filter((s) => s.name?.toLowerCase() !== "attend")
            : [],
        );
      } catch (error) {
        console.error("Error fetching status:", error);
        setStatusData([]);
      }
    };
    fetchStatuses();

    // Fetch existing leave dates to disable in calendar
    getMyLeaves({ page: 1, per_page: 50 })
      .then((leaves) => {
        if (Array.isArray(leaves)) {
          const dates = leaves
            .filter((lr) => lr.status !== "rejected")
            .map((lr) => (lr.leave_date || "").split("T")[0])
            .filter(Boolean);
          setDisabledDates(dates);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (notes === "") {
      showToast("Masukkan catatan!", "error");
      return;
    }

    if (leaveDate === "") {
      showToast("Pilih tanggal izin/cuti!", "error");
      return;
    }

    if (attendanceSelected === "") {
      showToast("Pilih status kehadiran!", "error");
      return;
    }

    const selectedStatus = statusData?.find((s) => s.id === attendanceSelected);
    const isCuti = selectedStatus?.name?.toLowerCase() === "cuti";

    setLoadingSubmit(true);
    try {
      // Create evidence group (sama seperti flow check-in) — leave_requests
      // punya kolom evidence_group_id dan related ke attendance via status.
      let evidenceGroupId = "";
      if (images.length > 0) {
        const group = await createGroupId({
          name: `Leave ${user?.name}`,
          description: "Leave evidence",
        });
        evidenceGroupId = group.data?.id ?? "";

        // Upload permanent + link evidence ke group
        for (const img of images) {
          const uploaded = await uploadEvidPermanent({ links: [img.path] });
          const file = uploaded.data?.links?.[0];
          if (!file) continue;
          await uploadEvidGroupId({
            name: `Leave ${user?.name}`,
            description: "Evidence",
            file,
            evidence_group_id: evidenceGroupId,
          });
        }
      }

      await API.post("/leave/", {
        leave_date: leaveDate,
        leave_type: isCuti ? "cuti" : "izin",
        attendance_status_id: attendanceSelected,
        reason: notes,
        ...(evidenceGroupId ? { evidence_group_id: evidenceGroupId } : {}),
      });

      showToast("Pengajuan izin/cuti berhasil dikirim!", "success");
      router.replace("/");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(JSON.stringify(err, null, 2));
      Alert.alert(
        "Gagal",
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
              <Text style={styles.headerTitle}>Izin/Cuti</Text>
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
            {/* Attendance Status */}
            <Text style={styles.sectionTitle}>Attendance Status</Text>
            <View style={styles.dropdownWrapper}>
              <TouchableOpacity
                style={styles.selectInputDropdown}
                onPress={() => setAttendanceDropdownOpen((p) => !p)}
              >
                <Text
                  style={attendanceSelected ? styles.value : styles.placeholder}
                >
                  {statusData?.find((d) => d.id === attendanceSelected)?.name ||
                    "Select attendance status"}
                </Text>
                <Ionicons
                  name={attendanceDropdownOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                />
              </TouchableOpacity>

              {attendanceDropdownOpen && (
                <View style={styles.dropdown}>
                  {statusData?.map((status) => (
                    <TouchableOpacity
                      key={status.id}
                      style={styles.option}
                      onPress={() => {
                        setAttendanceSelected(status.id);
                        setAttendanceDropdownOpen((p) => !p);
                      }}
                    >
                      <View style={{ width: 20 }}>
                        {attendanceSelected === status.id && (
                          <Ionicons
                            name={"checkmark"}
                            size={18}
                            color={colors.primary}
                          />
                        )}
                      </View>
                      <Text style={styles.optionText}>{status.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Tanggal Izin/Cuti */}
            <Text style={styles.sectionTitle}>Tanggal Izin/Cuti</Text>
            <TouchableOpacity
              style={styles.dateContainer}
              onPress={() => setDatePickerVisible(true)}
            >
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                <Text style={leaveDate ? styles.dateValue : styles.datePlaceholder}>
                  {leaveDate || "Pilih tanggal"}
                </Text>
              </View>
            </TouchableOpacity>

            <DatePicker
              visible={datePickerVisible}
              value={leaveDate}
              disabledDates={disabledDates}
              onConfirm={(date) => {
                setLeaveDate(date);
                setDatePickerVisible(false);
              }}
              onClose={() => setDatePickerVisible(false)}
            />

            {/* Notes */}
            <Text style={styles.sectionTitle}>Notes</Text>
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
                {loadingSubmit ? "Memproses..." : "Submit Izin/Cuti"}
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
        <ImageViewerModal
          visible={!!previewImage}
          uri={previewImage}
          onClose={() => setPreviewImage(null)}
        />
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
    backgroundColor: c.card,
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
    color: c.textStrong,
    marginBottom: 12,
  },

  dropdownWrapper: { position: "relative", marginBottom: 24 },
  selectInputDropdown: {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  dropdown: {
    position: "absolute",
    top: 50,
    width: "100%",
    backgroundColor: c.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    zIndex: 10,
  },
  placeholder: { color: c.textMuted },
  value: { color: c.textStrong },
  option: { padding: 12, flexDirection: "row", alignItems: "center" },
  optionText: { fontSize: 14 },

  // Date Input
  dateContainer: {
    backgroundColor: c.inputBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 24,
    padding: 16,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateValue: {
    fontSize: 14,
    color: c.text,
  },
  datePlaceholder: {
    fontSize: 14,
    color: c.textMuted,
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
});
