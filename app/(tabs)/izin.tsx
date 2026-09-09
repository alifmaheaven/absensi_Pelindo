import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import {
  getAttendanceList,
  getAttendanceStatus,
  getEvidGroupId,
  uploadEvid,
  deleteEvidtmp,
  createGroupId,
  uploadEvidPermanent,
  uploadEvidGroupId,
} from "@/services/attendance";
import { deleteLeave, getMyLeaves, ILeaveRequest, resubmitLeave } from "@/services/leave";
import { useAuthStore } from "@/stores/auth";
import { formatAttendanceDate, parseWIBDate } from "@/utils/utils";
import { IAttendance, IAttendanceEvidGroupId, THttpErrorResult } from "@/types";
import { DocumentCheck, InfoOutlineRounded } from "@/components/icon";
import { Ionicons } from "@expo/vector-icons";
import EmptyState from "@/components/ui/EmptyState";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState , useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useToast } from "@/components/ui/toast";
import { IMAGE_BASE_PATH } from "@/constants";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const getStatusColor = (status: string, c: ThemeColors) => {
  switch (status) {
    case "Disetujui":
      return c.success;
    case "Pending":
      return c.warning;
    case "Ditolak":
      return c.danger;
    default:
      return c.textMuted;
  }
};

interface MergedItem {
  id: string;
  type: "attendance" | "leave_request";
  title: string;
  date: string;
  end_date?: string;
  status: string;
  rawStatus?: string;
  reason?: string;
  leave_type?: string;
  evidence_group_id?: string;
  rejection_reason?: string;
}

