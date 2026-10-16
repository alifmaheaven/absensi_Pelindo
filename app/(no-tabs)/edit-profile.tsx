import { useThemeColors, useIsDarkTheme, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, PersonFill } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { updateProfile } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState , useMemo } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EditProfileScreen() {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const { showToast } = useToast();
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");

  const handleSave = async () => {
    if (!name.trim()) {
      showToast("Nama tidak boleh kosong", "error");
      return;
    }

    setLoading(true);
    try {
      const payload: any = {};
      if (name !== user?.name) payload.name = name.trim();
      if (email !== user?.email) payload.email = email.trim();
      if (phone !== String(user?.phone ?? "")) payload.phone = phone.trim();

      if (Object.keys(payload).length === 0) {
        showToast("Tidak ada perubahan", "info");
        setLoading(false);
        return;
      }

      const res = await updateProfile(payload);
      if (res.data) {
        setUser({ ...user!, ...res.data });
      }
      showToast("Profil berhasil diperbarui", "success");
      router.back();
    } catch (error: any) {
      showToast(error?.message || "Gagal memperbarui profil", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primaryAction, colors.primaryActionEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <ArrowLeft color={colors.onGradient} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <View style={{ width: 60 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              <PersonFill color={colors.onGradient} width={50} height={50} />
            </View>
            <Text style={styles.avatarLabel}>Foto Profil</Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Nama */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nama Lengkap</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Masukkan nama"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Masukkan email"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nomor Telepon</Text>
              <TextInput
                style={styles.input}
                value={phone || ""}
                onChangeText={setPhone}
                placeholder="Masukkan nomor telepon"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.onGradient} />
            ) : (
              <Text style={styles.saveButtonText}>Simpan</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (c: ThemeColors, isDark: boolean = false) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: c.onGradient,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.glassOnGradient,
    borderWidth: 1,
    borderColor: c.glassOnGradientBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    marginTop: -20,
    backgroundColor: c.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.primaryAction,
    borderWidth: 1,
    borderColor: c.glassOnGradientBorder,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: c.textMuted,
  },
  formCard: {
    backgroundColor: c.glassCard,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: 18,
    padding: 16,
    shadowColor: c.shadowGlass,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.25 : 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: c.textStrong,
    marginBottom: 8,
  },
  input: {
    backgroundColor: c.glassCardSubtle,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    fontSize: 15,
    color: c.textStrong,
  },

  saveButton: {
    backgroundColor: c.primaryAction,
    borderWidth: 1,
    borderColor: c.glassOnGradientBorder,
    borderRadius: 14,
    minHeight: 52,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  saveButtonText: {
    color: c.onGradient,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
