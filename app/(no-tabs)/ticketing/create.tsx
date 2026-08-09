import { ArrowLeft, ImageIcon } from "@/components/icon";
import TicketSkeleton from "@/components/ticketing/ticket-skeleton";
import DeviceDrawer from "@/components/ticketing/DeviceDrawer";
import { useToast } from "@/components/ui/toast";
import {
  TIMEZONE,
} from "@/constants";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useImagePreview } from "@/hooks/useImagePreview";
import {
  createEvidGroupId,
  createTicket,
  deleteEvidtmp,
  getActiveCheckins,
  getDataIncidentOwner,
  getDataSeverity,
  getDataSite, getDataStatus,
  getTicketDevice,
  uploadEvidGroupId,
  uploadEvidPermanent,
  uploadEvidtmp,
} from "@/services/ticket";
import { useAuthStore } from "@/stores/auth";
import { formatAttendanceDate } from "@/utils/utils";
import {
  IAttendanceOptions,
  IIncidentOwner,
  ITicketDevice,
  ITicketSeverity,
  ITicketStatus,
  THttpErrorResult,
} from "@/types";
import { SeveritySelector } from "@/components/ticketing/SeveritySelector";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
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

const imageUploadService = {
  uploadTemp: uploadEvidtmp,
  deleteTemp: deleteEvidtmp,
};

const getNowJakarta = () =>
  new Date().toLocaleString("sv-SE", { timeZone: TIMEZONE });

