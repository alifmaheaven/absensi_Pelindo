import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { IAttendance, IAttendanceEvidGroupId } from "@/types";
import { getEvidGroupId } from "@/services/attendance";
import { fileUrl, ensureRenderTokens, useRenderTokenVersion } from "@/lib/renderToken";
import ImageViewerModal from "@/components/ImageViewerModal";
import AttendanceMapView from "@/components/attendance/AttendanceMapView";
import StatusBadge, { type StatusBadgeTone } from "@/components/ui/StatusBadge";
import {
  calculateAttendanceStatus,
  parseWIBDate,
  getOperationalDateWIB,
  formatAttendanceDate,
} from "@/utils/utils";

const { height: SCREEN_H } = Dimensions.get("window");

export interface AttendanceDetailModalProps {
  visible: boolean;
  attendance: IAttendance | null;
  onClose: () => void;
}

/**
 * Computes human-readable duration between two WIB timestamps.
 * Returns "X jam Y menit" or "Sedang Berlangsung".
 */
export function calculateWorkDuration(
  checkinStr?: string | null,
  checkoutStr?: string | null
): string {
  if (!checkinStr) return "-";
  const start = parseWIBDate(checkinStr);
  if (!start) return "-";

  if (!checkoutStr) {
    return "Sedang Berlangsung";
  }

  const end = parseWIBDate(checkoutStr);
  if (!end) return "-";

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHrs === 0) {
    return `${diffMins} menit`;
  }
  return `${diffHrs} jam ${diffMins} menit`;
}

/**
 * Safely resolves evidence photo URL to prevent malformed or duplicate paths.
 */
export function resolveEvidenceUrl(fileUriOrKey?: string | null): string {
  if (!fileUriOrKey) return "";
  if (/^(https?:\/\/|file:\/\/|content:\/\/)/i.test(fileUriOrKey) && !fileUriOrKey.includes("/public/images/")) {
    return fileUriOrKey;
  }
  // SEC-01: hasil membawa render token bila sudah di-cache; fallback = URL polos
  // (perilaku pra-SEC-01) sehingga render tidak pernah memblokir jaringan.
  return fileUrl(fileUriOrKey);
}

