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
import { IAttendanceEvidGroupId, THttpErrorResult } from "@/types";
import { DocumentCheck, InfoOutlineRounded } from "@/components/icon";
import { Ionicons } from "@expo/vector-icons";
import EmptyState from "@/components/ui/EmptyState";
import ScreenContainer from "@/components/ui/ScreenContainer";
import StandardSkeleton from "@/components/ui/StandardSkeleton";
import StatusBadge, { StatusBadgeTone } from "@/components/ui/StatusBadge";
import InteractiveButton from "@/components/ui/InteractiveButton";
import ImageViewerModal from "@/components/ImageViewerModal";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useToast } from "@/components/ui/toast";
import { fileUrl, ensureRenderTokens, useRenderTokenVersion } from "@/lib/renderToken";

function resolveEvidenceUrl(fileUriOrKey?: string | null): string {
  if (!fileUriOrKey) return "";
  if (/^(https?:\/\/|file:\/\/|content:\/\/)/i.test(fileUriOrKey) && !fileUriOrKey.includes("/public/images/")) {
    return fileUriOrKey;
  }
  // SEC-01: hasil membawa render token bila sudah di-cache; fallback = URL polos.
  return fileUrl(fileUriOrKey);
}

function calculateLeaveDays(startDateStr?: string | null, endDateStr?: string | null): number {
  if (!startDateStr) return 1;
  const cleanStart = startDateStr.split(/[T ]/)[0];
  const cleanEnd = (endDateStr || startDateStr).split(/[T ]/)[0];
  if (!cleanEnd || cleanEnd === cleanStart) return 1;
  const start = parseWIBDate(cleanStart);
  const end = parseWIBDate(cleanEnd);
  if (!start || !end) return 1;
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

const getStatusTone = (status: string): StatusBadgeTone => {
  switch (status.toLowerCase()) {
    case "disetujui":
    case "approved":
      return "success";
    case "pending":
    case "menunggu":
      return "warning";
    case "ditolak":
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
};

type FilterCategory = "semua" | "izin" | "cuti" | "disetujui" | "pending" | "ditolak";

const FILTER_CHIPS: { id: FilterCategory; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "izin", label: "Izin" },
  { id: "cuti", label: "Cuti" },
  { id: "disetujui", label: "Disetujui" },
  { id: "pending", label: "Pending" },
  { id: "ditolak", label: "Ditolak" },
];

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
  // SEC-01: langganan versi cache render-token agar bukti re-render saat token di-mint.
  useRenderTokenVersion();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuthStore();
  const userId = user?.id;
  const { showToast } = useToast();

  const [mergedData, setMergedData] = useState<MergedItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("semua");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);

  // Full-screen image preview state
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    try {
      setIsLoading(true);
      setIsError(false);

      const [attendanceRes, statusRes, leavesRes] = await Promise.all([
        getAttendanceList({
          page: 1,
          per_page: 20,
          order_by_desc: ["created_at"],
          user_id_exact: [userId],
        }),
        getAttendanceStatus({ page: 1, per_page: 10 }),
        getMyLeaves({ page: 1, per_page: 20 }),
      ]);

      const attendance = attendanceRes?.data?.data || [];
      const status = statusRes.data?.data || [];
      const leaves: ILeaveRequest[] = Array.isArray(leavesRes) ? leavesRes : [];

      const statusMap: Record<string, string> = {};
      const attendId = status.find((s) => s.name?.toLowerCase() === "attend")?.id || "";
      status.forEach((s) => {
        statusMap[s.id] = s.name;
      });

      // 1. Leave requests milik sendiri
      const leaveItems: MergedItem[] = leaves.map((lr) => {
        const leaveTypeLabel = lr.leave_type === "cuti" ? "Cuti" : "Izin";
        return {
          id: lr.id,
          type: "leave_request",
          title: leaveTypeLabel,
          date: lr.leave_date,
          end_date: lr.end_date,
          status:
            lr.status === "approved"
              ? "Disetujui"
              : lr.status === "rejected"
              ? "Ditolak"
              : "Pending",
          rawStatus: lr.status,
          reason: lr.reason,
          leave_type: lr.leave_type,
          evidence_group_id: lr.evidence_group_id,
          rejection_reason: lr.rejection_reason,
        };
      });

      // Helper mengecek apakah attendance record checkin sudah tercover cuti approved
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

      // 2. Attendance records non-Attend
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

      // Sort by date desc (parseWIBDate)
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
  }, [userId]);

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

  const imageUploadService = {
    uploadTemp: uploadEvid,
    deleteTemp: deleteEvidtmp,
  };

  const openDetail = async (item: MergedItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // safe fallback
    }
    setDetailItem(item);
    setDetailEvidence([]);
    setDetailLoading(true);

    if (item.type === "leave_request" && item.evidence_group_id) {
      try {
        const res = await getEvidGroupId({
          page: 1,
          per_page: 20,
          evidence_group_id_exact: [item.evidence_group_id],
        });
        const evs = (res?.data?.data || []).filter(
          (e) => e.evidence_group_id === item.evidence_group_id
        );
        setDetailEvidence(evs);
      } catch (e) {
        console.error("Error fetching evidence:", e);
        showToast("Gagal memuat lampiran", "error");
      }
    }
    setDetailLoading(false);
  };

  const handleFilterChange = (filterId: FilterCategory) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // safe fallback
    }
    setActiveFilter(filterId);
  };

  const filterCounts = useMemo(() => {
    return {
      semua: mergedData.length,
      izin: mergedData.filter(
        (it) =>
          it.leave_type === "izin" ||
          (it.type === "attendance" && !it.title.toLowerCase().includes("cuti"))
      ).length,
      cuti: mergedData.filter(
        (it) =>
          it.leave_type === "cuti" || it.title.toLowerCase().includes("cuti")
      ).length,
      disetujui: mergedData.filter(
        (it) =>
          it.status.toLowerCase() === "disetujui" ||
          it.rawStatus?.toLowerCase() === "approved"
      ).length,
      pending: mergedData.filter(
        (it) =>
          it.status.toLowerCase() === "pending" ||
          it.rawStatus?.toLowerCase() === "pending"
      ).length,
      ditolak: mergedData.filter(
        (it) =>
          it.status.toLowerCase() === "ditolak" ||
          it.rawStatus?.toLowerCase() === "rejected"
      ).length,
    };
  }, [mergedData]);

  const filteredData = useMemo(() => {
    if (activeFilter === "semua") return mergedData;
    if (activeFilter === "izin") {
      return mergedData.filter(
        (it) =>
          it.leave_type === "izin" ||
          (it.type === "attendance" && !it.title.toLowerCase().includes("cuti"))
      );
    }
    if (activeFilter === "cuti") {
      return mergedData.filter(
        (it) =>
          it.leave_type === "cuti" || it.title.toLowerCase().includes("cuti")
      );
    }
    if (activeFilter === "disetujui") {
      return mergedData.filter(
        (it) =>
          it.status.toLowerCase() === "disetujui" ||
          it.rawStatus?.toLowerCase() === "approved"
      );
    }
    if (activeFilter === "pending") {
      return mergedData.filter(
        (it) =>
          it.status.toLowerCase() === "pending" ||
          it.rawStatus?.toLowerCase() === "pending"
      );
    }
    if (activeFilter === "ditolak") {
      return mergedData.filter(
        (it) =>
          it.status.toLowerCase() === "ditolak" ||
          it.rawStatus?.toLowerCase() === "rejected"
      );
    }
    return mergedData;
  }, [mergedData, activeFilter]);

  const handleResubmit = async () => {
    if (!detailItem || detailItem.type !== "leave_request") return;
    if (images.length === 0) {
      showToast("Upload minimal 1 gambar sebagai bukti!", "error");
      return;
    }
    setResubmitting(true);
    try {
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

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  let content: React.ReactNode;

  if (isLoading && !refreshing) {
    content = <StandardSkeleton type="card-list" count={4} />;
  } else if (isError) {
    content = (
      <EmptyState
        variant="error"
        title="Gagal Memuat Pengajuan"
        description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
        actionLabel="Coba Lagi"
        onAction={() => fetchAll()}
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
  } else if (filteredData.length === 0) {
    const activeLabel = FILTER_CHIPS.find((c) => c.id === activeFilter)?.label || "Kategori ini";
    content = (
      <EmptyState
        title="Tidak Ada Pengajuan"
        description={`Tidak ditemukan data pengajuan untuk filter "${activeLabel}".`}
        actionLabel="Tampilkan Semua"
        onAction={() => handleFilterChange("semua")}
        icon={<Ionicons name="filter-outline" size={36} color={colors.primary} />}
      />
    );
  } else {
    content = filteredData.map((item) => {
      const isApprovedLeave =
        item.type === "leave_request" &&
        (item.status === "Disetujui" || item.rawStatus === "approved");
      const canDelete =
        item.type === "leave_request" &&
        (item.status === "Pending" ||
          item.status === "Ditolak" ||
          item.rawStatus === "pending" ||
          item.rawStatus === "rejected");

      const isCuti = item.leave_type === "cuti" || item.title.toLowerCase().includes("cuti");
      const days = calculateLeaveDays(item.date, item.end_date);

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
            <View style={styles.headerLeftWrap}>
              {/* Type Icon Box */}
              <View
                style={[
                  styles.typeIconBox,
                  isCuti ? styles.cutiIconBox : styles.izinIconBox,
                ]}
              >
                <Ionicons
                  name={isCuti ? "airplane-outline" : "document-text-outline"}
                  size={18}
                  color={isCuti ? colors.primaryText : colors.textStrong}
                />
              </View>

              <View style={styles.headerTitleWrap}>
                <View style={styles.typeTitleRow}>
                  <Text style={styles.izinType} numberOfLines={1}>
                    {item.title}
                    {item.leave_type === "cuti" && item.type === "leave_request"
                      ? " (Cuti)"
                      : item.leave_type === "izin" && item.type === "leave_request"
                      ? " (Izin)"
                      : ""}
                  </Text>
                  {/* Duration Chip */}
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={11} color={colors.primaryText} />
                    <Text style={styles.durationBadgeText}>{days} Hari</Text>
                  </View>
                </View>

                {/* Date Label */}
                <View style={styles.dateRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.izinDate}>{dateLabel}</Text>
                </View>
              </View>
            </View>

            <View style={styles.headerRightWrap}>
              <StatusBadge
                label={item.status}
                tone={getStatusTone(item.status)}
                size="small"
              />
              {canDelete ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    confirmDelete(item);
                  }}
                  style={styles.cardDeleteBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  )}
                </TouchableOpacity>
              ) : isApprovedLeave ? (
                <View style={styles.cardLockedBadge}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={14}
                    color={colors.textMuted}
                  />
                </View>
              ) : null}
            </View>
          </View>

          {item.reason ? (
            <View style={styles.reasonWrap}>
              <Ionicons
                name="chatbubble-outline"
                size={12}
                color={colors.textMuted}
                style={{ marginTop: 2 }}
              />
              <Text style={styles.reasonText} numberOfLines={2}>
                {item.reason}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    });
  }

  return (
    <ScreenContainer
      title="Izin / Cuti"
      subtitle="Kelola pengajuan izin dan cuti kerja"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        fetchAll();
      }}
    >
      {/* Apply Button */}
      <InteractiveButton
        title="Ajukan Izin / Cuti"
        icon={
          <Ionicons
            name="add"
            size={20}
            color={colors.onGradient}
            style={{ marginRight: 6 }}
          />
        }
        onPress={() => router.push("/(no-tabs)/leave/create")}
        style={{ marginBottom: 16 }}
      />

      {/* Category Filter Chips */}
      <View style={styles.filterChipsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContent}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.id;
            const count = filterCounts[chip.id];
            return (
              <TouchableOpacity
                key={chip.id}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                style={[
                  styles.filterChip,
                  isActive ? styles.filterChipActive : styles.filterChipInactive,
                ]}
                onPress={() => handleFilterChange(chip.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive
                      ? styles.filterChipTextActive
                      : styles.filterChipTextInactive,
                  ]}
                >
                  {chip.label}
                </Text>
                <View
                  style={[
                    styles.filterBadge,
                    isActive
                      ? styles.filterBadgeActive
                      : styles.filterBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBadgeText,
                      isActive
                        ? styles.filterBadgeTextActive
                        : styles.filterBadgeTextInactive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* History Section Title */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Riwayat Pengajuan</Text>
        <Text style={styles.sectionCountText}>
          {filteredData.length} dari {mergedData.length}
        </Text>
      </View>

      {content}

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
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Detail Pengajuan</Text>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setDetailItem(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {detailItem ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {/* Information Card Box */}
                <View style={styles.detailCardBox}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tipe Pengajuan</Text>
                    <Text style={styles.detailValue}>
                      {detailItem.title}
                      {detailItem.leave_type === "cuti"
                        ? " (Cuti)"
                        : detailItem.leave_type === "izin"
                        ? " (Izin)"
                        : ""}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Durasi</Text>
                    <Text style={styles.detailValue}>
                      {calculateLeaveDays(detailItem.date, detailItem.end_date)} Hari Kerja
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Periode Tanggal</Text>
                    <Text style={styles.detailValue}>
                      {detailItem.end_date && detailItem.end_date !== detailItem.date
                        ? `${formatAttendanceDate(detailItem.date, false, { day: "numeric", month: "short", year: "numeric" })} s/d ${formatAttendanceDate(detailItem.end_date, false, { day: "numeric", month: "short", year: "numeric" })}`
                        : formatAttendanceDate(detailItem.date, false, { day: "numeric", month: "long", year: "numeric" })}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.detailRow,
                      { borderBottomWidth: 0, paddingBottom: 0 },
                    ]}
                  >
                    <Text style={styles.detailLabel}>Status</Text>
                    <StatusBadge
                      label={detailItem.status}
                      tone={getStatusTone(detailItem.status)}
                      size="medium"
                    />
                  </View>
                </View>

                {detailItem.reason ? (
                  <View style={styles.detailSectionBox}>
                    <Text style={styles.detailSectionLabel}>Alasan Pengajuan</Text>
                    <Text style={styles.detailSectionValue}>{detailItem.reason}</Text>
                  </View>
                ) : null}

                {detailItem.rejection_reason ? (
                  <View style={[styles.detailSectionBox, styles.rejectionSectionBox]}>
                    <View style={styles.rejectionHeaderRow}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={16}
                        color={colors.danger}
                      />
                      <Text style={styles.rejectionLabel}>Alasan Ditolak</Text>
                    </View>
                    <Text style={styles.rejectionValue}>
                      {detailItem.rejection_reason}
                    </Text>
                  </View>
                ) : null}

                {/* Evidence Section */}
                <View style={styles.evidenceSectionWrap}>
                  <View style={styles.evidenceSectionHeader}>
                    <Text style={styles.evidenceSectionTitle}>
                      Foto Bukti Terlampir
                    </Text>
                    {detailEvidence.length > 0 && (
                      <Text style={styles.evidenceCountHint}>
                        {detailEvidence.length} Foto (Ketuk untuk perbesar)
                      </Text>
                    )}
                  </View>

                  {detailLoading ? (
                    <View style={styles.evidenceLoadingWrap}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.evidenceLoadingText}>Memuat lampiran...</Text>
                    </View>
                  ) : detailEvidence.length > 0 ? (
                    <View style={styles.evidenceGrid}>
                      {detailEvidence.map((ev) => {
                        const imgUrl = resolveEvidenceUrl(ev.file);
                        return (
                          <TouchableOpacity
                            key={ev.id}
                            style={styles.evidenceThumbWrap}
                            activeOpacity={0.8}
                            onPress={() => setPreviewImageUri(imgUrl)}
                          >
                            <Image
                              source={{ uri: imgUrl }}
                              style={styles.evidenceThumb}
                              resizeMode="cover"
                            />
                            <View style={styles.thumbZoomPill}>
                              <Ionicons
                                name="scan-outline"
                                size={12}
                                color={colors.onGradient}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.emptyEvidenceWrap}>
                      <Ionicons
                        name="images-outline"
                        size={22}
                        color={colors.textMuted}
                      />
                      <Text style={styles.noEvidenceText}>
                        Tidak ada bukti foto terlampir
                      </Text>
                    </View>
                  )}
                </View>

                {/* Update evidence bila ditolak */}
                {detailItem.type === "leave_request" && detailItem.status === "Ditolak" ? (
                  <View style={styles.resubmitSection}>
                    <Text style={styles.resubmitHint}>
                      Pengajuan ditolak. Silakan unggah bukti baru untuk mengajukan ulang.
                    </Text>
                    {images.length > 0 ? (
                      <View style={styles.evidenceGrid}>
                        {images.map((img, i) => (
                          <View key={i} style={styles.newEvidenceWrap}>
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => setPreviewImageUri(img.uri)}
                            >
                              <Image
                                source={{ uri: img.uri }}
                                style={styles.evidenceThumb}
                                resizeMode="cover"
                              />
                              <View style={styles.thumbZoomPill}>
                                <Ionicons
                                  name="scan-outline"
                                  size={12}
                                  color={colors.onGradient}
                                />
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.removeBtn}
                              onPress={() => removeImage(i, imageUploadService)}
                              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            >
                              <Ionicons
                                name="close"
                                size={14}
                                color={colors.onGradient}
                              />
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
                        {loadingImage ? "Memproses..." : "+ Tambah Bukti Foto"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.resubmitBtn,
                        (resubmitting || images.length === 0) && { opacity: 0.5 },
                      ]}
                      onPress={handleResubmit}
                      disabled={resubmitting || images.length === 0}
                    >
                      {resubmitting ? (
                        <ActivityIndicator size="small" color={colors.onGradient} />
                      ) : (
                        <Text style={styles.resubmitBtnText}>Ajukan Ulang</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Notice untuk approved */}
                {detailItem.type === "leave_request" &&
                (detailItem.status === "Disetujui" || detailItem.rawStatus === "approved") ? (
                  <View style={styles.approvedNoticeContainer}>
                    <InfoOutlineRounded
                      color={colors.warning}
                      width={20}
                      height={20}
                    />
                    <Text style={styles.approvedNoticeText}>
                      Izin yang sudah disetujui hanya bisa dihapus oleh approver.
                    </Text>
                  </View>
                ) : null}

                {/* Hapus pengajuan untuk pending/rejected */}
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
                      <ActivityIndicator size="small" color={colors.onGradient} />
                    ) : (
                      <View
                        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={colors.onGradient}
                        />
                        <Text style={styles.deleteModalBtnText}>
                          Hapus Pengajuan
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setDetailItem(null)}
                >
                  <Text style={styles.closeBtnText}>Tutup</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Image Source Selection Modal */}
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
            <Text style={styles.modalTitle}>Pilih Sumber Gambar</Text>
            <TouchableOpacity
              style={[
                styles.sourceBtnPrimary,
                { opacity: loadingImage ? 0.7 : 1 },
              ]}
              onPress={() => pickImage("camera", imageUploadService)}
              disabled={loadingImage}
            >
              <Text style={styles.sourceBtnTextPrimary}>Ambil Dari Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sourceBtnSecondary,
                { opacity: loadingImage ? 0.7 : 1 },
              ]}
              onPress={() => pickImage("gallery", imageUploadService)}
              disabled={loadingImage}
            >
              <Text style={styles.sourceBtnTextSecondary}>Ambil Dari Galeri</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sourceBtnCancel}
              onPress={closeModal}
            >
              <Text style={styles.sourceBtnTextCancel}>Kembali</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Fullscreen Image Preview Lightbox */}
      <ImageViewerModal
        visible={Boolean(previewImageUri)}
        uri={previewImageUri}
        onClose={() => setPreviewImageUri(null)}
      />
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    filterChipsWrapper: {
      marginBottom: 16,
      marginHorizontal: -16,
    },
    filterChipsContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    filterChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterChipInactive: {
      backgroundColor: c.card,
      borderColor: c.border,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: "600",
    },
    filterChipTextActive: {
      color: c.onGradient,
    },
    filterChipTextInactive: {
      color: c.textSecondary,
    },
    filterBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    filterBadgeActive: {
      backgroundColor: c.primarySoft,
    },
    filterBadgeInactive: {
      backgroundColor: c.surface,
    },
    filterBadgeText: {
      fontSize: 11,
      fontWeight: "700",
    },
    filterBadgeTextActive: {
      color: c.primaryText,
    },
    filterBadgeTextInactive: {
      color: c.textMuted,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: c.textStrong,
    },
    sectionCountText: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: "500",
    },
    izinCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
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
      alignItems: "flex-start",
    },
    headerLeftWrap: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
      marginRight: 10,
    },
    typeIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    cutiIconBox: {
      backgroundColor: c.primarySoft,
    },
    izinIconBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    headerTitleWrap: {
      flex: 1,
    },
    typeTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 3,
    },
    izinType: {
      fontSize: 15,
      fontWeight: "700",
      color: c.textStrong,
    },
    durationBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: c.primarySoft,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    durationBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.primaryText,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    izinDate: {
      fontSize: 12,
      color: c.textSecondary,
    },
    headerRightWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    reasonWrap: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    reasonText: {
      fontSize: 12,
      color: c.textSecondary,
      lineHeight: 18,
      flex: 1,
    },
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
    // Detail modal
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 36,
      maxHeight: "88%",
    },
    modalIndicator: {
      width: 40,
      height: 4,
      backgroundColor: c.border,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 16,
    },
    modalHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.textStrong,
    },
    modalCloseIconBtn: {
      padding: 4,
      borderRadius: 16,
      backgroundColor: c.surface,
    },
    detailCardBox: {
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 14,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 12,
    },
    detailLabel: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: "500",
    },
    detailValue: {
      fontSize: 13,
      color: c.textStrong,
      fontWeight: "600",
      textAlign: "right",
      flexShrink: 1,
    },
    detailSectionBox: {
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 14,
    },
    detailSectionLabel: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: "600",
      textTransform: "uppercase",
      marginBottom: 6,
      letterSpacing: 0.5,
    },
    detailSectionValue: {
      fontSize: 14,
      color: c.textStrong,
      lineHeight: 20,
    },
    rejectionSectionBox: {
      backgroundColor: c.dangerSoft,
      borderColor: c.danger,
    },
    rejectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    rejectionLabel: {
      fontSize: 12,
      color: c.danger,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    rejectionValue: {
      fontSize: 13,
      color: c.danger,
      lineHeight: 18,
      fontWeight: "500",
    },
    evidenceSectionWrap: {
      marginBottom: 16,
    },
    evidenceSectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    evidenceSectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.textStrong,
    },
    evidenceCountHint: {
      fontSize: 11,
      color: c.textMuted,
    },
    evidenceLoadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
    },
    evidenceLoadingText: {
      fontSize: 13,
      color: c.textMuted,
    },
    evidenceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    evidenceThumbWrap: {
      position: "relative",
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
    },
    evidenceThumb: {
      width: 84,
      height: 84,
      borderRadius: 12,
      backgroundColor: c.surface,
    },
    thumbZoomPill: {
      position: "absolute",
      right: 4,
      bottom: 4,
      backgroundColor: c.overlay,
      width: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyEvidenceWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 14,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    noEvidenceText: {
      fontSize: 13,
      color: c.textMuted,
    },
    resubmitSection: {
      marginTop: 6,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      marginBottom: 10,
    },
    resubmitHint: {
      fontSize: 13,
      color: c.danger,
      marginBottom: 12,
      lineHeight: 18,
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
    uploadBtn: {
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      borderStyle: "dashed",
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      marginBottom: 12,
      marginTop: 10,
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
      marginBottom: 10,
    },
    resubmitBtnText: {
      color: c.onGradient,
      fontWeight: "bold",
      fontSize: 15,
    },
    approvedNoticeContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.warningSoft,
      borderColor: c.warning,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
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
      marginBottom: 8,
    },
    deleteModalBtnText: {
      color: c.onGradient,
      fontWeight: "bold",
      fontSize: 15,
    },
    closeBtn: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
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
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
      marginBottom: 10,
    },
    sourceBtnTextPrimary: {
      color: c.onGradient,
      fontWeight: "bold",
      fontSize: 15,
    },
    sourceBtnSecondary: {
      backgroundColor: c.card,
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
      marginBottom: 10,
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
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
    },
    sourceBtnTextCancel: {
      color: c.textSecondary,
      fontWeight: "600",
      fontSize: 15,
    },
  });