export default function IzinScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [mergedData, setMergedData] = useState<MergedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);

  // Detail modal state
  const [detailItem, setDetailItem] = useState<MergedItem | null>(null);
  const [detailEvidence, setDetailEvidence] = useState<IAttendanceEvidGroupId[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // Upload service untuk useImagePicker — upload ke temp dulu (sama pola
  // checkin/checkout), lalu handleResubmit memindahkan ke permanent.
  const imageUploadService = {
    uploadTemp: uploadEvid,
    deleteTemp: deleteEvidtmp,
  };

  const openDetail = async (item: MergedItem) => {
    setDetailItem(item);
    setDetailEvidence([]);
    setDetailLoading(true);
    // Fetch evidence bila item punya evidence_group_id (leave_request)
    if (item.type === "leave_request" && item.evidence_group_id) {
      try {
        const res = await getEvidGroupId({
          page: 1,
          per_page: 20,
          evidence_group_id_exact: [item.evidence_group_id],
        });
        const evs = (res?.data?.data || []).filter(
          (e) => e.evidence_group_id === item.evidence_group_id,
        );
        setDetailEvidence(evs);
      } catch (e) {
        console.error("Error fetching evidence:", e);
        showToast("Gagal memuat lampiran", "error");
      }
    }
    setDetailLoading(false);
  };

  const handleResubmit = async () => {
    if (!detailItem || detailItem.type !== "leave_request") return;
    if (images.length === 0) {
      showToast("Upload minimal 1 gambar sebagai bukti!", "error");
      return;
    }
    setResubmitting(true);
    try {
      // Upload evidence ke group. Bila leave tidak punya evidence_group_id
      // (dibuat tanpa bukti), buat group baru dulu.
      let groupId = detailItem.evidence_group_id;
      if (!groupId) {
        const group = await createGroupId({
          name: `Leave ${user?.name}`,
          description: "Leave evidence",
        });
        groupId = group.data?.id ?? "";
        if (!groupId) {
          showToast("Gagal membuat bukti", "error");
          setResubmitting(false);
          return;
        }
      }
      for (const img of images) {
        const uploaded = await uploadEvidPermanent({ links: [img.path] });
        const file = uploaded.data?.links?.[0];
        if (!file) continue;
        await uploadEvidGroupId({
          name: `Leave ${user?.name}`,
          description: "Evidence",
          file,
          evidence_group_id: groupId,
        });
      }
      await resubmitLeave({ id: detailItem.id, evidence_group_id: groupId });
      showToast("Pengajuan diajukan ulang!", "success");
      setDetailItem(null);
      setImages([]);
      fetchAll();
    } catch (error) {
      console.error("Resubmit error:", error);
      showToast("Gagal mengajukan ulang", "error");
    } finally {
      setResubmitting(false);
    }
  };

  // R-LZ-4: Hapus pengajuan izin milik sendiri (pending/rejected)
  const confirmDelete = (item: MergedItem) => {
    if (item.type !== "leave_request") return;

    if (item.status === "Disetujui" || item.rawStatus === "approved") {
      Alert.alert(
        "Tidak Dapat Dihapus",
        "Izin yang sudah disetujui hanya bisa dihapus oleh approver."
      );
      return;
    }

    Alert.alert(
      "Konfirmasi Hapus",
      `Apakah Anda yakin ingin menghapus pengajuan ${item.title.toLowerCase()} ini?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => performDelete(item.id),
        },
      ]
    );
  };

  const performDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await deleteLeave(id);
      showToast("Pengajuan izin berhasil dihapus", "success");
      if (detailItem?.id === id) {
        setDetailItem(null);
      }
      await fetchAll();
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error("Delete leave error:", err);
      if (
        err?.code === 403 ||
        err?.message?.toLowerCase().includes("approved") ||
        err?.message?.toLowerCase().includes("approver")
      ) {
        Alert.alert(
          "Tidak Dapat Dihapus",
          "Izin yang sudah disetujui hanya bisa dihapus oleh approver."
        );
        showToast(
          "Izin yang sudah disetujui hanya bisa dihapus oleh approver.",
          "error"
        );
      } else {
        Alert.alert(
          "Gagal Menghapus",
          err?.message || "Terjadi kesalahan saat menghapus pengajuan izin."
        );
        showToast("Gagal menghapus pengajuan", "error");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      setIsError(false);

      const [attendanceRes, statusRes, leavesRes] = await Promise.all([
        getAttendanceList({
          page: 1,
          per_page: 20,
          order_by_desc: ["created_at"],
          user_id_exact: [user.id],
        }),
        getAttendanceStatus({ page: 1, per_page: 10 }),
        getMyLeaves({ page: 1, per_page: 20 }),
      ]);

      const attendance = attendanceRes?.data?.data || [];
      const status = statusRes.data?.data || [];
      const leaves: ILeaveRequest[] = Array.isArray(leavesRes) ? leavesRes : [];

      const statusMap: Record<string, string> = {};
      const attendId = status.find((s) => s.name?.toLowerCase() === "attend")?.id || "";
      status.forEach((s) => { statusMap[s.id] = s.name; });

      // 1. Leave requests milik sendiri (pending, approved, rejected)
      const leaveItems: MergedItem[] = leaves.map((lr) => {
        const leaveTypeLabel = lr.leave_type === "cuti" ? "Cuti" : "Izin";
        return {
          id: lr.id,
          type: "leave_request",
          title: leaveTypeLabel,
          date: lr.leave_date,
          end_date: lr.end_date,
          status: lr.status === "approved" ? "Disetujui" : lr.status === "rejected" ? "Ditolak" : "Pending",
          rawStatus: lr.status,
          reason: lr.reason,
          leave_type: lr.leave_type,
          evidence_group_id: lr.evidence_group_id,
          rejection_reason: lr.rejection_reason,
        };
      });

      // Helper untuk mengecek apakah attendance record checkin jatuh pada rentang leave request yang sudah di-approve
      const isCoveredByApprovedLeave = (checkinStr?: string | null) => {
        if (!checkinStr) return false;
        const checkinDay = checkinStr.split(/[T ]/)[0];
        return leaves.some((lr) => {
          if (lr.status !== "approved") return false;
          const start = (lr.leave_date || "").split(/[T ]/)[0];
          const end = (lr.end_date || lr.leave_date || "").split(/[T ]/)[0];
          return checkinDay >= start && checkinDay <= end;
        });
      };

      // 2. Attendance records non-Attend (misal CRUD manual attendance oleh admin web)
      const attendanceItems: MergedItem[] = attendance
        .filter(
          (item) =>
            item.attendance_status_id !== attendId &&
            !isCoveredByApprovedLeave(item.checkin)
        )
        .map((item) => ({
          id: item.id,
          type: "attendance",
          title: statusMap[item.attendance_status_id] || item.description || "Izin/Cuti",
          date: item.checkin ?? "",
          status: item.checkin ? "Disetujui" : "Pending",
          reason: item.description,
        }));

      const merged: MergedItem[] = [...leaveItems, ...attendanceItems];

      // Sort by date desc — parse WIB (andal di Hermes), NaN → 0 (stabil)
      const dateVal = (d?: string) => {
        const parsed = parseWIBDate(d);
        return parsed ? parsed.getTime() : 0;
      };
      merged.sort((a, b) => dateVal(b.date) - dateVal(a.date));

      setMergedData(merged);
    } catch (error) {
      console.error("Failed to fetch izin data:", error);
      setIsError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  // Refresh every time this tab gets focus
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  let content: React.ReactNode;

  if (isLoading && !refreshing) {
    content = <IzinSkeleton />;
  } else if (isError) {
    content = (
      <EmptyState
        variant="error"
        title="Gagal Memuat Pengajuan"
        description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
        actionLabel="Coba Lagi"
        onAction={() => {
          fetchAll();
        }}
      />
    );
  } else if (mergedData.length === 0) {
    content = (
      <EmptyState
        title="Belum Ada Pengajuan"
        description="Anda belum memiliki riwayat pengajuan izin atau cuti kerja."
        actionLabel="Ajukan Izin/Cuti"
        onAction={() => router.push("/(no-tabs)/leave/create")}
        icon={<DocumentCheck color={colors.primary} width={36} height={36} />}
      />
    );
  } else {
    content = mergedData.map((item) => {
      const isApprovedLeave =
        item.type === "leave_request" &&
        (item.status === "Disetujui" || item.rawStatus === "approved");
      const canDelete =
        item.type === "leave_request" &&
        (item.status === "Pending" ||
          item.status === "Ditolak" ||
          item.rawStatus === "pending" ||
          item.rawStatus === "rejected");

      const dateLabel =
        item.end_date && item.end_date !== item.date
          ? `${formatAttendanceDate(item.date, false, { day: "numeric", month: "short", year: "numeric" })} - ${formatAttendanceDate(item.end_date, false, { day: "numeric", month: "short", year: "numeric" })}`
          : formatAttendanceDate(item.date, false, { day: "numeric", month: "long", year: "numeric" });

      return (
        <TouchableOpacity
          key={`${item.type}-${item.id}`}
          style={styles.izinCard}
          onPress={() => openDetail(item)}
          activeOpacity={0.7}
        >
          <View style={styles.izinHeader}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.izinType}>
                {item.title}
                {item.leave_type === "cuti" && item.type === "leave_request" ? " (Cuti)" : item.leave_type === "izin" && item.type === "leave_request" ? " (Izin)" : ""}
              </Text>
              {item.type === "leave_request" && item.status === "Pending" && (
                <Text style={styles.pendingDot}>⏳</Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status, colors) }]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
              {canDelete ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    confirmDelete(item);
                  }}
                  style={styles.cardDeleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  )}
                </TouchableOpacity>
              ) : isApprovedLeave ? (
                <View style={styles.cardLockedBadge}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.izinDetails}>
            <Text style={styles.izinDate}>📅 {dateLabel}</Text>
          </View>
          {item.reason ? (
            <Text style={styles.reasonText} numberOfLines={2}>💬 {item.reason}</Text>
          ) : null}
        </TouchableOpacity>
      );
    });
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1e90ff", "#4fc3f7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Izin/Cuti</Text>
        <Text style={styles.headerSubtitle}>Kelola pengajuan izin Anda</Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchAll();
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Apply Button */}
        <TouchableOpacity
          style={styles.applyButton}
          onPress={() => router.push("/(no-tabs)/leave/create")}
        >
          <Text style={styles.applyButtonText}>+ Ajukan Izin/Cuti</Text>
        </TouchableOpacity>

        {/* History */}
        <Text style={styles.sectionTitle}>Riwayat Pengajuan</Text>

        {content}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={!!detailItem}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>Detail Pengajuan</Text>

            {detailItem ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipe</Text>
                  <Text style={styles.detailValue}>
                    {detailItem.title}
                    {detailItem.leave_type === "cuti" ? " (Cuti)" : detailItem.leave_type === "izin" ? " (Izin)" : ""}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tanggal</Text>
                  <Text style={styles.detailValue}>
                    {detailItem.end_date && detailItem.end_date !== detailItem.date
                      ? `${formatAttendanceDate(detailItem.date, false, { day: "numeric", month: "short", year: "numeric" })} s/d ${formatAttendanceDate(detailItem.end_date, false, { day: "numeric", month: "short", year: "numeric" })}`
                      : formatAttendanceDate(detailItem.date, false, { day: "numeric", month: "long", year: "numeric" })}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(detailItem.status, colors) }]}>
                    <Text style={styles.statusText}>{detailItem.status}</Text>
                  </View>
                </View>
                {detailItem.reason ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Alasan</Text>
                    <Text style={styles.detailValue}>{detailItem.reason}</Text>
                  </View>
                ) : null}
                {detailItem.rejection_reason ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Alasan Ditolak</Text>
                    <Text style={[styles.detailValue, { color: colors.danger }]}>{detailItem.rejection_reason}</Text>
                  </View>
                ) : null}

                {/* Evidence */}
                <Text style={styles.sectionTitle}>Bukti</Text>
                {detailLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : detailEvidence.length > 0 ? (
                  <View style={styles.evidenceGrid}>
                    {detailEvidence.map((ev) => (
                      <Image
                        key={ev.id}
                        source={{ uri: new URL(`${IMAGE_BASE_PATH}${ev.file}`, BASE_URL).toString() }}
                        style={styles.evidenceThumb}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noEvidenceText}>Tidak ada bukti</Text>
                )}

                {/* Update evidence bila ditolak */}
                {detailItem.type === "leave_request" && detailItem.status === "Ditolak" ? (
                  <View style={styles.resubmitSection}>
                    <Text style={styles.resubmitHint}>
                      Pengajuan ditolak. Upload ulang bukti untuk mengajukan ulang.
                    </Text>
                    {images.length > 0 ? (
                      <View style={styles.evidenceGrid}>
                        {images.map((img, i) => (
                          <View key={i} style={styles.newEvidenceWrap}>
                            <Image source={{ uri: img.uri }} style={styles.evidenceThumb} />
                            <TouchableOpacity
                              style={styles.removeBtn}
                              onPress={() => removeImage(i, imageUploadService)}
                            >
                              <Text style={styles.removeBtnText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.uploadBtn}
                      onPress={openModal}
                      disabled={loadingImage || resubmitting}
                    >
                      <Text style={styles.uploadBtnText}>
                        {loadingImage ? "Memproses..." : "+ Tambah Bukti"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.resubmitBtn, (resubmitting || images.length === 0) && { opacity: 0.5 }]}
                      onPress={handleResubmit}
                      disabled={resubmitting || images.length === 0}
                    >
                      {resubmitting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.resubmitBtnText}>Ajukan Ulang</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* R-LZ-4: Action Hapus untuk pending/rejected atau Info untuk approved */}
                {detailItem.type === "leave_request" &&
                (detailItem.status === "Disetujui" || detailItem.rawStatus === "approved") ? (
                  <View style={styles.approvedNoticeContainer}>
                    <InfoOutlineRounded color={colors.warning} width={20} height={20} />
                    <Text style={styles.approvedNoticeText}>
                      Izin yang sudah disetujui hanya bisa dihapus oleh approver.
                    </Text>
                  </View>
                ) : null}

                {detailItem.type === "leave_request" &&
                (detailItem.status === "Pending" ||
                  detailItem.status === "Ditolak" ||
                  detailItem.rawStatus === "pending" ||
                  detailItem.rawStatus === "rejected") ? (
                  <TouchableOpacity
                    style={[
                      styles.deleteModalBtn,
                      deletingId === detailItem.id && { opacity: 0.6 },
                    ]}
                    onPress={() => confirmDelete(detailItem)}
                    disabled={deletingId === detailItem.id}
                  >
                    {deletingId === detailItem.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="trash-outline" size={18} color="#fff" />
                        <Text style={styles.deleteModalBtnText}>Hapus Pengajuan</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailItem(null)}>
                  <Text style={styles.closeBtnText}>Tutup</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Image source modal (untuk update evidence) */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
          <View style={styles.modalContent}>
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>Pilih sumber Gambar</Text>
            <TouchableOpacity
              style={[styles.sourceBtnPrimary, { opacity: loadingImage ? 0.7 : 1 }]}
              onPress={() => pickImage("camera", imageUploadService)}
              disabled={loadingImage}
            >
              <Text style={styles.sourceBtnTextPrimary}>Ambil Dari Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sourceBtnSecondary, { opacity: loadingImage ? 0.7 : 1 }]}
              onPress={() => pickImage("gallery", imageUploadService)}
              disabled={loadingImage}
            >
              <Text style={styles.sourceBtnTextSecondary}>Ambil Dari Galeri</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sourceBtnCancel} onPress={closeModal}>
              <Text style={styles.sourceBtnTextCancel}>Kembali</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const IzinSkeleton = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <>
      {[1, 2, 3].map((_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonBadge} />
          </View>
          <View style={styles.skeletonLine} />
        </View>
      ))}
    </>
  );
};

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.primarySoft,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: c.onGradient,
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  applyButton: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: c.onGradient,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: c.text,
    marginBottom: 12,
  },
  izinCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  izinHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  izinType: {
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: c.textMuted,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  izinDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  izinDate: {
    fontSize: 13,
    color: c.textSecondary,
  },
  reasonText: {
    fontSize: 12,
    color: c.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
  pendingDot: {
    fontSize: 14,
  },

  skeletonCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  skeletonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  skeletonTitle: {
    width: "50%",
    height: 14,
    borderRadius: 8,
    backgroundColor: c.border,
  },

  skeletonBadge: {
    width: 60,
    height: 16,
    borderRadius: 8,
    backgroundColor: c.border,
  },

  skeletonLine: {
    width: "40%",
    height: 12,
    borderRadius: 8,
    backgroundColor: c.border,
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },

  emptyIcon: {
    fontSize: 42,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
    marginBottom: 6,
  },

  emptySubtitle: {
    fontSize: 13,
    color: c.textSecondary,
    textAlign: "center",
  },

  // Detail modal
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
    maxHeight: "85%",
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
    marginBottom: 20,
    color: c.textStrong,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: c.textMuted,
    width: 100,
  },
  detailValue: {
    fontSize: 13,
    color: c.text,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
  evidenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  evidenceThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: c.border,
  },
  noEvidenceText: {
    fontSize: 13,
    color: c.textMuted,
    marginBottom: 8,
  },
  resubmitSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  resubmitHint: {
    fontSize: 13,
    color: c.danger,
    marginBottom: 12,
  },
  newEvidenceWrap: {
    position: "relative",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: c.overlay,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  removeBtnText: {
    color: c.onGradient,
    fontSize: 10,
    fontWeight: "bold",
  },
  uploadBtn: {
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: c.inputBg,
  },
  uploadBtnText: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: "600",
  },
  resubmitBtn: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  resubmitBtnText: {
    color: c.onGradient,
    fontWeight: "bold",
    fontSize: 15,
  },
  closeBtn: {
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  closeBtnText: {
    color: c.textSecondary,
    fontWeight: "600",
    fontSize: 15,
  },
  sourceBtnPrimary: {
    backgroundColor: c.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  sourceBtnTextPrimary: {
    color: c.onGradient,
    fontWeight: "bold",
    fontSize: 15,
  },
  sourceBtnSecondary: {
    backgroundColor: c.card,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  sourceBtnTextSecondary: {
    color: c.text,
    fontWeight: "600",
    fontSize: 15,
  },
  sourceBtnCancel: {
    backgroundColor: c.surface,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  sourceBtnTextCancel: {
    color: c.textSecondary,
    fontWeight: "600",
    fontSize: 15,
  },
  // R-LZ-4 Styles
  cardDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: c.dangerSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  cardLockedBadge: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: c.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  approvedNoticeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.warningSoft,
    borderColor: c.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  approvedNoticeText: {
    flex: 1,
    fontSize: 13,
    color: c.textStrong,
    fontWeight: "500",
    lineHeight: 18,
  },
  deleteModalBtn: {
    backgroundColor: c.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  deleteModalBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
});