export default function AttendanceDetailModal({
  visible,
  attendance: attendanceProp,
  onClose,
}: AttendanceDetailModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // SEC-01: langganan versi cache render-token agar thumbnail re-render
  // begitu token di-mint (lihat lib/renderToken.ts).
  useRenderTokenVersion();
  const [evidenceList, setEvidenceList] = useState<IAttendanceEvidGroupId[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  // Smooth dismiss: retain last non-null attendance during dismiss transition
  const [prevAttendance, setPrevAttendance] = useState<IAttendance | null>(attendanceProp);
  const [cachedAttendance, setCachedAttendance] = useState<IAttendance | null>(attendanceProp);

  if (attendanceProp && attendanceProp !== prevAttendance) {
    setPrevAttendance(attendanceProp);
    setCachedAttendance(attendanceProp);
  }

  const attendance = attendanceProp || cachedAttendance;

  useEffect(() => {
    let isCancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvidenceList([]);
    setEvidenceError(false);

    if (!visible || !attendanceProp?.evidence_group_id) {
      setLoadingEvidence(false);
      return;
    }

    const fetchEvidence = async () => {
      setLoadingEvidence(true);
      try {
        const res = await getEvidGroupId({
          page: 1,
          per_page: 20,
          evidence_group_id_exact: [attendanceProp.evidence_group_id],
        });
        if (!isCancelled) {
          const items = (res?.data?.data || []).filter(
            (e) => e.evidence_group_id === attendanceProp.evidence_group_id
          );
          setEvidenceList(items);
          // SEC-01: mint render token untuk keys yang akan dirender layar ini.
          ensureRenderTokens(items.map((e) => e.file));
        }
      } catch (err) {
        if (!isCancelled) {
          setEvidenceError(true);
        }
      } finally {
        if (!isCancelled) {
          setLoadingEvidence(false);
        }
      }
    };

    fetchEvidence();

    return () => {
      isCancelled = true;
    };
  }, [visible, attendanceProp?.id, attendanceProp?.evidence_group_id]);

  if (!attendance) return null;

  const opDate = attendance.checkin
    ? getOperationalDateWIB(attendance.checkin)
    : null;
  const resolvedShift = attendance.shift ?? null;
  const checkinStatus = calculateAttendanceStatus({
    datetime: attendance.checkin,
    type: "checkin",
    shift: resolvedShift,
    shiftDate: opDate,
  });

  const checkinTone: StatusBadgeTone =
    checkinStatus.state === "ON_TIME"
      ? "success"
      : checkinStatus.state === "LATE"
      ? "danger"
      : "neutral";

  const checkoutTone: StatusBadgeTone = attendance.checkout
    ? "success"
    : "warning";

  const workDuration = calculateWorkDuration(
    attendance.checkin,
    attendance.checkout
  );

  const formattedDate = formatAttendanceDate(
    attendance.checkin || attendance.created_at,
    false,
    {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );

  const formatTimeOnly = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    return (
      formatAttendanceDate(dateStr, false, {
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB"
    );
  };

  const siteName =
    attendance.site?.name || "Site / Lokasi Terdaftar";
  const siteCode = attendance.site?.code;

  // Payload peta presensi. `!= null` (bukan truthy) dipakai sengaja: koordinat
  // 0 adalah nilai lintang/bujur yang sah dan tidak boleh dianggap "kosong".
  // Validasi & degradasi (site null, radius <= 0, koordinat tidak lengkap)
  // ditangani sepenuhnya oleh AttendanceMapView — modal hanya meneruskan data.
  const checkinLocation =
    attendance.latitude != null && attendance.longitude != null
      ? { lat: attendance.latitude, lng: attendance.longitude }
      : null;

  const checkoutLocation =
    attendance.checkout_latitude != null && attendance.checkout_longitude != null
      ? { lat: attendance.checkout_latitude, lng: attendance.checkout_longitude }
      : null;

  const siteLocation =
    attendance.site?.latitude != null && attendance.site?.longitude != null
      ? { lat: attendance.site.latitude, lng: attendance.site.longitude }
      : null;

  const radiusMeters = attendance.site?.tolerance ?? null;

  // True bila ada minimal satu koordinat yang bisa dipetakan. Sengaja TIDAK
  // memakai `radiusMeters != null`: radius tanpa koordinat mana pun tetap tidak
  // menghasilkan peta. Ini cerminan `canRenderMap` di attendance-map-logic.
  const hasMapData = Boolean(
    checkinLocation || checkoutLocation || siteLocation
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheetContainer}>
          {/* Drag Indicator */}
          <View style={styles.dragIndicator} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleContainer}>
              <View style={styles.codeRow}>
                <Text style={styles.codeText}>{attendance.code || "-"}</Text>
                <Text style={styles.dotSeparator}>•</Text>
                <Text style={styles.dateText}>{formattedDate}</Text>
              </View>
              <Text style={styles.modalTitle}>Detail Kehadiran</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Tutup modal detail kehadiran"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Status & Duration Ribbon */}
            <View style={styles.ribbonCard}>
              <View style={styles.badgesRow}>
                <StatusBadge
                  label={checkinStatus.displayText}
                  tone={checkinTone}
                  size="small"
                  icon={
                    <Ionicons
                      name={
                        checkinStatus.state === "LATE"
                          ? "alert-circle-outline"
                          : checkinStatus.state === "ON_TIME"
                          ? "checkmark-circle-outline"
                          : "calendar-outline"
                      }
                      size={12}
                      color={
                        checkinStatus.state === "LATE"
                          ? colors.danger
                          : checkinStatus.state === "ON_TIME"
                          ? colors.success
                          : colors.textSecondary
                      }
                    />
                  }
                />
                <StatusBadge
                  label={attendance.checkout ? "Selesai" : "Sedang Aktif"}
                  tone={checkoutTone}
                  size="small"
                  icon={
                    <Ionicons
                      name={
                        attendance.checkout
                          ? "checkmark-done-outline"
                          : "radio-button-on-outline"
                      }
                      size={12}
                      color={attendance.checkout ? colors.success : colors.warning}
                    />
                  }
                />
              </View>

              <View style={styles.durationRow}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={styles.durationLabel}>Durasi Kerja:</Text>
                <Text style={styles.durationValue}>{workDuration}</Text>
              </View>
            </View>

            {/* Shift Details Card */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="briefcase-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Informasi Shift</Text>
              </View>

              {attendance.shift ? (
                <View style={styles.shiftBody}>
                  <View style={styles.shiftMainRow}>
                    <Text style={styles.shiftName}>{attendance.shift.name}</Text>
                    {attendance.shift.is_overnight && (
                      <View style={styles.overnightBadge}>
                        <Ionicons name="moon-outline" size={11} color={colors.primaryText} />
                        <Text style={styles.overnightText}>Lintas Hari (+1)</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.shiftHoursText}>
                    Jam Operasional: {attendance.shift.start_time.slice(0, 5)} -{" "}
                    {attendance.shift.end_time.slice(0, 5)} WIB
                  </Text>
                  {attendance.shift.grace_late != null && (
                    <Text style={styles.shiftGraceText}>
                      Toleransi Keterlambatan: {attendance.shift.grace_late} menit
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.shiftBody}>
                  <Text style={styles.shiftName}>Dinas Terbuka (Non-Shift)</Text>
                  <Text style={styles.shiftHoursText}>
                    Jadwal fleksibel tanpa ketentuan shift tetap.
                  </Text>
                </View>
              )}
            </View>

            {/* Check-in & Check-out Breakdown */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Waktu Presensi</Text>
              </View>

              <View style={styles.timeBreakdownRow}>
                {/* Check In Column */}
                <View style={styles.timeBox}>
                  <View style={styles.timeBoxHeader}>
                    <Ionicons
                      name="log-in-outline"
                      size={16}
                      color={colors.success}
                    />
                    <Text style={styles.timeBoxTitle}>Check In</Text>
                  </View>
                  <Text style={styles.timeBoxValue}>
                    {formatTimeOnly(attendance.checkin)}
                  </Text>
                  <Text style={styles.timeBoxSubtext}>
                    {attendance.checkin
                      ? formatAttendanceDate(attendance.checkin, false, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Belum tercatat"}
                  </Text>
                </View>

                <View style={styles.timeBoxDivider} />

                {/* Check Out Column */}
                <View style={styles.timeBox}>
                  <View style={styles.timeBoxHeader}>
                    <Ionicons
                      name="log-out-outline"
                      size={16}
                      color={colors.danger}
                    />
                    <Text style={styles.timeBoxTitle}>Check Out</Text>
                  </View>
                  <Text style={styles.timeBoxValue}>
                    {attendance.checkout
                      ? formatTimeOnly(attendance.checkout)
                      : "Belum Checkout"}
                  </Text>
                  <Text style={styles.timeBoxSubtext}>
                    {attendance.checkout
                      ? formatAttendanceDate(attendance.checkout, false, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Sesi masih berjalan"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Location & Site Card */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Lokasi & Site</Text>
              </View>

              <View style={styles.siteInfoContainer}>
                <Text style={styles.siteNameText}>
                  {siteName}
                  {siteCode ? ` (${siteCode})` : ""}
                </Text>

                <View style={styles.coordsBlock}>
                  <View style={styles.coordRow}>
                    <Text style={styles.coordLabel}>Titik Masuk (Check-in):</Text>
                    <Text style={styles.coordValue}>
                      {attendance.latitude != null && attendance.longitude != null
                        ? `${attendance.latitude.toFixed(6)}, ${attendance.longitude.toFixed(6)}`
                        : "Tidak tercatat"}
                    </Text>
                  </View>

                  <View style={styles.coordRow}>
                    <Text style={styles.coordLabel}>Titik Keluar (Check-out):</Text>
                    <Text style={styles.coordValue}>
                      {attendance.checkout_latitude != null &&
                      attendance.checkout_longitude != null
                        ? `${attendance.checkout_latitude.toFixed(6)}, ${attendance.checkout_longitude.toFixed(6)}`
                        : attendance.checkout
                        ? "Koordinat checkout nihil"
                        : "Menunggu checkout"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/*
              Peta hanya bermakna bila ada minimal satu koordinat. Kondisi
              "tidak ada yang bisa ditampilkan" = check-in, check-out, DAN site
              semuanya absen — sejalan dengan `canRenderMap` di
              attendance-map-logic (Boolean(checkin || checkout || site)).
              Gate ini sengaja di modal: AttendanceMapView selalu merender
              container-nya (legenda + baris status), jadi tanpa gate ini
              legenda kosong tetap muncul saat tidak ada data sama sekali.
            */}
            {hasMapData ? (
              <View style={styles.sectionCard} testID="attendance-map-section">
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="map-outline" size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Peta Lokasi Presensi</Text>
                </View>
                <Text style={styles.sectionCaption}>
                  Titik presensi aktual dan batas radius site saat ini. Radius
                  dapat berubah bila pengaturan site diperbarui setelah
                  presensi.
                </Text>

                <AttendanceMapView
                  checkinLocation={checkinLocation}
                  checkoutLocation={checkoutLocation}
                  siteLocation={siteLocation}
                  radiusMeters={radiusMeters}
                  siteName={attendance.site?.name ?? null}
                />

                {/*
                  Badge di dalam peta membandingkan posisi terhadap radius
                  TERKINI, bukan radius yang berlaku saat absen dicatat.
                  Backend menyimpan vonis saat check-in di `check_in_audit_logs`
                  (site_latitude/longitude, allowed_radius, within_radius), dan
                  tabel itu belum punya endpoint baca. Tanpa catatan ini, badge
                  "Di Luar Area Presensi" (istilah kanonik GPS-06) bisa terbaca
                  sebagai "server menolak absen
                  ini" — padahal absennya justru diterima. Karena itu status di
                  atas adalah INDIKATOR SAAT INI, bukan vonis historis.
                */}
                <Text style={styles.mapScopeNote}>
                  Status di atas menunjukkan posisi terhadap radius site saat ini,
                  bukan penilaian server saat presensi dicatat.
                </Text>
              </View>
            ) : null}

            {/* Notes / Description Box */}
            {attendance.description ? (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.sectionTitle}>Catatan</Text>
                </View>
                <Text style={styles.descriptionText}>
                  {attendance.description}
                </Text>
              </View>
            ) : null}

            {/* Evidence Photo Gallery */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="camera-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Foto Bukti Kehadiran</Text>
                {evidenceList.length > 0 && (
                  <View style={styles.evidenceCountPill}>
                    <Text style={styles.evidenceCountText}>
                      {evidenceList.length}
                    </Text>
                  </View>
                )}
              </View>

              {loadingEvidence ? (
                <View style={styles.evidenceLoadingBox}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.evidenceLoadingText}>
                    Memuat foto bukti...
                  </Text>
                </View>
              ) : evidenceError ? (
                <View style={styles.evidenceEmptyBox}>
                  <Ionicons
                    name="cloud-offline-outline"
                    size={28}
                    color={colors.textMuted}
                  />
                  <Text style={styles.evidenceEmptyText}>
                    Gagal memuat foto bukti kehadiran
                  </Text>
                </View>
              ) : evidenceList.length === 0 ? (
                <View style={styles.evidenceEmptyBox}>
                  <Ionicons
                    name="images-outline"
                    size={28}
                    color={colors.textMuted}
                  />
                  <Text style={styles.evidenceEmptyText}>
                    Tidak ada foto bukti terlampir
                  </Text>
                </View>
              ) : (
                <View style={styles.evidenceGrid}>
                  {evidenceList.map((ev) => {
                    const resolvedUri = resolveEvidenceUrl(ev.file);
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        style={styles.evidenceThumbWrapper}
                        activeOpacity={0.8}
                        onPress={() => setPreviewImageUri(resolvedUri)}
                        accessibilityRole="button"
                        accessibilityLabel={ev.name || "Foto bukti kehadiran"}
                      >
                        <Image
                          source={{ uri: resolvedUri }}
                          style={styles.evidenceThumbImage}
                          contentFit="cover"
                          transition={200}
                        />
                        <View style={styles.thumbZoomOverlay}>
                          <Ionicons
                            name="expand-outline"
                            size={14}
                            color="#ffffff"
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Fullscreen Photo Lightbox */}
      <ImageViewerModal
        visible={!!previewImageUri}
        uri={previewImageUri}
        onClose={() => setPreviewImageUri(null)}
      />
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    backdropDismiss: {
      flex: 1,
    },
    sheetContainer: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: SCREEN_H * 0.88,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 8,
    },
    dragIndicator: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderStrong,
      alignSelf: "center",
      marginTop: 10,
      marginBottom: 6,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitleContainer: {
      flex: 1,
      marginRight: 12,
    },
    codeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 2,
    },
    codeText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.primaryText,
      letterSpacing: 0.3,
    },
    dotSeparator: {
      fontSize: 12,
      color: c.textMuted,
    },
    dateText: {
      fontSize: 12,
      color: c.textSecondary,
      fontWeight: "500",
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.textStrong,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 40,
      gap: 14,
    },
    ribbonCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    badgesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
    },
    durationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    durationLabel: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: "500",
    },
    durationValue: {
      fontSize: 13,
      fontWeight: "700",
      color: c.textStrong,
    },
    sectionCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.textStrong,
      flex: 1,
    },
    sectionCaption: {
      fontSize: 11,
      color: c.textMuted,
      lineHeight: 15,
      paddingLeft: 26,
      marginTop: -4,
    },
    mapScopeNote: {
      fontSize: 11,
      color: c.textMuted,
      lineHeight: 15,
      fontStyle: "italic",
      paddingLeft: 2,
      paddingTop: 2,
      borderTopWidth: 1,
      borderTopColor: c.border,
      marginTop: 2,
    },
    shiftBody: {
      gap: 4,
      paddingLeft: 26,
    },
    shiftMainRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    shiftName: {
      fontSize: 14,
      fontWeight: "600",
      color: c.textStrong,
    },
    overnightBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.surface,
      borderColor: c.primary,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    overnightText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.primaryText,
    },
    overnightBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.primaryText,
    },
    shiftHoursText: {
      fontSize: 12,
      color: c.textSecondary,
    },
    shiftGraceText: {
      fontSize: 11,
      color: c.textMuted,
    },
    timeBreakdownRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 4,
    },
    timeBox: {
      flex: 1,
      gap: 2,
    },
    timeBoxHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 2,
    },
    timeBoxTitle: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textSecondary,
    },
    timeBoxValue: {
      fontSize: 15,
      fontWeight: "700",
      color: c.textStrong,
    },
    timeBoxSubtext: {
      fontSize: 11,
      color: c.textMuted,
    },
    timeBoxDivider: {
      width: 1,
      height: 44,
      backgroundColor: c.border,
      marginHorizontal: 12,
    },
    siteInfoContainer: {
      gap: 8,
      paddingLeft: 26,
    },
    siteNameText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.textStrong,
    },
    coordsBlock: {
      gap: 4,
    },
    coordRow: {
      flexDirection: "column",
      gap: 1,
    },
    coordLabel: {
      fontSize: 11,
      color: c.textMuted,
      fontWeight: "500",
    },
    coordValue: {
      fontSize: 12,
      color: c.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    descriptionText: {
      fontSize: 13,
      color: c.text,
      lineHeight: 18,
      paddingLeft: 26,
    },
    evidenceCountPill: {
      backgroundColor: c.primarySoft,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    evidenceCountText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.primaryText,
    },
    evidenceLoadingBox: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 20,
    },
    evidenceLoadingText: {
      fontSize: 12,
      color: c.textMuted,
    },
    evidenceEmptyBox: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 24,
      gap: 6,
    },
    evidenceEmptyText: {
      fontSize: 12,
      color: c.textMuted,
    },
    evidenceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      paddingTop: 4,
    },
    evidenceThumbWrapper: {
      width: 88,
      height: 88,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      position: "relative",
    },
    evidenceThumbImage: {
      width: "100%",
      height: "100%",
    },
    thumbZoomOverlay: {
      position: "absolute",
      right: 4,
      bottom: 4,
      backgroundColor: "rgba(0,0,0,0.5)",
      borderRadius: 10,
      width: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
    },
  });
