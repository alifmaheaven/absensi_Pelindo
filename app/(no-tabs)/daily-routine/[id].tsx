import { ArrowLeft, CheckRounded, CloseRounded, ImageIcon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { IMAGE_BASE_PATH, IMAGE_MAX_WIDTH, IMAGE_QUALITY } from "@/constants";
import {
  getDailyRoutineById,
  getTodayRoutine,
  submitDailyRoutineLog,
  uploadDailyRoutineTemp,
} from "@/services/dailyRoutine";
import {
  IDailyRoutine,
  IDailyRoutineLog,
  IDailyRoutineLogItem,
  IDailyRoutineItem,
} from "@/types";
import { compressImage } from "@/utils/utils";
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

interface IItemState {
  daily_routine_item_id: string;
  is_checked: boolean;
  evidence_file: string | null;
  notes: string;
  local_uri: string | null;
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function DailyRoutineDetailScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingImageIndex, setLoadingImageIndex] = useState<number | null>(null);

  const [routine, setRoutine] = useState<IDailyRoutine | null>(null);
  const [logData, setLogData] = useState<IDailyRoutineLog | null>(null);
  const [logItems, setLogItems] = useState<IDailyRoutineLogItem[]>([]);
  const [itemStates, setItemStates] = useState<IItemState[]>([]);

  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (!id) {
        showToast("Routine ID tidak ditemukan", "error");
        router.back();
        return;
      }

      // Fetch routine detail by ID (template + items) and today's data (log + log_items) in parallel
      const [routineRes, todayRes] = await Promise.all([
        getDailyRoutineById(id).catch(() => null),
        getTodayRoutine().catch(() => null),
      ]);

      const routineDetail = routineRes?.data;
      const todayData = todayRes?.data;

      if (!routineDetail) {
        showToast("Routine tidak ditemukan", "error");
        router.back();
        return;
      }

      setRoutine(routineDetail);
      setLogData(todayData?.log || null);

      // Use log_items from today data, but only those matching this routine's items
      const matchingLogItems = (todayData?.log_items || []).filter(
        (li: IDailyRoutineLogItem) =>
          routineDetail.items?.some((ri: IDailyRoutineItem) => ri.id === li.daily_routine_item_id)
      );
      setLogItems(matchingLogItems);

      // Initialize item states from routine items
      const states: IItemState[] = (routineDetail.items || []).map((item: IDailyRoutineItem) => {
        const existingLogItem = matchingLogItems.find(
          (li: IDailyRoutineLogItem) => li.daily_routine_item_id === item.id
        );
        return {
          daily_routine_item_id: item.id,
          is_checked: existingLogItem?.is_checked || false,
          evidence_file: existingLogItem?.evidence_file || null,
          notes: existingLogItem?.notes || "",
          local_uri: null,
        };
      });
      setItemStates(states);
    } catch (error: any) {
      console.error("Fetch routine detail error:", error);
      showToast("Gagal memuat data", "error");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const updateItemState = (index: number, updates: Partial<IItemState>) => {
    setItemStates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleCheckToggle = (index: number) => {
    const item = itemStates[index];
    updateItemState(index, { is_checked: !item.is_checked });
  };

  const handlePickImage = async (index: number) => {
    const itemState = itemStates[index];
    const routineItem = routine?.items[index];
    if (!routineItem?.is_photo_required) return;

    setLoadingImageIndex(index);

    try {
      const { status } = await ImagePicker.getCameraPermissionsAsync();

      if (status === ImagePicker.PermissionStatus.UNDETERMINED) {
        const newPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (newPermission.status !== ImagePicker.PermissionStatus.GRANTED) {
          showToast("Izin kamera diperlukan", "error");
          setLoadingImageIndex(null);
          return;
        }
      }

      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert(
          "Izin Diperlukan",
          "Aplikasi membutuhkan akses Kamera untuk fitur ini. Mohon aktifkan di pengaturan.",
          [
            { text: "Batal", style: "cancel" },
            { text: "Buka Pengaturan", onPress: () => Linking.openSettings() },
          ]
        );
        setLoadingImageIndex(null);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled) {
        setLoadingImageIndex(null);
        return;
      }

      const compressed = await compressImage(result.assets?.[0], {
        maxWidth: IMAGE_MAX_WIDTH,
        quality: IMAGE_QUALITY,
      });

      const uploadRes = await uploadDailyRoutineTemp({
        uri: compressed?.uri,
        name: `daily-routine-${Date.now()}.jpg`,
        type: "image/jpeg",
      } as any);

      updateItemState(index, {
        evidence_file: uploadRes.data?.[0]?.path ?? "",
        local_uri: compressed?.uri ?? null,
      });
    } catch (error) {
      console.error("Pick image error:", error);
      showToast("Gagal mengambil gambar", "error");
    } finally {
      setLoadingImageIndex(null);
    }
  };

  const handleSubmit = async () => {
    if (!logData) {
      showToast("Log belum dimulai", "error");
      return;
    }

    // Validate: checked items with is_photo_required must have evidence
    for (let i = 0; i < itemStates.length; i++) {
      const item = itemStates[i];
      const routineItem = routine?.items.find(
        (ri) => ri.id === item.daily_routine_item_id
      );
      if (item.is_checked && routineItem?.is_photo_required && !item.evidence_file) {
        showToast(
          `"${routineItem.name}" membutuhkan foto bukti`,
          "error"
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const submitItems = itemStates.map((item) => ({
        daily_routine_item_id: item.daily_routine_item_id,
        is_checked: item.is_checked,
        ...(item.evidence_file && { evidence_file: item.evidence_file }),
        ...(item.notes && { notes: item.notes }),
      }));

      await submitDailyRoutineLog(logData.id, submitItems);
      showToast("Daily routine berhasil diselesaikan!", "success");
      router.replace("/(no-tabs)/daily-routine");
    } catch (error: any) {
      console.error("Submit error:", error);
      showToast(error?.response?.data?.message || "Gagal submit", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const getImageUrl = (file: string) => {
    return new URL(`${IMAGE_BASE_PATH}${file}`, BASE_URL).toString();
  };

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={["#1e90ff", "#8fd5f5ff"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <ArrowLeft color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Daily Routine</Text>
              <View style={{ width: 60 }} />
            </View>
          </SafeAreaView>
        </LinearGradient>
        <View style={styles.contentContainer}>
          <ActivityIndicator size="large" color="#1e90ff" style={{ marginTop: 40 }} />
        </View>
      </View>
    );
  }

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
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <ArrowLeft color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Daily Routine</Text>
              <View style={{ width: 60 }} />
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.contentContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Routine Info */}
            <Text style={styles.sectionTitle}>{routine?.name}</Text>
            {routine?.description ? (
              <Text style={styles.sectionDescription}>{routine.description}</Text>
            ) : null}

            <View style={styles.divider} />

            {/* Checklist Items */}
            <Text style={styles.sectionTitle}>Checklist</Text>
            {routine?.items?.map((item, index) => {
              const state = itemStates[index];
              if (!state) return null;

              return (
                <View key={item.id} style={styles.checklistItem}>
                  {/* Checkbox Row */}
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => handleCheckToggle(index)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        state.is_checked && styles.checkboxChecked,
                      ]}
                    >
                      {state.is_checked && (
                        <CheckRounded width={16} height={16} color="#fff" />
                      )}
                    </View>
                    <View style={styles.checkboxTextContainer}>
                      <Text
                        style={[
                          styles.checkboxLabel,
                          state.is_checked && styles.checkboxLabelChecked,
                        ]}
                      >
                        {item.name}
                      </Text>
                      {item.description ? (
                        <Text
                          style={[
                            styles.checkboxDescription,
                            state.is_checked && styles.textMuted,
                          ]}
                        >
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>

                  {/* Photo Required */}
                  {item.is_photo_required && (
                    <View style={styles.photoSection}>
                      {state.evidence_file ? (
                        <View style={styles.photoPreviewContainer}>
                          <TouchableOpacity onPress={() => setPreviewImage(state.local_uri || getImageUrl(state.evidence_file))}>
                            <Image
                              source={{
                                uri:
                                  state.local_uri ||
                                  getImageUrl(state.evidence_file),
                              }}
                              style={styles.photoPreview}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.retakeButton}
                            onPress={() => handlePickImage(index)}
                            disabled={loadingImageIndex === index}
                          >
                            <Text style={styles.retakeButtonText}>Retake</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.uploadPhotoButton,
                            loadingImageIndex === index && { opacity: 0.6 },
                          ]}
                          onPress={() => handlePickImage(index)}
                          disabled={loadingImageIndex === index}
                        >
                          {loadingImageIndex === index ? (
                            <ActivityIndicator size="small" color="#666" />
                          ) : (
                            <>
                              <ImageIcon color="#999" style={{ marginRight: 8 }} />
                              <Text style={styles.uploadPhotoText}>
                                Ambil Foto
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Notes */}
                  <View style={styles.notesContainer}>
                    <TextInput
                      style={styles.notesInput}
                      placeholder="Catatan (opsional)"
                      placeholderTextColor="#999"
                      value={state.notes}
                      onChangeText={(text) => updateItemState(index, { notes: text })}
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              );
            })}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                submitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator
                  size="small"
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
              ) : null}
              <Text style={styles.submitButtonText}>
                {submitting ? "Menyimpan..." : "Selesaikan Daily Routine"}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {/* Image Preview Modal */}
        <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
          <TouchableOpacity style={{flex:1,backgroundColor:"rgba(0,0,0,0.9)",justifyContent:"center",alignItems:"center"}} onPress={() => setPreviewImage(null)}>
            {previewImage && <Image source={{uri: previewImage}} style={{width:"90%",height:"70%",resizeMode:"contain"}} />}
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerGradient: {
    height: 140,
    paddingBottom: 30,
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
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  contentContainer: {
    flex: 1,
    marginTop: -20,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  scrollContent: {
    padding: 20,
    paddingTop: 25,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    lineHeight: 20,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#e0e0e0",
    marginVertical: 16,
  },

  // Checklist Item
  checklistItem: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    padding: 16,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  checkboxLabelChecked: {
    color: "#22C55E",
    textDecorationLine: "line-through",
  },
  checkboxDescription: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
    lineHeight: 18,
  },
  textMuted: {
    color: "#aaa",
  },

  // Photo
  photoSection: {
    marginTop: 12,
    marginLeft: 36,
  },
  photoPreviewContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  retakeButton: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retakeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  uploadPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    padding: 12,
    borderStyle: "dashed",
    backgroundColor: "#fafafa",
  },
  uploadPhotoText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },

  // Notes
  notesContainer: {
    marginTop: 8,
    marginLeft: 36,
  },
  notesInput: {
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    padding: 10,
    fontSize: 13,
    color: "#333",
    minHeight: 40,
  },

  // Submit
  submitButton: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "#22C55E",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 16,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
});
