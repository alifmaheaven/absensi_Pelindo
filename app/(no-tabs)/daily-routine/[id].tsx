import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, CheckRounded, Device } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { IMAGE_BASE_PATH, IMAGE_MAX_WIDTH, IMAGE_QUALITY } from "@/constants";
import {
  getDailyRoutineById,
  getTodayRoutines,
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
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import ImageViewerModal from "@/components/ImageViewerModal";
import ChecklistItemCard, { IItemState } from "@/components/daily-routine/ChecklistItemCard";
import RoutineDetailSkeleton from "@/components/daily-routine/RoutineDetailSkeleton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface IDeviceGroup {
  device_id: string;
  device_name: string;
  items: IDailyRoutineItem[];
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const getDraftKey = (routineId: string, logDate?: string | null) => {
  const datePart = logDate || new Date().toISOString().split("T")[0];
  return `@dr_draft_${routineId}_${datePart}`;
};

export default function DailyRoutineDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingImageKey, setLoadingImageKey] = useState<string | null>(null);
  const [activeDeviceTab, setActiveDeviceTab] = useState<string>("");
  const [deviceGroups, setDeviceGroups] = useState<IDeviceGroup[]>([]);

  const [routine, setRoutine] = useState<IDailyRoutine | null>(null);
  const [logData, setLogData] = useState<IDailyRoutineLog | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, IItemState>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const isInitializedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isReadOnly = logData?.status === "completed";

  const fetchData = async () => {
    try {
      setLoading(true);

      if (!id) {
        showToast("Routine ID tidak ditemukan", "error");
        router.back();
        return;
      }

      // Fetch routine detail by ID (template + items) and today's routines in parallel
      const [routineRes, todayRes] = await Promise.all([
        getDailyRoutineById(id).catch(() => null),
        getTodayRoutines().catch(() => null),
      ]);

      const routineDetail = routineRes?.data;
      const todayRoutines = todayRes?.data?.routines || [];
      const matchingToday = todayRoutines.find((r) => r.routine?.id === id);

      if (!routineDetail) {
        showToast("Routine tidak ditemukan", "error");
        router.back();
        return;
      }

      const targetLog = matchingToday?.log || null;
      const targetLogItems = matchingToday?.log_items || [];

      setRoutine(routineDetail);
      setLogData(targetLog);

      const matchingLogItems = targetLogItems.filter(
        (li: IDailyRoutineLogItem) =>
          routineDetail.items?.some((ri: IDailyRoutineItem) => ri.id === li.daily_routine_item_id)
      );

      // Initialize item states
      const states: Record<string, IItemState> = {};
      const logItemLookup: Record<string, IDailyRoutineLogItem> = {};
      const logItemLookupByItem: Record<string, IDailyRoutineLogItem> = {};
      matchingLogItems.forEach((li: any) => {
        const key = `${li.device_id || ""}::${li.daily_routine_item_id}`;
        logItemLookup[key] = li;
        if (!li.device_id && !logItemLookupByItem[li.daily_routine_item_id]) {
          logItemLookupByItem[li.daily_routine_item_id] = li;
        }
      });

      const groups: IDeviceGroup[] = [];
      if (routineDetail.device_items?.length) {
        const deviceMap: Record<string, IDeviceGroup> = {};
        (routineDetail.device_items as any[]).forEach((di: any) => {
          const key = di.device_id;
          if (!deviceMap[key]) {
            deviceMap[key] = {
              device_id: key,
              device_name: di.device_name || "Unknown Device",
              items: [],
            };
          }
        });

        (routineDetail.items || []).forEach((item: IDailyRoutineItem) => {
          (routineDetail.device_items as any[]).forEach((di: any) => {
            if (di.daily_routine_item_id === item.id && deviceMap[di.device_id]) {
              if (!deviceMap[di.device_id].items.some((i) => i.id === item.id)) {
                deviceMap[di.device_id].items.push(item);
              }
            }
          });
        });

        const sortedGroups = Object.values(deviceMap);
        groups.push(...sortedGroups);
        if (sortedGroups.length > 0 && !activeDeviceTab) {
          setActiveDeviceTab(sortedGroups[0].device_id);
        }

        sortedGroups.forEach((group) => {
          group.items.forEach((item) => {
            const stateKey = `${group.device_id}::${item.id}`;
            const existingLogItem = logItemLookup[stateKey] || logItemLookupByItem[item.id];
            states[stateKey] = {
              daily_routine_item_id: item.id,
              device_id: group.device_id,
              is_checked: existingLogItem?.is_checked || false,
              evidence_file:
                existingLogItem?.device_id === group.device_id || !existingLogItem?.device_id
                  ? existingLogItem?.evidence_file || null
                  : null,
              notes:
                existingLogItem?.device_id === group.device_id || !existingLogItem?.device_id
                  ? existingLogItem?.notes || ""
                  : "",
              local_uri: null,
              upload_failed: false,
            };
          });
        });
      }
      setDeviceGroups(groups);

      if (!routineDetail.device_items?.length) {
        (routineDetail.items || []).forEach((item: IDailyRoutineItem) => {
          const stateKey = `::${item.id}`;
          const existingLogItem = logItemLookup[stateKey] || logItemLookupByItem[item.id];
          states[stateKey] = {
            daily_routine_item_id: item.id,
            is_checked: existingLogItem?.is_checked || false,
            evidence_file: existingLogItem?.evidence_file || null,
            notes: existingLogItem?.notes || "",
            local_uri: null,
            upload_failed: false,
          };
        });
      }

      // M7: Restore local draft from AsyncStorage if log is not completed
      if (targetLog?.status !== "completed") {
        try {
          const draftKey = getDraftKey(id, targetLog?.date);
          const rawDraft = await AsyncStorage.getItem(draftKey);
          if (rawDraft) {
            const draftStates: Record<string, IItemState> = JSON.parse(rawDraft);
            Object.entries(draftStates).forEach(([key, draftItem]) => {
              if (states[key]) {
                states[key] = {
                  ...states[key],
                  is_checked: draftItem.is_checked ?? states[key].is_checked,
                  notes: draftItem.notes ?? states[key].notes,
                  evidence_file: draftItem.evidence_file ?? states[key].evidence_file,
                  local_uri: draftItem.local_uri ?? states[key].local_uri,
                  upload_failed: draftItem.upload_failed ?? states[key].upload_failed,
                };
              }
            });
          }
        } catch (e) {
          console.warn("Failed to restore draft:", e);
        }
      }

      setItemStates(states);
      isInitializedRef.current = true;
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
    }, [id])
  );

  // M7: Draft autosave to AsyncStorage (debounce ~500 ms)
  useEffect(() => {
    if (!isInitializedRef.current || !id || logData?.status === "completed") {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const draftKey = getDraftKey(id, logData?.date);
        await AsyncStorage.setItem(draftKey, JSON.stringify(itemStates));
      } catch (e) {
        console.warn("Autosave draft error:", e);
      }
    }, 500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [itemStates, id, logData?.status, logData?.date]);

  const updateItemState = (stateKey: string, updates: Partial<IItemState>) => {
    setItemStates((prev) => ({
      ...prev,
      [stateKey]: { ...prev[stateKey], ...updates },
    }));
  };

  const handleCheckToggle = (stateKey: string) => {
    if (isReadOnly) return;
    const item = itemStates[stateKey];
    if (item) updateItemState(stateKey, { is_checked: !item.is_checked });
  };

  const handlePickImage = async (stateKey: string) => {
    if (isReadOnly) return;

    setLoadingImageKey(stateKey);

    try {
      // M1: Fix izin kamera (let status dan update status dari requestCameraPermissionsAsync)
      let { status } = await ImagePicker.getCameraPermissionsAsync();

      if (status === ImagePicker.PermissionStatus.UNDETERMINED) {
        const newPermission = await ImagePicker.requestCameraPermissionsAsync();
        status = newPermission.status;
        if (status !== ImagePicker.PermissionStatus.GRANTED) {
          showToast("Izin kamera diperlukan untuk mengambil bukti foto", "error");
          setLoadingImageKey(null);
          return;
        }
      }

      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert(
          "Izin Diperlukan",
          "Aplikasi membutuhkan akses Kamera untuk mengambil bukti foto fisik. Mohon aktifkan di pengaturan perangkat.",
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

      if (result.canceled || !result.assets?.[0]) {
        setLoadingImageKey(null);
        return;
      }

      const compressed = await compressImage(result.assets[0], {
        maxWidth: IMAGE_MAX_WIDTH,
        quality: IMAGE_QUALITY,
      });

      const localUri = compressed?.uri || result.assets[0].uri;

      // M7: Coba upload ke server, simpan URI lokal + flag retry bila gagal
      try {
        const uploadRes = await uploadDailyRoutineTemp({
          uri: localUri,
          name: `daily-routine-${Date.now()}.jpg`,
          type: "image/jpeg",
        } as any);

        const serverPath = uploadRes.data?.[0]?.path ?? "";
        updateItemState(stateKey, {
          evidence_file: serverPath,
          local_uri: localUri,
          upload_failed: false,
        });
      } catch (uploadErr) {
        console.warn("Upload gagal saat ambil foto, disimpan lokal:", uploadErr);
        updateItemState(stateKey, {
          evidence_file: null,
          local_uri: localUri,
          upload_failed: true,
        });
        showToast("Foto disimpan di draft. Gagal upload ke server, ketuk Coba Lagi.", "info");
      }
    } catch (error) {
      console.error("Pick image error:", error);
      showToast("Gagal mengambil gambar", "error");
    } finally {
      setLoadingImageKey(null);
    }
  };

  const handleRetryUpload = async (stateKey: string) => {
    if (isReadOnly) return;
    const itemState = itemStates[stateKey];
    if (!itemState || !itemState.local_uri) return;

    setLoadingImageKey(stateKey);
    try {
      const uploadRes = await uploadDailyRoutineTemp({
        uri: itemState.local_uri,
        name: `daily-routine-${Date.now()}.jpg`,
        type: "image/jpeg",
      } as any);

      const serverPath = uploadRes.data?.[0]?.path ?? "";
      updateItemState(stateKey, {
        evidence_file: serverPath,
        upload_failed: false,
      });
      showToast("Foto berhasil diunggah!", "success");
    } catch (err: any) {
      console.error("Retry upload error:", err);
      showToast(err?.message || "Gagal mengunggah foto. Periksa koneksi internet.", "error");
    } finally {
      setLoadingImageKey(null);
    }
  };

  const handleSubmit = async () => {
    if (isReadOnly) {
      showToast("Log sudah selesai dan tidak dapat diubah", "info");
      return;
    }

    if (!logData) {
      showToast("Log belum dimulai", "error");
      return;
    }

    const states = Object.values(itemStates);

    // M7: Periksa apakah ada foto yang gagal diunggah
    const failedItem = states.find((s) => s.is_checked && s.upload_failed);
    if (failedItem) {
      const rItem = routine?.items.find((ri) => ri.id === failedItem.daily_routine_item_id);
      showToast(
        `Foto untuk "${rItem?.name || "Item"}" belum terunggah ke server. Silakan ketuk Coba Lagi pada foto.`,
        "error"
      );
      return;
    }

    // M3: Validasi foto-wajib per item & per device
    for (const item of states) {
      if (!item.is_checked) continue;
      const routineItem = routine?.items.find(
        (ri) => ri.id === item.daily_routine_item_id
      );
      const deviceConf = (routine?.device_items || []).find(
        (di: any) =>
          di.device_id === item.device_id &&
          di.daily_routine_item_id === item.daily_routine_item_id
      );
      const requiresPhoto =
        deviceConf?.is_photo_required ?? routineItem?.is_photo_required ?? false;

      if (requiresPhoto && !item.evidence_file) {
        showToast(
          `"${routineItem?.name || "Item"}" membutuhkan foto bukti`,
          "error"
        );
        return;
      }
    }

    // Siapkan payload submit dengan device_id (M5)
    const submitItems = states.map((item) => ({
      daily_routine_item_id: item.daily_routine_item_id,
      device_id: item.device_id || null,
      is_checked: item.is_checked,
      ...(item.evidence_file && { evidence_file: item.evidence_file }),
      ...(item.notes && { notes: item.notes }),
    }));

    // Konfirmasi submit parsial (Ruling Observer #11)
    const uncheckedCount = states.filter((s) => !s.is_checked).length;
    if (uncheckedCount > 0) {
      Alert.alert(
        "Konfirmasi Penyelesaian",
        `Terdapat ${uncheckedCount} item yang belum dicentang. Apakah Anda yakin ingin menyelesaikan Daily Routine sekarang?`,
        [
          { text: "Periksa Lagi", style: "cancel" },
          { text: "Ya, Selesaikan", onPress: () => doSubmit(submitItems) },
        ]
      );
      return;
    }

    await doSubmit(submitItems);
  };

  const doSubmit = async (submitItems: any[]) => {
    if (!logData || !id) return;
    setSubmitting(true);
    try {
      await submitDailyRoutineLog(logData.id, submitItems);

      // M7: Hapus draft lokal setelah submit berhasil
      try {
        const draftKey = getDraftKey(id, logData.date);
        await AsyncStorage.removeItem(draftKey);
      } catch (e) {
        console.warn("Remove draft error:", e);
      }

      showToast("Daily routine berhasil diselesaikan!", "success");
      router.replace("/(no-tabs)/daily-routine");
    } catch (error: any) {
      console.error("Submit error:", error);
      showToast(
        error?.response?.data?.message || error?.message || "Gagal submit",
        "error"
      );
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

  const handleHeaderBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(no-tabs)/daily-routine");
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
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleHeaderBack}
                style={styles.backButton}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <ArrowLeft color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Daily Routine</Text>
              <View style={{ width: 40 }} />
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.contentContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {loading ? (
              // Skeleton loader (M8 - P2)
              <RoutineDetailSkeleton />
            ) : (
              <>
                {/* M6: Banner Read-Only saat status completed */}
                {isReadOnly && (
                  <View style={styles.completedBanner}>
                    <CheckRounded color={colors.success} width={20} height={20} />
                    <Text style={styles.completedBannerText}>
                      Daily Routine telah selesai dikerjakan
                      {logData?.submitted_at
                        ? ` (${logData.submitted_at.slice(0, 16)})`
                        : ""}. Halaman ini dalam mode hanya-baca (read-only).
                    </Text>
                  </View>
                )}

                {/* Routine Info */}
                <Text style={styles.sectionTitle}>{routine?.name}</Text>
                {routine?.description ? (
                  <Text style={styles.sectionDescription}>{routine.description}</Text>
                ) : null}

                <View style={styles.divider} />

                {/* Checklist Items — tabbed by device if device_items exist */}
                {deviceGroups.length > 0 ? (
                  <>
                    {/* Device Tabs */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.deviceTabBar}
                    >
                      {deviceGroups.map((group) => {
                        const progress = getDeviceProgress(group.device_id);
                        const isActive = activeDeviceTab === group.device_id;
                        const allDone =
                          progress.total > 0 && progress.checked === progress.total;
                        return (
                          <TouchableOpacity
                            key={group.device_id}
                            style={[
                              styles.deviceTab,
                              isActive && styles.deviceTabActive,
                            ]}
                            onPress={() => setActiveDeviceTab(group.device_id)}
                            activeOpacity={0.7}
                          >
                            <Device
                              width={15}
                              height={15}
                              color={isActive ? colors.primary : colors.textSecondary}
                            />
                            <Text
                              style={[
                                styles.deviceTabText,
                                isActive && styles.deviceTabTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {group.device_name}
                            </Text>
                            <Text
                              style={[
                                styles.deviceTabProgress,
                                allDone
                                  ? styles.deviceTabDone
                                  : styles.deviceTabPending,
                              ]}
                            >
                              {progress.checked}/{progress.total}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Active Device Checklist */}
                    {deviceGroups
                      .filter((g) => g.device_id === activeDeviceTab)
                      .map((group) => {
                        const progress = getDeviceProgress(group.device_id);
                        const isDeviceDone =
                          progress.total > 0 && progress.checked === progress.total;

                        return (
                          <View key={group.device_id} style={{ marginBottom: 16 }}>
                            <View style={styles.deviceHeader}>
                              <Device
                                width={18}
                                height={18}
                                color={colors.primary}
                              />
                              <Text style={styles.deviceHeaderText}>
                                {group.device_name}
                              </Text>
                              <Text
                                style={[
                                  styles.deviceProgressLabel,
                                  isDeviceDone
                                    ? styles.deviceProgressDone
                                    : styles.deviceProgressPending,
                                ShadcnBadgeStyle,
                                ]}
                              >
                                {progress.checked}/{progress.total}
                              </Text>
                            </View>

                            {group.items.map((item) => {
                              const stateKey = `${group.device_id}::${item.id}`;
                              const state = itemStates[stateKey];
                              if (!state) return null;

                              // M3: Cocokkan device_id spesifik
                              const deviceConf = (routine?.device_items || []).find(
                                (di: any) =>
                                  di.device_id === group.device_id &&
                                  di.daily_routine_item_id === item.id
                              );
                              const requiresPhoto =
                                deviceConf?.is_photo_required ??
                                item.is_photo_required ??
                                false;

                              return (
                                <ChecklistItemCard
                                  key={item.id}
                                  item={item}
                                  state={state}
                                  requiresPhoto={requiresPhoto}
                                  isReadOnly={isReadOnly}
                                  loadingImage={loadingImageKey === stateKey}
                                  onToggle={() => handleCheckToggle(stateKey)}
                                  onPickImage={() => handlePickImage(stateKey)}
                                  onRetryUpload={() => handleRetryUpload(stateKey)}
                                  onPreviewImage={(uri) => setPreviewImage(uri)}
                                  onChangeNotes={(text) =>
                                    updateItemState(stateKey, { notes: text })
                                  }
                                  getImageUrl={getImageUrl}
                                />
                              );
                            })}
                          </View>
                        );
                      })}
                  </>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>Checklist</Text>
                    {routine?.items?.map((item) => {
                      const stateKey = `::${item.id}`;
                      const state = itemStates[stateKey];
                      if (!state) return null;
                      const requiresPhoto = item.is_photo_required ?? false;

                      return (
                        <ChecklistItemCard
                          key={item.id}
                          item={item}
                          state={state}
                          requiresPhoto={requiresPhoto}
                          isReadOnly={isReadOnly}
                          loadingImage={loadingImageKey === stateKey}
                          onToggle={() => handleCheckToggle(stateKey)}
                          onPickImage={() => handlePickImage(stateKey)}
                          onRetryUpload={() => handleRetryUpload(stateKey)}
                          onPreviewImage={(uri) => setPreviewImage(uri)}
                          onChangeNotes={(text) =>
                            updateItemState(stateKey, { notes: text })
                          }
                          getImageUrl={getImageUrl}
                        />
                      );
                    })}
                  </>
                )}

                {/* Submit / Completed Action Button (M6) */}
                {isReadOnly ? (
                  <View style={styles.completedFooterBtn}>
                    <CheckRounded width={18} height={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.completedFooterText}>
                      Daily Routine Telah Selesai
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      submitting && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.8}
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
                )}

                <View style={{ height: 40 }} />
              </>
            )}
          </ScrollView>
        </View>

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

const ShadcnBadgeStyle = {
  overflow: "hidden" as const,
};

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
      fontSize: 13,
      color: c.textSecondary,
      marginBottom: 8,
      lineHeight: 19,
    },
    divider: {
      width: "100%",
      height: 1,
      backgroundColor: c.border,
      marginVertical: 16,
    },

    // M6: Completed Banner
    completedBanner: {
      backgroundColor: c.successSoft,
      borderWidth: 1,
      borderColor: c.success,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    completedBannerText: {
      fontSize: 13,
      color: c.success,
      fontWeight: "600",
      flex: 1,
      lineHeight: 18,
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
      marginBottom: 12,
      marginTop: 4,
    },
    deviceHeaderText: {
      fontSize: 14,
      fontWeight: "700",
      color: c.primary,
      flex: 1,
    },
    deviceProgressLabel: {
      fontSize: 12,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
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
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      minWidth: 84,
      gap: 3,
    },
    deviceTabActive: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    deviceTabText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textSecondary,
      maxWidth: 90,
    },
    deviceTabTextActive: {
      color: c.primary,
      fontWeight: "700",
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

    // Submit
    submitButton: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      backgroundColor: c.success,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
      shadowColor: c.success,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
      marginTop: 16,
    },
    submitButtonText: {
      color: c.onGradient,
      fontSize: 15,
      fontWeight: "bold",
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    completedFooterBtn: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.success,
      borderRadius: 16,
      paddingVertical: 16,
      marginTop: 16,
      opacity: 0.8,
    },
    completedFooterText: {
      color: c.onGradient,
      fontSize: 15,
      fontWeight: "bold",
    },
  });