export default function TicketingCreateScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  // form values
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [deviceSelected, setDeviceSelected] = useState("");
  const [severitySelected, setSeveritySelected] = useState("");
  const [attendanceSelected, setAttendanceSelected] = useState("");

  // form state
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const submittingRef = useRef(false);
  const { user } = useAuthStore();
  const {
    images,
    loadingImage,
    isModalVisible,
    pickImage,
    removeImage,
    openModal,
    closeModal,
  } = useImagePicker();
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [attendanceDropdownOpen, setAttendanceDropdownOpen] = useState(false);
  const [loadingSkeleton, setLoadingSkeleton] = useState(true);
  const { showPreview, PreviewModal } = useImagePreview();

  // Incident Owner
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

  // Data Options
  const [deviceData, setDeviceData] = useState<ITicketDevice[]>([]);
  const [deviceDrawerVisible, setDeviceDrawerVisible] = useState(false);
  const [deviceDrawerSiteId, setDeviceDrawerSiteId] = useState<string>("");
  const [deviceDrawerSiteName, setDeviceDrawerSiteName] = useState<string>("");
  const [attendanceOptions, setAttendanceOptions] = useState<
    IAttendanceOptions[]
  >([]);
  const [severitys, setSeveritys] = useState<ITicketSeverity[]>([]);
  const [defaultStatusId, setDefaultStatusId] = useState<string>("");

  // Refetch devices when site changes
  useEffect(() => {
    const fetchDevicesBySite = async () => {
      if (!siteSelected) return;
      try {
        const res = await getTicketDevice({
          page: 1,
          per_page: 100,
          company_id_exact: [user?.company_id || ""],
          user_id_exact: [user?.id || ""],
          site_id_exact: [siteSelected],
          order_by_desc: ["created_at"],
        });
        setDeviceData(res.data?.data || []);
        setDeviceSelected("");
      } catch (e) {
        console.error(e);
      }
    };
    fetchDevicesBySite();
  }, [siteSelected]);

  useFocusEffect(
    useCallback(() => {
      async function fetchData() {
        try {
          setLoadingSkeleton(true);
          const [sitesRes, devices, attendanceOptions, severitys, statuses, incidentOwners] = await Promise.all([
            getDataSite({
              page: 1,
              per_page: 100,
            }),
            getTicketDevice({
              page: 1,
              per_page: 100,
              company_id_exact: [user?.company_id || ""],
              user_id_exact: [user?.id || ""],
              order_by_desc: ["created_at"],
            }),
            getActiveCheckins(),
            getDataSeverity({ page: 1, per_page: 100 }),
            getDataStatus({ page: 1, per_page: 100 }),
            getDataIncidentOwner({ page: 1, per_page: 200 }),
          ]);

          const device = devices.data?.data || [];
          const siteOpts = sitesRes?.data?.data || [];
          // active-checkins array is already unwrapped by service
          const attendanceOption: IAttendanceOptions[] = (attendanceOptions as any) || [];
          const severityData = severitys.data?.data || [];
          const statusData: ITicketStatus[] = statuses.data?.data || [];

          const attendanceOptionFilter =
            attendanceOption?.map((item) => ({
              ...item,
              name: `${item.code} - ${formatAttendanceDate(item.checkin)}`,
            })) || [];

          const sortSeverity =
            severityData?.sort((a, b) => a.code.localeCompare(b.code)) || [];

          const openStatus = statusData.find((s) => s.code?.toLowerCase() === "open");
          if (openStatus) {
            setDefaultStatusId(openStatus.id);
          } else if (statusData.length > 0) {
            setDefaultStatusId(statusData[0].id);
          }

          setSeveritys(sortSeverity);
          const allOwners = (incidentOwners as any)?.data?.data || [];
          setAllIncidentOwners(allOwners);
          setDeviceData(device);
          setSiteData(siteOpts.map((s: any) => ({ id: s.id, name: s.name, company_id: s.company_id })));
          setAttendanceOptions(attendanceOptionFilter);
          // Auto-select the first attendance (most recent active check-in)
          if (attendanceOptionFilter.length > 0 && !attendanceSelected) {
            setAttendanceSelected(attendanceOptionFilter[0].id);
            setDeviceDrawerSiteId(attendanceOptionFilter[0].site_id || "");
          }
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

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    // Title
    if (!title) {
      showToast("Masukkan title!", "error");
      return;
    }
    // Site
    if (!siteSelected) {
      showToast("Pilih site!", "error");
      return;
    }
    // Device
    if (!deviceSelected) {
      showToast("Pilih device!", "error");
      return;
    }
    // Attendance - auto from check-in
    if (!attendanceSelected) {
      showToast("Tidak ada check-in aktif untuk pembuatan tiket", "error");
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
      const group = await createEvidGroupId({
        name: `Ticket ${user?.name}`,
        description: "Ticket evidence",
      });

      const groupId = group.data?.id ?? "";
      console.debug("Group ID", groupId);

      for (const img of images) {
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

      // Submit
      const ticketRes: any = await createTicket({
        user_id: user?.id || "",
        company_id: user?.company_id || "",
        contract_id: user?.contract_id || "",
        site_id: siteSelected || user?.site_id || "",
        code: `TKT-${Date.now()}`,
        status_id: defaultStatusId,
        start_ticket: getNowJakarta(),

        evidence_group_id: groupId,
        attendance_id: attendanceSelected,
        severity_id: severitySelected,
        device_id: deviceSelected,
        name: title,
        description: notes,
        incident_owner_ids: selectedIncidentOwners,
      });

      console.debug("Ticket created");

      // Log file attachments to ticket history
      if (images.length > 0 && ticketRes?.data?.id) {
        const { default: api } = await import("@/lib/axios");
        const changes: Record<string, any> = {};
        images.forEach((img, i) => {
          changes[`file_${i}`] = { url: img.path, name: img.path?.split('/')?.pop() || `image-${i}` };
        });
        await api.post(`/ticket/${ticketRes.data.id}/log`, { action: 'FILE_ATTACH', field_changes: changes }).catch(() => {});
      }

      showToast("Berhasil create ticket!", "success");

      router.replace("/ticketing");
    } catch (error) {
      const err = error as THttpErrorResult;
      console.error(JSON.stringify(err, null, 2));
      Alert.alert(
        "Gagal Create Ticket",
        err?.message || "Terjadi kesalahan, coba lagi.",
      );
    } finally {
      setLoadingSubmit(false);
      submittingRef.current = false;
    }
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
        const ownersRes = await getDataIncidentOwner({ page: 1, per_page: 500 });
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
              <Text style={styles.headerTitle}>Create New Ticketing</Text>
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
              <Text style={styles.sectionTitle}>Create New Ticket</Text>
              <Text style={styles.sectionDescription}>
                Manage and track all your IT support tickets
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

              {/* Site */}
              <Text style={styles.sectionTitle}>Site</Text>
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity
                  style={styles.selectInputDropdown}
                  onPress={() => setSiteDropdownOpen((p) => !p)}
                >
                  <Text
                    style={siteSelected ? styles.value : styles.placeholder}
                  >
                    {siteData?.find((s) => s.id === siteSelected)?.name ||
                      "Pilih Site"}
                  </Text>
                  <Ionicons
                    name={siteDropdownOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                  />
                </TouchableOpacity>

                {siteDropdownOpen && (
                  <View style={styles.dropdown}>
                    {siteData?.map((site) => (
                      <TouchableOpacity
                        key={site.id}
                        style={styles.option}
                        onPress={() => {
                          setSiteSelected(site.id);
                          setDeviceDrawerSiteId(site.id);
                          setDeviceDrawerSiteName(site.name);
                          setSiteDropdownOpen(false);
                        }}
                      >
                        <View style={{ width: 20 }}>
                          {siteSelected === site.id && (
                            <Ionicons
                              name={"checkmark"}
                              size={18}
                              color="#1e90ff"
                            />
                          )}
                        </View>
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
                <TouchableOpacity
                  style={styles.addDeviceButton}
                  onPress={() => setDeviceDrawerVisible(true)}
                >
                  <Ionicons name="add" size={24} color="#1e90ff" />
                </TouchableOpacity>
              </View>
              </>
              )}

              {/* Attendance - auto-selected from check-in */}
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
                              {isSelected && <Ionicons name="checkmark" size={18} color="#1e90ff" />}
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
                  <Ionicons name="add" size={24} color="#1e90ff" />
                </TouchableOpacity>
              </View>

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
                    <TouchableOpacity
                      onPress={() => showPreview(image.uri)}
                      activeOpacity={0.8}
                      disabled={!!loadingImage}
                    >
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
                  (loadingImage || loadingSubmit) &&
                    styles.uploadButtonDisabled,
                ]}
                onPress={() => openModal()}
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

              {/* Device Drawer */}
              <DeviceDrawer
                visible={deviceDrawerVisible}
                onClose={() => setDeviceDrawerVisible(false)}
                onSelect={(device) => {
                  setDeviceSelected(device.id);
                  // Refresh device list
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
                companyId={user?.company_id || ""}
                contractId={user?.contract_id || ""}
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
                style={{ backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#333', width: '100%', marginBottom: 12 }}
                placeholder="Nama *"
                placeholderTextColor="#999"
                value={ownerFormName}
                onChangeText={setOwnerFormName}
              />
              <TextInput
                style={{ backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#333', width: '100%', marginBottom: 12 }}
                placeholder="Email"
                placeholderTextColor="#999"
                value={ownerFormEmail}
                onChangeText={setOwnerFormEmail}
                keyboardType="email-address"
              />
              <TextInput
                style={{ backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#333', width: '100%', marginBottom: 12 }}
                placeholder="Phone"
                placeholderTextColor="#999"
                value={ownerFormPhone}
                onChangeText={setOwnerFormPhone}
              />
              <TextInput
                style={{ backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#333', width: '100%', marginBottom: 12 }}
                placeholder="Position"
                placeholderTextColor="#999"
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
    borderColor: "#1e90ff",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 0,
  },
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

});
