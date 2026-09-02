import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
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
import { useCallback, useState , useMemo } from "react";
import ImageViewerModal from "@/components/ImageViewerModal";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
  device_id?: string; // composite key: device_id::item_id for per-device state
  is_checked: boolean;
  evidence_file: string | null;
  notes: string;
  local_uri: string | null;
}

interface IDeviceGroup {
  device_id: string;
  device_name: string;
  items: IDailyRoutineItem[];
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function DailyRoutineDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingImageKey, setLoadingImageKey] = useState<string | null>(null);
  const [activeDeviceTab, setActiveDeviceTab] = useState<string>(""); // currently active device tab
  const [deviceGroups, setDeviceGroups] = useState<IDeviceGroup[]>([]); // for device tab UI

  const [routine, setRoutine] = useState<IDailyRoutine | null>(null);
  const [logData, setLogData] = useState<IDailyRoutineLog | null>(null);
  const [logItems, setLogItems] = useState<IDailyRoutineLogItem[]>([]);
  const [itemStates, setItemStates] = useState<Record<string, IItemState>>({});

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

      // Use log_items from today data — match by composite (device_id, daily_routine_item_id)
      const matchingLogItems = (todayData?.log_items || []).filter(
        (li: IDailyRoutineLogItem) =>
          routineDetail.items?.some((ri: IDailyRoutineItem) => ri.id === li.daily_routine_item_id)
      );
      setLogItems(matchingLogItems);

      // Initialize item states keyed by device_id::daily_routine_item_id
      const states: Record<string, IItemState> = {};
      // Build lookup: log_item by composite key, with fallback by item_id alone
      // (old log_items may not have device_id — fallback to item_id match)
      const logItemLookup: Record<string, IDailyRoutineLogItem> = {};
      const logItemLookupByItem: Record<string, IDailyRoutineLogItem> = {};
      matchingLogItems.forEach((li: any) => {
        const key = `${li.device_id || ''}::${li.daily_routine_item_id}`;
        logItemLookup[key] = li;
        // Fallback: first-come-first-serve by item_id (for legacy log_items without device_id)
        if (!li.device_id && !logItemLookupByItem[li.daily_routine_item_id]) {
          logItemLookupByItem[li.daily_routine_item_id] = li;
        }
      });

      const groups: IDeviceGroup[] = [];
      if (routineDetail.device_items?.length) {
        // Build per-device groups
        const deviceMap: Record<string, IDeviceGroup> = {};
        (routineDetail.device_items as any[]).forEach((di: any) => {
          const key = di.device_id;
          if (!deviceMap[key]) deviceMap[key] = { device_id: key, device_name: di.device_name || 'Unknown', items: [] };
        });
        (routineDetail.items || []).forEach((item: IDailyRoutineItem) => {
          // Find which devices this item belongs to
          (routineDetail.device_items as any[]).forEach((di: any) => {
            if (di.daily_routine_item_id === item.id && deviceMap[di.device_id]) {
              deviceMap[di.device_id].items.push(item);
            }
          });
        });

        const sortedGroups = Object.values(deviceMap);
        groups.push(...sortedGroups);
        if (sortedGroups.length > 0 && !activeDeviceTab) setActiveDeviceTab(sortedGroups[0].device_id);

        // Init state for each device×item combo — lookup by composite key
        sortedGroups.forEach((group) => {
          group.items.forEach((item) => {
            const stateKey = `${group.device_id}::${item.id}`;
            // Try composite key first, fallback to item-only (legacy data without device_id)
            const existingLogItem = logItemLookup[stateKey] || logItemLookupByItem[item.id];
            states[stateKey] = {
              daily_routine_item_id: item.id,
              device_id: group.device_id,
              is_checked: existingLogItem?.is_checked || false,
              evidence_file: (existingLogItem?.device_id === group.device_id || !existingLogItem?.device_id)
                ? (existingLogItem?.evidence_file || null)
                : null, // different device's evidence — don't share
              notes: (existingLogItem?.device_id === group.device_id || !existingLogItem?.device_id)
                ? (existingLogItem?.notes || "")
                : "",
              local_uri: null,
            };
          });
        });
      }
      setDeviceGroups(groups);
      if (!routineDetail.device_items?.length) {
        // Flat checklist: key is ::itemId (no device_id)
        (routineDetail.items || []).forEach((item: IDailyRoutineItem) => {
          const stateKey = `::${item.id}`;
          const existingLogItem = logItemLookup[stateKey];
          states[stateKey] = {
            daily_routine_item_id: item.id,
            is_checked: existingLogItem?.is_checked || false,
            evidence_file: existingLogItem?.evidence_file || null,
            notes: existingLogItem?.notes || "",
            local_uri: null,
          };
        });
      }
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

  const updateItemState = (stateKey: string, updates: Partial<IItemState>) => {
    setItemStates((prev) => ({
      ...prev,
      [stateKey]: { ...prev[stateKey], ...updates },
    }));
  };

  const handleCheckToggle = (stateKey: string) => {
    const item = itemStates[stateKey];
    if (item) updateItemState(stateKey, { is_checked: !item.is_checked });
  };

  const handlePickImage = async (stateKey: string) => {
    const itemState = itemStates[stateKey];
    const itemId = itemState?.daily_routine_item_id;
    const routineItem = routine?.items?.find((ri: IDailyRoutineItem) => ri.id === itemId);
    if (!routineItem?.is_photo_required) return;

    setLoadingImageKey(stateKey);

    try {
      const { status } = await ImagePicker.getCameraPermissionsAsync();

      if (status === ImagePicker.PermissionStatus.UNDETERMINED) {
        const newPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (newPermission.status !== ImagePicker.PermissionStatus.GRANTED) {
          showToast("Izin kamera diperlukan", "error");
          setLoadingImageKey(null);
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
        setLoadingImageKey(null);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled) {
        setLoadingImageKey(null);
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

      updateItemState(stateKey, {
        evidence_file: uploadRes.data?.[0]?.path ?? "",
        local_uri: compressed?.uri ?? null,
      });
    } catch (error) {
      console.error("Pick image error:", error);
      showToast("Gagal mengambil gambar", "error");
    } finally {
      setLoadingImageKey(null);
    }
  };

  const handleSubmit = async () => {
    if (!logData) {
      showToast("Log belum dimulai", "error");
      return;
    }

    const states = Object.values(itemStates);

    // Validate: checked items with is_photo_required must have evidence
    // Priority: per-device setting (daily_routine_device_item) > global item setting
    for (const item of states) {
      const routineItem = routine?.items.find(
        (ri) => ri.id === item.daily_routine_item_id
      );
      const deviceConf = (routine?.device_items || []).find(
        (di: any) => di.device_id === item.device_id && di.daily_routine_item_id === item.daily_routine_item_id
      );
      const requiresPhoto = deviceConf?.is_photo_required ?? routineItem?.is_photo_required ?? false;
      if (item.is_checked && requiresPhoto && !item.evidence_file) {
        showToast(
          `"${routineItem?.name || 'Item'}" membutuhkan foto bukti`,
          "error"
        );
        return;
      }
    }

    // Submit per-device items — each device gets its own log_item state
    const submitItems = states.map((item) => ({
      daily_routine_item_id: item.daily_routine_item_id,
      device_id: item.device_id,
      is_checked: item.is_checked,
      ...(item.evidence_file && { evidence_file: item.evidence_file }),
      ...(item.notes && { notes: item.notes }),
    }));

    setSubmitting(true);
    try {
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

  const getDeviceProgress = (deviceId: string) => {
    const states = Object.values(itemStates).filter((s) => s.device_id === deviceId);
    const checked = states.filter((s) => s.is_checked).length;
    return { total: states.length, checked };
  };

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={[colors.primary, colors.background]}
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
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
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
          colors={[colors.primary, colors.background]}
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

            {/* Checklist Items — tabbed by device if device_items exist */}
            {deviceGroups.length ? (
              <>
                {/* Device Tabs */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deviceTabBar}>
                  {deviceGroups.map((group) => {
                    const progress = getDeviceProgress(group.device_id);
                    const isActive = activeDeviceTab === group.device_id;
                    const allDone = progress.total > 0 && progress.checked === progress.total;
                    return (
                      <TouchableOpacity
                        key={group.device_id}
                        style={[styles.deviceTab, isActive && styles.deviceTabActive]}
                        onPress={() => setActiveDeviceTab(group.device_id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.deviceTabIcon}>🖥️</Text>
                        <Text style={[styles.deviceTabText, isActive && styles.deviceTabTextActive]} numberOfLines={1}>
                          {group.device_name}
                        </Text>
                        <Text style={[styles.deviceTabProgress, allDone ? styles.deviceTabDone : styles.deviceTabPending]}>
                          {progress.checked}/{progress.total}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Active Device Checklist */}
                {deviceGroups.filter((g) => g.device_id === activeDeviceTab).map((group) => (
                  <View key={group.device_id} style={{ marginBottom: 16 }}>
                    <View style={styles.deviceHeader}>
                      <Text style={styles.deviceHeaderIcon}>🖥️</Text>
                      <Text style={styles.deviceHeaderText}>{group.device_name}</Text>
                      {(() => { const p = getDeviceProgress(group.device_id);
                        return <Text style={[styles.deviceProgressLabel, p.checked === p.total && p.total > 0 ? styles.deviceProgressDone : styles.deviceProgressPending]}>{p.checked}/{p.total}</Text>;
                      })()}
                    </View>
                    {group.items.map((item: any) => {
                      const stateKey = `${group.device_id}::${item.id}`;
                      const state = itemStates[stateKey];
                      if (!state) return null;

                      const deviceConf = (routine?.device_items || []).find((di: any) => di.daily_routine_item_id === item.id);

                      return (
                        <View key={item.id} style={styles.checklistItem}>
                          <TouchableOpacity style={styles.checkboxRow} onPress={() => handleCheckToggle(stateKey)} activeOpacity={0.7}>
                            <View style={[styles.checkbox, state.is_checked && styles.checkboxChecked]}>
                              {state.is_checked && <CheckRounded width={16} height={16} color="#fff" />}
                            </View>
                            <View style={styles.checkboxTextContainer}>
                              <Text style={[styles.checkboxLabel, state.is_checked && styles.checkboxLabelChecked]}>{item.name}</Text>
                              {item.description ? <Text style={[styles.checkboxDescription, state.is_checked && styles.textMuted]}>{item.description}</Text> : null}
                            </View>
                          </TouchableOpacity>
                          {deviceConf?.is_photo_required && (
                            <View style={styles.photoSection}>
                              {state.evidence_file ? (
                                <View style={styles.photoPreviewContainer}>
                                  <TouchableOpacity onPress={() => setPreviewImage(state.local_uri || getImageUrl(state.evidence_file!))}>
                                    <Image source={{ uri: state.local_uri || getImageUrl(state.evidence_file!) }} style={styles.photoPreview} />
                                  </TouchableOpacity>
                                  <TouchableOpacity style={styles.retakeButton} onPress={() => handlePickImage(stateKey)} disabled={loadingImageKey === stateKey}>
                                    <Text style={styles.retakeButtonText}>Retake</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <TouchableOpacity style={[styles.uploadPhotoButton, loadingImageKey === stateKey && { opacity: 0.6 }]} onPress={() => handlePickImage(stateKey)} disabled={loadingImageKey === stateKey}>
                                  {loadingImageKey === stateKey ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <ImageIcon color={colors.textMuted} />}
                                  <Text style={styles.uploadPhotoText}>Upload Foto</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.sectionTitle}>Checklist</Text>
            )}
            {/* Flat checklist (no devices) */}
            {!routine?.device_items?.length && routine?.items?.map((item) => {
              const stateKey = `::${item.id}`;
              const state = itemStates[stateKey];
              if (!state) return null;

              return (
                <View key={item.id} style={styles.checklistItem}>
                  {/* Checkbox Row */}
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => handleCheckToggle(stateKey)}
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
                          <TouchableOpacity onPress={() => setPreviewImage(state.local_uri || getImageUrl(state.evidence_file!))}>
                            <Image
                              source={{
                                uri:
                                  state.local_uri ||
                                  getImageUrl(state.evidence_file!),
                              }}
                              style={styles.photoPreview}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.retakeButton}
                            onPress={() => handlePickImage(stateKey)}
                            disabled={loadingImageKey === stateKey}
                          >
                            <Text style={styles.retakeButtonText}>Retake</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.uploadPhotoButton,
                            loadingImageKey === stateKey && { opacity: 0.6 },
                          ]}
                          onPress={() => handlePickImage(stateKey)}
                          disabled={loadingImageKey === stateKey}
                        >
                          {loadingImageKey === stateKey ? (
                            <ActivityIndicator size="small" color={colors.textSecondary} />
                          ) : (
                            <>
                              <ImageIcon color={colors.textMuted} style={{ marginRight: 8 }} />
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
                      placeholderTextColor={colors.textMuted}
                      value={state.notes}
                      onChangeText={(text) => updateItemState(stateKey, { notes: text })}
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
        <ImageViewerModal visible={!!previewImage} uri={previewImage} onClose={() => setPreviewImage(null)} />
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
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
    color: c.onGradient,
  },
  contentContainer: {
    flex: 1,
    marginTop: -20,
    backgroundColor: c.card,
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
    color: c.textStrong,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: c.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: c.border,
    marginVertical: 16,
  },

  // Device grouping
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
    marginTop: 4,
  },
  deviceHeaderIcon: { fontSize: 16 },
  deviceHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: c.primary,
    flex: 1,
  },
  deviceProgressLabel: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  deviceProgressDone: {
    backgroundColor: c.successSoft,
    color: c.success,
  },
  deviceProgressPending: {
    backgroundColor: c.warningSoft,
    color: c.warning,
  },
  deviceTabBar: {
    marginBottom: 12,
    marginTop: 4,
    maxHeight: 72,
  },
  deviceTab: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: c.border,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    minWidth: 80,
    gap: 2,
  },
  deviceTabActive: {
    backgroundColor: c.primarySoft,
    borderColor: c.primary,
  },
  deviceTabIcon: { fontSize: 14 },
  deviceTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: c.textSecondary,
    maxWidth: 90,
  },
  deviceTabTextActive: {
    color: c.primary,
  },
  deviceTabProgress: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  deviceTabDone: {
    backgroundColor: c.successSoft,
    color: c.success,
  },
  deviceTabPending: {
    backgroundColor: c.warningSoft,
    color: c.warning,
  },

  // Checklist Item
  checklistItem: {
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
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
    borderColor: c.borderStrong,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: c.success,
    borderColor: c.success,
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: c.textStrong,
  },
  checkboxLabelChecked: {
    color: c.success,
    textDecorationLine: "line-through",
  },
  checkboxDescription: {
    fontSize: 13,
    color: c.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  textMuted: {
    color: c.textSecondary,
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
    backgroundColor: c.border,
  },
  retakeButton: {
    backgroundColor: c.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retakeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: c.textSecondary,
  },
  uploadPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    borderRadius: 12,
    padding: 12,
    borderStyle: "dashed",
    backgroundColor: c.inputBg,
  },
  uploadPhotoText: {
    fontSize: 13,
    color: c.textSecondary,
    fontWeight: "600",
  },

  // Notes
  notesContainer: {
    marginTop: 8,
    marginLeft: 36,
  },
  notesInput: {
    backgroundColor: c.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    padding: 10,
    fontSize: 13,
    color: c.text,
    minHeight: 40,
  },

  // Submit
  submitButton: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: c.success,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: c.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 16,
  },
  submitButtonText: {
    color: c.onGradient,
    fontSize: 16,
    fontWeight: "bold",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
});
