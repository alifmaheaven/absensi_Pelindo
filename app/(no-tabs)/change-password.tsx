import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, EyeOutline, EyeOffOutline } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { changePassword } from "@/services/auth";
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
import { Ionicons } from "@expo/vector-icons";

export default function ChangePasswordScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSave = async () => {
    if (!oldPassword.trim()) {
      showToast("Password lama harus diisi", "error");
      return;
    }
    if (!newPassword.trim()) {
      showToast("Password baru harus diisi", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("Password baru minimal 8 karakter", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Konfirmasi password tidak sesuai", "error");
      return;
    }

    setLoading(true);
    try {
      await changePassword({ old_password: oldPassword, new_password: newPassword });
      showToast("Password berhasil diubah", "success");
      router.back();
    } catch (error: any) {
      showToast(error?.message || "Gagal mengubah password", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1e90ff", "#4dabf7"]}
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
              <ArrowLeft color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Ubah Password</Text>
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
          {/* Icon */}
          <View style={styles.iconSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed" size={32} color={colors.primary} />
            </View>
            <Text style={styles.iconDescription}>
              Masukkan password baru Anda
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password Lama</Text>
              <TextInput
                style={styles.input}
                value={oldPassword}
                onChangeText={setOldPassword}
                placeholder="Masukkan password lama"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password Baru</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimal 8 karakter"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Konfirmasi Password Baru</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Ulangi password baru"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
              />
            </View>

            <TouchableOpacity
              style={styles.showPasswordButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.showPasswordText}>
                {showPassword ? "Sembunyikan" : "Tampilkan"} Password
              </Text>
            </TouchableOpacity>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Simpan Password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surface,
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
    fontWeight: "600",
    color: c.onGradient,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
  },
  content: {
    flex: 1,
    marginTop: -20,
    backgroundColor: c.primarySoft,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  iconSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  iconDescription: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: c.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: c.text,
  },
  showPasswordButton: {
    alignSelf: "flex-end",
    paddingVertical: 4,
  },
  showPasswordText: {
    fontSize: 13,
    color: c.primary,
    fontWeight: "500",
  },
  saveButton: {
    backgroundColor: c.success,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
    shadowColor: c.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonText: {
    color: c.onGradient,
    fontSize: 16,
    fontWeight: "600",
  },
});
