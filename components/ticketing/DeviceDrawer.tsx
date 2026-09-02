import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { useToast } from "@/components/ui/toast";
import { ITicketDevice, THttpErrorResult } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { useState , useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import axios from "@/lib/axios";

interface DeviceDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (device: ITicketDevice) => void;
  siteId?: string;
  siteName?: string;
  companyId?: string;
  contractId?: string;
}

export default function DeviceDrawer({
  visible,
  onClose,
  onSelect,
  siteId,
  siteName,
  companyId,
  contractId,
}: DeviceDrawerProps) {

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();
  const [devices, setDevices] = useState<ITicketDevice[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state for add/edit
  const [showForm, setShowForm] = useState(false);
  const [editDevice, setEditDevice] = useState<ITicketDevice | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formSerial, setFormSerial] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formProductNumber, setFormProductNumber] = useState("");
  const [formIp, setFormIp] = useState("");
  const [formServiceId, setFormServiceId] = useState("");
  const [serviceOptions, setServiceOptions] = useState<{ id: string; name: string }[]>([]);
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  const fetchDevices = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await axios.get("/device/", {
        params: {
          per_page: 100,
          site_id_exact: siteId,
          order_by_desc: ["created_at"],
        },
      });
      setDevices(res.data?.data?.data || []);
    } catch (err: any) {
      console.error("Fetch devices error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      const res = await axios.get("/service/", { params: { per_page: 100 } });
      const svcList = res.data?.data?.data?.map((s: any) => ({ id: s.id, name: s.name })) || [];
      setServiceOptions(svcList);

    } catch (err) {
      console.error("Fetch services error:", err);
    }
  };

  const handleOpen = () => {
    setShowForm(false);
    setEditDevice(null);
    fetchDevices();
    fetchServices();
    if (siteId) {
      axios.get("/site/", { params: { id_exact: siteId, per_page: 1 } }).then(res => {
        setLocationId(res.data?.data?.data?.[0]?.location_id || "");
      }).catch(() => {});
    }
  };

  const openAddForm = () => {
    setEditDevice(null);
    setFormName("");
    setFormCode("");
    setFormBrand("");
    setFormSerial("");
    setFormProductNumber("");
    setFormIp("");
    setFormServiceId("");
    setFormDesc("");
    setShowForm(true);
  };

  const openEditForm = (device: ITicketDevice) => {
    setEditDevice(device);
    setFormName(device.name);
    setFormCode(device.code);
    setFormBrand(device.brand);
    setFormSerial(device.serialnumber);
    setFormProductNumber(device.productnumber || "");
    setFormIp(device.ip || "");
    setFormServiceId(device.service_id || "");
    setFormDesc(device.description);
    setShowForm(true);
  };

  const handleSubmitForm = async () => {
    if (!formName.trim()) {
      showToast("Nama device harus diisi", "error");
      return;
    }
    if (!formSerial.trim()) {
      showToast("Serial number harus diisi", "error");
      return;
    }
    if (!formProductNumber.trim()) {
      showToast("Product number harus diisi", "error");
      return;
    }
    if (!formBrand.trim()) {
      showToast("Brand/Merk harus diisi", "error");
      return;
    }
    if (!formIp.trim()) {
      showToast("IP Address harus diisi", "error");
      return;
    }
    if (!formDesc.trim()) {
      showToast("Deskripsi harus diisi", "error");
      return;
    }
    if (!formServiceId) {
      showToast("Service harus dipilih", "error");
      return;
    }
    setFormSubmitting(true);
    try {
      if (editDevice) {
        // Update
        await axios.put("/device/", {
          id: editDevice.id,
          name: formName.trim(),
          code: formCode.trim() || "DEV-" + Date.now().toString(),
          brand: formBrand.trim(),
          productnumber: formProductNumber.trim(),
          ip: formIp.trim(),
          serialnumber: formSerial.trim(),
          description: formDesc.trim(),
          ...(formServiceId ? { service_id: formServiceId } : {}),
        });
        showToast("Device berhasil diperbarui", "success");
      } else {
        // Create
        if (!siteId) {
          showToast("Site ID tidak tersedia", "error");
          setFormSubmitting(false);
          return;
        }
        const res = await axios.post("/device/", {
          name: formName.trim(),
          code: formCode.trim() || "DEV-" + Date.now().toString(),
          brand: formBrand.trim(),
          productnumber: formProductNumber.trim(),
          ip: formIp.trim(),
          serialnumber: formSerial.trim(),
          description: formDesc.trim(),
          site_id: siteId,
          ...(formServiceId ? { service_id: formServiceId } : {}),
          company_id: companyId,
          contract_id: contractId,
          location_id: locationId,
        });
        // Auto-select the new device
        const newDevice = res.data?.data;
        if (newDevice) {
          onSelect(newDevice);
          onClose();
          return;
        }
      }
      setShowForm(false);
      setEditDevice(null);
      fetchDevices();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Gagal menyimpan device", "error");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = (device: ITicketDevice) => {
    Alert.alert(
      "Hapus Device",
      `Yakin ingin menghapus "${device.name}"?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await axios.delete("/device/", { data: { id: device.id } });
              showToast("Device berhasil dihapus", "success");
              fetchDevices();
            } catch (err: any) {
              showToast(err?.response?.data?.message || "Gagal menghapus", "error");
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTop} onPress={onClose} />
        <View style={styles.container}>
          {/* Handle */}
          <View style={styles.handle} />

          {!showForm ? (
            <>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Daftar Device{siteName ? ` ${siteName}` : ''}</Text>
                <TouchableOpacity onPress={openAddForm} style={styles.addButton}>
                  <Ionicons name="add-circle" size={22} color={colors.primary} />
                  <Text style={styles.addButtonText}>Tambah Baru</Text>
                </TouchableOpacity>
              </View>

              {/* List */}
              {loading ? (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={{ marginTop: 30 }}
                />
              ) : devices.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="hardware-chip-outline" size={48} color={colors.textFaint} />
                  <Text style={styles.emptyText}>Belum ada device</Text>
                  <Text style={styles.emptySubtext}>
                    Tambah device baru untuk site ini
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.listContainer}
                  showsVerticalScrollIndicator={false}
                >
                  {devices.map((device) => (
                    <View key={device.id} style={styles.deviceItem}>
                      <TouchableOpacity
                        style={styles.deviceInfo}
                        onPress={() => {
                          onSelect(device);
                          onClose();
                        }}
                      >
                        <View style={styles.deviceIcon}>
                          <Ionicons
                            name="hardware-chip-outline"
                            size={22}
                            color={colors.primary}
                          />
                        </View>
                        <View style={styles.deviceText}>
                          <Text style={styles.deviceName}>{device.name}</Text>
                          <Text style={styles.deviceSub}>
                            {device.code || device.brand || "-"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.deviceActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openEditForm(device)}
                        >
                          <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => handleDelete(device)}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          ) : (
            <>
              {/* Form Add/Edit */}
              <View style={styles.header}>
                <Text style={styles.title}>
                  {editDevice ? "Edit Device" : "Tambah Device Baru"}
                </Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelText}>Batal</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.formContainer}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Nama Device <Text style={{ color: colors.danger }}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="Masukkan nama device"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Kode <Text style={{ color: colors.textMuted }}>(opsional)</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={formCode}
                    onChangeText={setFormCode}
                    placeholder="Kode device"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Brand/Merk <Text style={{ color: colors.danger }}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={formBrand}
                    onChangeText={setFormBrand}
                    placeholder="Brand device"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Serial Number <Text style={{ color: colors.danger }}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={formSerial}
                    onChangeText={setFormSerial}
                    placeholder="Serial number"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Product Number <Text style={{ color: colors.danger }}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={formProductNumber}
                    onChangeText={setFormProductNumber}
                    placeholder="Product number"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>IP Address <Text style={{ color: colors.danger }}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={formIp}
                    onChangeText={setFormIp}
                    placeholder="192.168.1.1"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Service <Text style={{ color: colors.danger }}>*</Text></Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setServiceDropdownOpen(p => !p)}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={formServiceId ? { color: colors.text } : { color: colors.textMuted }}>
                        {serviceOptions?.find(s => s.id === formServiceId)?.name || "Pilih service"}
                      </Text>
                      <Ionicons name={serviceDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                  {serviceDropdownOpen && (
                    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, marginTop: 4 }}>
                      {serviceOptions?.map(svc => (
                        <TouchableOpacity key={svc.id} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => { setFormServiceId(svc.id); setServiceDropdownOpen(false); }}>
                          <Text style={{ fontSize: 14, color: colors.text }}>{svc.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Deskripsi <Text style={{ color: colors.danger }}>*</Text></Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={formDesc}
                    onChangeText={setFormDesc}
                    placeholder="Deskripsi device"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.submitFormButton,
                    formSubmitting && { opacity: 0.7 },
                  ]}
                  onPress={handleSubmitForm}
                  disabled={formSubmitting}
                >
                  {formSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitFormText}>
                      {editDevice ? "Simpan Perubahan" : "Tambah Device"}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: "flex-end",
  },
  overlayTop: {
    flex: 1,
  },
  container: {
    backgroundColor: c.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: c.textStrong,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: c.primary,
  },
  cancelText: {
    fontSize: 14,
    color: c.primary,
    fontWeight: "500",
  },
  listContainer: {
    maxHeight: 400,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: c.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deviceText: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
  },
  deviceSub: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  deviceActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: c.textMuted,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: c.textFaint,
    marginTop: 4,
  },
  formContainer: {
    maxHeight: 500,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: c.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: c.text,
  },
  textArea: {
    minHeight: 80,
  },
  submitFormButton: {
    backgroundColor: c.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  submitFormText: {
    color: c.onGradient,
    fontSize: 15,
    fontWeight: "600",
  },
});
