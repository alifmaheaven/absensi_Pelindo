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
import { getMyLeaves, ILeaveRequest, resubmitLeave } from "@/services/leave";
import { useAuthStore } from "@/stores/auth";
import { formatAttendanceDate, parseWIBDate } from "@/utils/utils";
import { IAttendance, IAttendanceEvidGroupId } from "@/types";
import { DocumentCheck } from "@/components/icon";
import EmptyState from "@/components/ui/EmptyState";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState , useMemo } from "react";
import {
  ActivityIndicator,
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
  status: string;
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

  // Detail modal state
  const [detailItem, setDetailItem] = useState<MergedItem | null>(null);
  const [detailEvidence, setDetailEvidence] = useState<IAttendanceEvidGroupId[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
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

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);

      const [attendanceRes, statusRes, leavesRes] = await Promise.all([
        getAttendanceList({
          page: 1,
          per_page: 20,
          order_by_desc: ["created_at"],
          user_id_exact: [user.id],
        }),
        getAttendanceStatus({ page: 1, per_page: 10 }),
        getMyLeaves({ page: 1, per_page: 20 }).catch(() => [] as ILeaveRequest[]),
      ]);

      const attendance = attendanceRes?.data?.data || [];
      const status = statusRes.data?.data || [];
      const leaves: ILeaveRequest[] = Array.isArray(leavesRes) ? leavesRes : [];

      const statusMap: Record<string, string> = {};
      const attendId = status.find((s) => s.name?.toLowerCase() === "attend")?.id || "";
      status.forEach((s) => { statusMap[s.id] = s.name; });

      const merged: MergedItem[] = [];

      // Attendance records (approved by admin, non-Attend)
      attendance
        .filter((item) => item.attendance_status_id !== attendId)
        .forEach((item) => {
          merged.push({
            id: item.id,
            type: "attendance",
            title: statusMap[item.attendance_status_id] || item.description || "Izin/Cuti",
            date: item.checkin ?? "",
            status: item.checkin ? "Disetujui" : "Pending",
            reason: item.description,
          });
        });

      // Leave requests (pending/rejected — show even if not yet approved)
      leaves.forEach((lr) => {
        // Skip if already has an attendance record for same date (approved).
        // Bandingkan bagian tanggal saja (WIB) — m.date = checkin WIB
        // "2026-08-09 17:47:11", lr.leave_date mungkin "2026-08-09" atau ISO.
        const leaveDay = lr.leave_date?.split(/[T ]/)[0];
        const alreadyApproved = merged.some(
          (m) => m.type === "attendance" && (m.date?.split(/[T ]/)[0] === leaveDay)
        );
        if (!alreadyApproved) {
          const leaveTypeLabel = lr.leave_type === "cuti" ? "Cuti" : "Izin";
          merged.push({
            id: lr.id,
            type: "leave_request",
            title: leaveTypeLabel,
            date: lr.leave_date,
            status: lr.status === "approved" ? "Disetujui" : lr.status === "rejected" ? "Ditolak" : "Pending",
            reason: lr.reason,
            leave_type: lr.leave_type,
            evidence_group_id: lr.evidence_group_id,
            rejection_reason: lr.rejection_reason,
          });
        }
      });

      // Sort by date desc — parse WIB (andal di Hermes), NaN → 0 (stabil)
      const dateVal = (d?: string) => {
        const parsed = parseWIBDate(d);
        return parsed ? parsed.getTime() : 0;
      };
      merged.sort((a, b) => dateVal(b.date) - dateVal(a.date));

      setMergedData(merged);
    } catch (error) {
      console.error("Failed to fetch izin data:", error);
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
    content = mergedData.map((item) => (
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
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status, colors) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.izinDetails}>
          <Text style={styles.izinDate}>📅 {formatAttendanceDate(item.date, false, { day: "numeric", month: "long", year: "numeric" })}</Text>
        </View>
        {item.reason ? (
          <Text style={styles.reasonText} numberOfLines={2}>💬 {item.reason}</Text>
        ) : null}
      </TouchableOpacity>
    ));
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
                    {formatAttendanceDate(detailItem.date, false, { day: "numeric", month: "long", year: "numeric" })}
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
});
