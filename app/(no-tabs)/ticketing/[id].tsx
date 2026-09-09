import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, ImageIcon } from "@/components/icon";
import TicketSkeleton from "@/components/ticketing/ticket-skeleton";
import DeviceDrawer from "@/components/ticketing/DeviceDrawer";
import { useToast } from "@/components/ui/toast";
import {
  IMAGE_BASE_PATH,
  TIMEZONE,
} from "@/constants";
import {
  deleteEvid,
  deleteEvidtmp,
  getActiveCheckins,
  getDataEvid,
  getDataIncidentOwner,
  getDataSeverity,
  getDataSite, getDataStatus,
  getTicketDevice,
  updateTicket,
  uploadEvidGroupId,
  uploadEvidPermanent,
  uploadEvidtmp,
  getTicketHistory,
} from "@/services/ticket";
import { getAttendanceList } from "@/services/attendance";
import { formatAttendanceDate } from "@/utils/utils";
import { useAuthStore } from "@/stores/auth";
import { useTicketStore } from "@/stores/ticket";
import {
  IAttendanceOptions,
  IIncidentOwner,
  ITicketDevice,
  ITicketSeverity,
  ITicketStatus,
  THttpErrorResult,
} from "@/types";
import { SeveritySelector } from "@/components/ticketing/SeveritySelector";
import { useImagePicker, IImage } from "@/hooks/useImagePicker";
import { useImagePreview } from "@/hooks/useImagePreview";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const getNowJakarta = () =>
  new Date().toLocaleString("sv-SE", { timeZone: TIMEZONE });

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function TicketingEditScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { ticket } = useTicketStore();

  // form values
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [deviceSelected, setDeviceSelected] = useState("");
  const [severitySelected, setSeveritySelected] = useState("");
  const [attendanceSelected, setAttendanceSelected] = useState("");
  const [statusSelected, setStatusSelected] = useState("");

  // form state
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
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const submittingRef = useRef(false);
  const { user } = useAuthStore();
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [attendanceDropdownOpen, setAttendanceDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [removedImages, setRemovedImages] = useState<IImage[]>([]);
  const [loadingSkeleton, setLoadingSkeleton] = useState(true);
  const [allIncidentOwners, setAllIncidentOwners] = useState<IIncidentOwner[]>([]);
  const [selectedIncidentOwners, setSelectedIncidentOwners] = useState<string[]>([]);

  // Site state — declared before filteredIncidentOwners which references it
  const [siteData, setSiteData] = useState<{ id: string; name: string; company_id?: string }[]>([]);
  const [siteSelected, setSiteSelected] = useState("");
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);

  const filteredIncidentOwners = useMemo(() => {
    if (!siteSelected) return allIncidentOwners;
    const selectedSiteCompanyId = siteData.find(s => s.id === siteSelected)?.company_id;
    return allIncidentOwners.filter((o) => {
      if (!o.company_id && !o.site_id) return true;
      if (o.company_id && selectedSiteCompanyId && o.company_id === selectedSiteCompanyId) {
        if (!o.site_id) return true;
        if (o.site_id === siteSelected) return true;
        return false;
      }
      if (o.site_id && o.site_id === siteSelected) return true;
      return false;
    });
  }, [allIncidentOwners, siteSelected, siteData]);
  const [incidentOwnerDropdownOpen, setIncidentOwnerDropdownOpen] = useState(false);
  const [createOwnerVisible, setCreateOwnerVisible] = useState(false);
  const [ownerFormName, setOwnerFormName] = useState("");
  const [ownerFormEmail, setOwnerFormEmail] = useState("");
  const [ownerFormPhone, setOwnerFormPhone] = useState("");
  const [ownerFormPosition, setOwnerFormPosition] = useState("");
  const [ownerFormSubmitting, setOwnerFormSubmitting] = useState(false);
  const { showPreview, PreviewModal } = useImagePreview();

  // Data Options
  const [deviceData, setDeviceData] = useState<ITicketDevice[]>([]);
  const [deviceDrawerVisible, setDeviceDrawerVisible] = useState(false);
  const [deviceDrawerSiteId, setDeviceDrawerSiteId] = useState<string>("");
  const [deviceDrawerSiteName, setDeviceDrawerSiteName] = useState<string>("");

  const [statusData, setStatusData] = useState<ITicketStatus[]>([]);
  const [attendanceOptions, setAttendanceOptions] = useState<
    IAttendanceOptions[]
  >([]);
  const [severitys, setSeveritys] = useState<ITicketSeverity[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<Record<string, boolean>>({});
  const [replyTo, setReplyTo] = useState<{ logId: string; commentId?: string; userName?: string } | null>(null);
  // Site id prefilled from ticket data on initial load — used to skip the
  // refetch effect when siteSelected is set programmatically (not by user).
  const initialSiteId = useRef<string>("");

  // Refetch devices when user manually changes site (skip initial programmatic set)
  useEffect(() => {
    if (!siteSelected) return;
    // Initial load: devices already filtered in useFocusEffect — don't reset.
    if (siteSelected === initialSiteId.current) {
      initialSiteId.current = "";
      return;
    }
    const fetchDevicesBySite = async () => {
      try {
        const res = await getTicketDevice({ page: 1, per_page: 100, site_id_exact: [siteSelected], order_by_desc: ["created_at"] });
        setDeviceData(res.data?.data || []);
        setDeviceSelected("");
      } catch (e) { console.error(e); }
    };
    fetchDevicesBySite();
  }, [siteSelected]);

useFocusEffect(
    useCallback(() => {
      async function fetchData() {
        try {
          setLoadingSkeleton(true);

          const [sitesRes, devices, attendanceOptions, ticketAttendanceRes, severitys, evids, status, historyRes, incidentOwners] =
            await Promise.all([
              getDataSite({
                page: 1,
                per_page: 100,
                company_id_exact: [user?.company_id || ""],
              }),
              getTicketDevice({
                page: 1,
                per_page: 100,
                company_id_exact: [user?.company_id || ""],
                user_id_exact: [user?.id || ""],
                order_by_desc: ["created_at"],
              }),
              getActiveCheckins(),
              // Ambil record attendance milik tiket ini sendiri (bisa yang sudah
              // checkout — tidak muncul di active-checkins). Mencegah record
              // ter-link hilang dari dropdown setelah checkout.
              getAttendanceList({
                page: 1,
                per_page: 5,
                order_by_desc: ["created_at"],
                id_exact: [ticket?.attendance_id || ""],
              }).catch(() => null),
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
              getTicketHistory(id as string).catch(() => ({ data: { logs: [] } })),
              getDataIncidentOwner({ page: 1, per_page: 200 }),
            ]);

          const device = devices.data?.data || [];
          const siteOpts = sitesRes?.data?.data || [];
          // active-checkins array is already unwrapped by service
          const activeOption: IAttendanceOptions[] = (attendanceOptions as any) || [];
          // Record attendance milik tiket ini sendiri (bisa yang sudah checkout).
          const ticketAttendanceList = (ticketAttendanceRes?.data?.data || []) as IAttendanceOptions[];
          // Merge active check-ins + record tiket sendiri, dedup by id. Record
          // tiket sendiri selalu ada di depan agar tidak hilang setelah checkout.
          const seenIds = new Set<string>();
          const mergedOptions: IAttendanceOptions[] = [];
          for (const item of [...ticketAttendanceList, ...activeOption]) {
            if (item?.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              mergedOptions.push(item);
            }
          }
          const attendanceOption = mergedOptions;
          const severityData = severitys.data?.data || [];
          const statusData = status.data?.data || [];

          const attendanceOptionFilter =
            attendanceOption?.map((item) => ({
              ...item,
              name: `${item.code} - ${formatAttendanceDate(item.checkin)}`,
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
          setAllIncidentOwners((incidentOwners as any)?.data?.data || []);
          setSelectedIncidentOwners(ticket?.incident_owners?.map((o: any) => o.id) || []);
          setSiteData(siteOpts.map((s: any) => ({ id: s.id, name: s.name, company_id: s.company_id })));
          setAttendanceOptions(attendanceOptionFilter);
          // Auto-select attendance from ticket data or first active check-in
          if (ticket?.attendance_id) {
            setAttendanceSelected(ticket.attendance_id);
          } else if (attendanceOptionFilter.length > 0) {
            setAttendanceSelected(attendanceOptionFilter[0].id);
          }
          // Determine site ID for device drawer
          const drawerSiteId = ticket?.site_id || attendanceOptionFilter[0]?.site_id || "";
          setDeviceDrawerSiteId(drawerSiteId);
          // Set selected site from ticket or attendance - do this BEFORE device
          const prefilledSiteId = ticket?.site_id || attendanceOptionFilter[0]?.site_id || "";
          let selectedSiteName = "";
          if (prefilledSiteId) {
            initialSiteId.current = prefilledSiteId;
            setSiteSelected(prefilledSiteId);
            const foundSite = siteOpts.find((s: any) => s.id === prefilledSiteId);
            if (foundSite) selectedSiteName = foundSite.name;
            setDeviceDrawerSiteName(selectedSiteName);
          }
          // Filter devices by site and pick the selected one
          const filteredDevices = prefilledSiteId
            ? device.filter((d: any) => d.site_id === prefilledSiteId)
            : device;
          setDeviceData(filteredDevices);
          setDeviceSelected(ticket?.device_id || "");
          setStatusData(statusData);
          setHistory((historyRes as any)?.data?.logs || []);

          setTitle(ticket?.name || "");
          setNotes(ticket?.description || "");
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

  const imageUploadService = {
    uploadTemp: uploadEvidtmp,
    deleteTemp: deleteEvidtmp,
  };

  // Wrapper for removeImage that tracks server-stored images for deletion
  const handleRemoveImage = async (index: number) => {
    const target = images[index];
    if (target?.id) {
      // This is an existing image from server — track for deletion on submit
      setRemovedImages(prev => [...prev, target as IImage]);
      // Log file remove to ticket timeline
      try {
        const { default: api } = await import("@/lib/axios");
        await api.post(`/ticket/${id}/log`, { action: 'FILE_REMOVE', field_changes: { removed: { url: target.path, name: target.path } } });
      } catch {}
    }
    await removeImage(index, imageUploadService);
  };

  // Quick-create incident owner
  const handleCreateOwner = async () => {
    if (!ownerFormName.trim()) { showToast("Nama harus diisi", "error"); return; }
    setOwnerFormSubmitting(true);
    try {
      const selectedSite = siteData.find(site => site.id === siteSelected);
      const ownerCompanyId = selectedSite?.company_id || user?.company_id;
      const { default: api } = await import("@/lib/axios");
      const res = await api.post("/incident-owner/", {
        name: ownerFormName.trim(),
        ...(ownerFormEmail.trim() && { email: ownerFormEmail.trim() }),
        ...(ownerFormPhone.trim() && { phone: ownerFormPhone.trim() }),
        ...(ownerFormPosition.trim() && { position: ownerFormPosition.trim() }),
        ...(selectedSite && { site_id: selectedSite.id }),
        ...(ownerCompanyId && { company_id: ownerCompanyId }),
      });
      const newOwner = res.data?.data;
      if (newOwner) {
        const ownersRes = await getDataIncidentOwner({ page: 1, per_page: 200 });
        setAllIncidentOwners((ownersRes as any)?.data?.data || []);
        setSelectedIncidentOwners(prev => [...prev, newOwner.id]);
      }
      setOwnerFormName(""); setOwnerFormEmail(""); setOwnerFormPhone("");
      setOwnerFormPosition(""); setCreateOwnerVisible(false);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Gagal membuat owner", "error");
    } finally {
      setOwnerFormSubmitting(false);
    }
  };

  const submitComment = async (logId: string, parentCommentId?: string) => {
    const text = (commentInputs[logId] || "").trim();
    if (!text) return;
    setCommentSubmitting((p) => ({ ...p, [logId]: true }));
    try {
      const { default: api } = await import("@/lib/axios");
      await api.post(`/ticket/${id}/comment`, { logId, comment: text, parent_comment_id: parentCommentId || null });
      setCommentInputs((p) => ({ ...p, [logId]: "" }));
      setReplyTo(null);
      // Refresh history
      const historyRes = await getTicketHistory(id as string).catch(() => ({ data: { logs: [] } }));
      setHistory((historyRes as any)?.data?.logs || []);
    } catch {
      showToast("Gagal menambah komentar", "error");
    } finally {
      setCommentSubmitting((p) => ({ ...p, [logId]: false }));
    }
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
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
    // Attendance - auto from check-in
    if (!attendanceSelected) {
      showToast("Tidak ada check-in aktif untuk tiket ini", "error");
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
    submittingRef.current = true;

    try {
      const groupId = ticket?.evidence_group_id ?? "";
      console.debug("Group ID", groupId);

      for (const img of removedImages) {
        const deleted = await deleteEvid({ id: img?.id || "" });

        if (deleted?.code !== 200) continue;
        console.debug("File deleted", deleted);
      }

      const { default: api } = await import("@/lib/axios");
      let imgCounter = 0;
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

          // Log file attach to ticket timeline
          await api.post(`/ticket/${id}/log`, { action: 'FILE_ATTACH', field_changes: { [`file_${imgCounter}`]: { url: file, name: `image-${Date.now()}` } } });
          imgCounter++;
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
        incident_owner_ids: selectedIncidentOwners,
      });

      console.debug("Ticket created");

      showToast("Berhasil edit ticket!", "success");

      useTicketStore.getState().setNeedsRefresh(true);
      router.replace("/ticketing");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(err);
      showToast("Gagal edit ticket!", "error");
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
              <Text style={styles.sectionTitle}>Ubah Laporan Tiket</Text>
              <Text style={styles.sectionDescription}>
                Perbarui laporan kendala IT Anda
              </Text>

              <View
                style={{
                  width: "100%",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  marginVertical: 12,
                }}
              />

              {/* Notes */}
              <Text style={styles.sectionTitle}>Judul Kendala</Text>
              <View style={styles.titleContainer}>
                <TextInput
                  style={styles.titleInput}
                  placeholder="Masukkan Judul Kendala"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  textAlignVertical="top"
                  maxLength={200}
                />
              </View>

              {/* Site */}
              <Text style={styles.sectionTitle}>Site</Text>
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity style={styles.selectInputDropdown} onPress={() => setSiteDropdownOpen(p => !p)}>
                  <Text style={siteSelected ? styles.value : styles.placeholder}>{siteData?.find(s => s.id === siteSelected)?.name || "Pilih Site"}</Text>
                  <Ionicons name={siteDropdownOpen ? "chevron-up" : "chevron-down"} size={18} />
                </TouchableOpacity>
                {siteDropdownOpen && (
                  <View style={styles.dropdown}>
                    {siteData?.map(site => (
                      <TouchableOpacity key={site.id} style={styles.option} onPress={() => { setSiteSelected(site.id); setDeviceDrawerSiteId(site.id); setDeviceDrawerSiteName(site.name); setSiteDropdownOpen(false); }}>
                        <View style={{ width: 20 }}>{siteSelected === site.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}</View>
                        <Text style={styles.optionText}>{site.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {!!siteSelected && (
              <>
              {/* Device */}
              <Text style={styles.sectionTitle}>Device</Text>
              <View style={styles.dropdownRow}>
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
                                color={colors.primary}
                              />
                            )}
                          </View>
                          <Text style={styles.optionText}>{device.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.addDeviceButton}
                  onPress={() => setDeviceDrawerVisible(true)}
                >
                  <Ionicons name="add" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
              </>
              )}

              {/* Attendance - auto-selected from check-in */}
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

              {/* SeveritySelector */}
              <Text style={styles.sectionTitle}>Severity</Text>
              <SeveritySelector
                options={severitys}
                value={severitySelected}
                onChange={setSeveritySelected}
              />

              {/* Incident Owner */}
              <Text style={styles.sectionTitle}>Incident Owner</Text>
              <View style={styles.dropdownRow}>
                <View style={styles.dropdownWrapper}>
                  <TouchableOpacity
                    style={styles.selectInputDropdown}
                    onPress={() => setIncidentOwnerDropdownOpen(p => !p)}
                  >
                    <Text style={selectedIncidentOwners.length ? styles.value : styles.placeholder}>
                      {selectedIncidentOwners.length > 0
                        ? `${selectedIncidentOwners.length} owner dipilih`
                        : "Pilih incident owner"}
                    </Text>
                    <Ionicons name={incidentOwnerDropdownOpen ? "chevron-up" : "chevron-down"} size={18} />
                  </TouchableOpacity>
                  {incidentOwnerDropdownOpen && (
                    <View style={[styles.dropdown, { maxHeight: 200 }]}>
                      {filteredIncidentOwners.map((owner) => {
                        const isSelected = selectedIncidentOwners.includes(owner.id);
                        return (
                          <TouchableOpacity
                            key={owner.id}
                            style={styles.option}
                            onPress={() => {
                              setSelectedIncidentOwners(prev =>
                                isSelected ? prev.filter(id => id !== owner.id) : [...prev, owner.id]
                              );
                            }}
                          >
                            <View style={{ width: 24 }}>
                              {isSelected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                            </View>
                            <Text style={styles.optionText}>
                              {owner.name}{owner.phone ? ` - ${owner.phone}` : ''}{owner.company_name ? ` (${owner.company_name})` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
                <TouchableOpacity style={styles.addDeviceButton} onPress={() => { setCreateOwnerVisible(true); setIncidentOwnerDropdownOpen(false); }}>
                  <Ionicons name="add" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Selected Owners */}
              {selectedIncidentOwners.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {selectedIncidentOwners.map((oid) => {
                    const owner = allIncidentOwners.find((o) => o.id === oid);
                    if (!owner) return null;
                    return (
                      <View key={oid} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, gap: 4 }}>
                        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "500" }}>{owner.name}{owner.phone ? ` - ${owner.phone}` : ''}</Text>
                        <TouchableOpacity onPress={() => setSelectedIncidentOwners(prev => prev.filter(id => id !== oid))}>
                          <Ionicons name="close-circle" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Description */}
              <Text style={styles.sectionTitle}>Description</Text>
              <View style={styles.notesContainer}>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Explain the problem in detail"
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
                    <TouchableOpacity onPress={() => showPreview(image.uri)}>
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
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        onPress={() => handleRemoveImage(index)}
                        accessibilityRole="button"
                        accessibilityLabel="Hapus foto"
                      >
                        <Ionicons name="close" size={14} color={colors.onGradient} />
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

              {/* Device Drawer */}
              <DeviceDrawer
                visible={deviceDrawerVisible}
                onClose={() => setDeviceDrawerVisible(false)}
                onSelect={(device) => {
                  setDeviceSelected(device.id);
                  getTicketDevice({
                    page: 1,
                    per_page: 100,
                    company_id_exact: [user?.company_id || ""],
                    user_id_exact: [user?.id || ""],
                    order_by_desc: ["created_at"],
                  }).then((res) => {
                    setDeviceData(res.data?.data || []);
                  }).catch(() => {});
                }}
                siteId={deviceDrawerSiteId}
                siteName={deviceDrawerSiteName}
                companyId={user?.company_id || ticket?.company_id || ""}
                contractId={user?.contract_id || ticket?.contract_id || ""}
              />

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

              {/* Riwayat Tiket */}
              <View style={styles.historySection}>
                <Text style={styles.historySectionTitle}>Riwayat Tiket</Text>
                {history.length === 0 ? (
                  <Text style={styles.historyEmpty}>Belum ada riwayat</Text>
                ) : (
                  history.map((log, i) => {
                    const isLast = i === history.length - 1;
                    const actionLabel: Record<string, string> = {
                      CREATE: "Membuat tiket",
                      STATUS_CHANGE: "Mengubah status",
                      UPDATE: "Memperbarui",
                      DELETE: "Menghapus tiket",
                      COMMENT: "Komentar",
                      FILE_ATTACH: "Menambah gambar",
                      FILE_REMOVE: "Menghapus gambar",
                    };
                    const fieldLabels: Record<string, string> = {
                      title: "Judul", name: "Nama", description: "Deskripsi",
                      severity_id: "Severity", status_id: "Status", sla_id: "SLA",
                      priority: "Prioritas", device_id: "Perangkat",
                      attendance_id: "Presensi", user_id: "User", site_id: "Site",
                      contract_id: "Kontrak", company_id: "Perusahaan",
                      start_ticket: "Mulai", end_ticket: "Selesai", due_date: "Tenggat",
                      incident_owner_ids: "Incident Owner",
                    };
                    const formatVal = (v: any) => v === null || v === undefined || v === "" ? "(kosong)" : String(v);
                    const displayValue = (change: any) => ({
                      old: change?.oldName || formatVal(change?.old),
                      new: change?.newName || formatVal(change?.new),
                    });
                    return (
                      <View key={log.id} style={[styles.historyItem, isLast && { borderBottomWidth: 0 }]}>
                        <View style={styles.historyHeader}>
                          <Text style={styles.historyAction}>
                            {actionLabel[log.action] || log.action}
                          </Text>
                          <Text style={styles.historyTime}>
                            {formatAttendanceDate(log.created_at, true)}
                          </Text>
                        </View>
                        <Text style={styles.historyUserName}>
                          {log.user?.name || "System"}{log.user?.email ? ` (${log.user.email})` : ""}
                        </Text>
                        {log.from_status ? (
                          <View style={styles.historyStatusRow}>
                            <Text style={styles.historyStatusBadge}>{log.from_status}</Text>
                            <Text style={styles.historyStatusArrow}> → </Text>
                            <Text style={[styles.historyStatusBadge, styles.historyStatusBadgeNew]}>{log.to_status}</Text>
                          </View>
                        ) : null}
                        {log.field_changes && Object.keys(log.field_changes).length > 0 ? (
                          log.action === 'FILE_ATTACH' ? (
                            <View style={styles.imageChangesContainer}>
                              {Object.entries(log.field_changes).map(([key, info]: [string, any]) => {
                                const fileUrl = new URL(`${IMAGE_BASE_PATH}${info.url || info}`, BASE_URL).toString();
                                return (
                                  <TouchableOpacity key={key} onPress={() => showPreview(fileUrl)}>
                                    <Image
                                      source={{ uri: fileUrl }}
                                      style={styles.historyImage}
                                    />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : log.action === 'FILE_REMOVE' ? (
                            <Text style={styles.fileRemoveText}>
                              {Object.values(log.field_changes).map((info: any) => info.name || info.url || "-").join(", ")}
                            </Text>
                          ) : (
                            <View style={styles.fieldChangesContainer}>
                              {Object.entries(log.field_changes).map(([field, change]: [string, any]) => {
                                const dv = displayValue(change);
                                return (
                                  <View key={field} style={styles.fieldChangeRow}>
                                    <Text style={styles.fieldChangeLabel}>{fieldLabels[field] || field}:</Text>
                                    <Text style={styles.fieldChangeOld}>{dv.old}</Text>
                                    <Text style={styles.fieldChangeArrow}> → </Text>
                                    <Text style={styles.fieldChangeNew}>{dv.new}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          )
                        ) : null}
                        {log.note ? (
                          <View style={styles.noteContainer}>
                            <Text style={styles.noteText}>{log.note}</Text>
                          </View>
                        ) : null}
                        {/* Comments (threaded) */}
                        {log.comments?.length > 0 ? (
                          <View style={styles.commentsContainer}>
                            {log.comments.map((c: any) => (
                              <View key={c.id}>
                                {/* Parent comment */}
                                <View style={styles.commentItem}>
                                  <View style={styles.commentAvatar}>
                                    <Text style={styles.commentAvatarText}>{(c.user?.name || "?")[0]}</Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                      <Text style={styles.commentUserName}>{c.user?.name || "System"}</Text>
                                      <TouchableOpacity onPress={() => setReplyTo({ logId: log.id, commentId: c.id, userName: c.user?.name })}>
                                        <Text style={{ fontSize: 11, color: colors.primary }}>Reply</Text>
                                      </TouchableOpacity>
                                    </View>
                                    <Text style={styles.commentText}>{c.comment}</Text>
                                  </View>
                                </View>
                                {/* Replies */}
                                {c.replies?.length > 0 ? (
                                  <View style={styles.repliesContainer}>
                                    {c.replies.map((r: any) => (
                                      <View key={r.id} style={styles.commentItem}>
                                        <View style={[styles.commentAvatar, { backgroundColor: colors.primarySoft }]}>
                                          <Text style={[styles.commentAvatarText, { color: colors.primary }]}>{(r.user?.name || "?")[0]}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                          <Text style={styles.commentUserName}>{r.user?.name || "System"}</Text>
                                          <Text style={styles.commentText}>{r.comment}</Text>
                                        </View>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {/* Comment input (with reply context) */}
                        {(() => {
                          const isReply = replyTo && replyTo.logId === log.id;
                          const parentId = isReply ? replyTo!.commentId : undefined;
                          return (
                            <View style={styles.commentInputRow}>
                              {isReply ? (
                                <View style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
                                  <Text style={{ fontSize: 11, color: colors.primary }}>
                                    Balas <Text style={{ fontWeight: "700" }}>{replyTo!.userName}</Text>
                                  </Text>
                                  <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginLeft: 4 }}>
                                    <Ionicons name="close" size={14} color={colors.textMuted} />
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                              <TextInput
                                style={[styles.commentInput, { flex: 1 }]}
                                placeholder={isReply ? "Ketik balasan..." : "Tambah komentar..."}
                                placeholderTextColor={colors.textMuted}
                                value={commentInputs[log.id] || ""}
                                onChangeText={(t) => setCommentInputs((p) => ({ ...p, [log.id]: t }))}
                              />
                              <TouchableOpacity
                                style={[styles.commentSendBtn, (commentSubmitting[log.id] || !commentInputs[log.id]?.trim()) && { opacity: 0.4 }]}
                                onPress={() => submitComment(log.id, parentId)}
                                disabled={commentSubmitting[log.id] || !commentInputs[log.id]?.trim()}
                              >
                                <Text style={styles.commentSendText}>Kirim</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })()}
                      </View>
                    );
                  })
                )}
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        )}

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
                style={[
                  styles.modalButtonSecondary,
                  { opacity: loadingImage ? 0.7 : 1 },
                ]}
                onPress={() => pickImage("gallery", imageUploadService)}
                disabled={loadingImage}
              >
                <Text style={styles.modalButtonTextSecondary}>
                  Ambil Dari Galeri
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

        {PreviewModal}

        {/* Quick-create Incident Owner Modal */}
        <Modal visible={createOwnerVisible} transparent animationType="slide" onRequestClose={() => setCreateOwnerVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCreateOwnerVisible(false)}>
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalIndicator} />
              <Text style={styles.modalTitle}>Tambah Incident Owner</Text>
              <TextInput
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, width: '100%', marginBottom: 12 }}
                placeholder="Nama *"
                placeholderTextColor={colors.textMuted}
                value={ownerFormName}
                onChangeText={setOwnerFormName}
              />
              <TextInput
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, width: '100%', marginBottom: 12 }}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                value={ownerFormEmail}
                onChangeText={setOwnerFormEmail}
                keyboardType="email-address"
              />
              <TextInput
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, width: '100%', marginBottom: 12 }}
                placeholder="Phone"
                placeholderTextColor={colors.textMuted}
                value={ownerFormPhone}
                onChangeText={setOwnerFormPhone}
              />
              <TextInput
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, width: '100%', marginBottom: 12 }}
                placeholder="Position"
                placeholderTextColor={colors.textMuted}
                value={ownerFormPosition}
                onChangeText={setOwnerFormPosition}
              />
                            <TouchableOpacity
                style={[styles.modalButtonPrimary, { opacity: (ownerFormSubmitting || !ownerFormName.trim()) ? 0.7 : 1 }]}
                onPress={handleCreateOwner}
                disabled={ownerFormSubmitting || !ownerFormName.trim()}
              >
                {ownerFormSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonTextPrimary}>Simpan</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setCreateOwnerVisible(false)}>
                <Text style={styles.modalButtonTextCancel}>Batal</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

/* =============================
   STYLES
============================= */

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
  sectionDescription: {
    fontSize: 14,
    fontWeight: "normal",
    color: c.textStrong,
    marginBottom: 12,
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

  // Title
  titleContainer: {
    backgroundColor: c.inputBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 24,
  },
  titleInput: {
    padding: 16,
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
    width: 28,
    height: 28,
    borderRadius: 14,
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

  // dropdown
  dropdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 24,
  },
  dropdownWrapper: { position: "relative", flex: 1, marginBottom: 24 },
  addDeviceButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.primary,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 0,
  },
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


  // History
  historySection: {
    marginTop: 24,
    backgroundColor: c.inputBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
  },
  historySectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: c.textStrong,
    marginBottom: 12,
  },
  historyEmpty: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: "center",
    paddingVertical: 12,
  },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 10,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  historyAction: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textStrong,
    marginBottom: 4,
  },
  historyStatus: {
    fontSize: 13,
    color: c.primary,
    marginBottom: 4,
  },
  historyUserName: {
    fontSize: 12,
    color: c.textSecondary,
    marginBottom: 2,
  },
  historyTime: {
    fontSize: 11,
    color: c.textMuted,
  },
  historyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  historyStatusArrow: {
    fontSize: 13,
    color: c.textMuted,
    marginHorizontal: 4,
  },
  historyStatusBadge: {
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: c.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  historyStatusBadgeNew: {
    backgroundColor: "rgba(30,144,255,0.15)",
    color: c.primary,
  },
  fieldChangesContainer: {
    marginTop: 8,
    backgroundColor: c.border,
    borderRadius: 8,
    padding: 8,
  },
  fieldChangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    marginBottom: 3,
  },
  fieldChangeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: c.textSecondary,
    marginRight: 4,
    width: 80,
  },
  fieldChangeOld: {
    fontSize: 12,
    color: c.textMuted,
    textDecorationLine: "line-through",
  },
  fieldChangeArrow: {
    fontSize: 12,
    color: c.textSecondary,
    marginHorizontal: 3,
  },
  fieldChangeNew: {
    fontSize: 12,
    fontWeight: "600",
    color: c.primary,
  },
  noteContainer: {
    marginTop: 6,
    backgroundColor: "rgba(30,144,255,0.05)",
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: c.primary,
  },
  noteText: {
    fontSize: 12,
    color: c.textSecondary,
    fontStyle: "italic",
  },
  // Comments
  commentsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.borderStrong,
  },
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  commentAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(30,144,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  commentAvatarText: {
    fontSize: 11,
    fontWeight: "bold",
    color: c.primary,
  },
  commentUserName: {
    fontSize: 11,
    fontWeight: "600",
    color: c.textSecondary,
  },
  commentText: {
    fontSize: 13,
    color: c.text,
    marginTop: 1,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    backgroundColor: c.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: c.text,
  },
  commentSendBtn: {
    backgroundColor: c.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  commentSendText: {
    fontSize: 13,
    fontWeight: "600",
    color: c.onGradient,
  },
  repliesContainer: {
    marginLeft: 20,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: c.primarySoft,
    marginTop: 4,
  },
  // Image changes
  imageChangesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  historyImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  fileRemoveText: {
    fontSize: 12,
    color: c.textMuted,
    textDecorationLine: "line-through",
    marginTop: 4,
  },
});
