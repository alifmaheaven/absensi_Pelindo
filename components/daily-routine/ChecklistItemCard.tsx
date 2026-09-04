import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CheckRounded, ImageIcon } from "@/components/icon";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { IDailyRoutineItem } from "@/types";

export interface IItemState {
  daily_routine_item_id: string;
  device_id?: string;
  is_checked: boolean;
  evidence_file: string | null;
  notes: string;
  local_uri: string | null;
  upload_failed?: boolean;
}

interface ChecklistItemCardProps {
  item: IDailyRoutineItem;
  state: IItemState;
  requiresPhoto: boolean;
  isReadOnly: boolean;
  loadingImage: boolean;
  onToggle: () => void;
  onPickImage: () => void;
  onRetryUpload: () => void;
  onPreviewImage: (uri: string) => void;
  onChangeNotes: (text: string) => void;
  getImageUrl: (file: string) => string;
}

export default function ChecklistItemCard({
  item,
  state,
  requiresPhoto,
  isReadOnly,
  loadingImage,
  onToggle,
  onPickImage,
  onRetryUpload,
  onPreviewImage,
  onChangeNotes,
  getImageUrl,
}: ChecklistItemCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const activePhotoUri = state.local_uri || (state.evidence_file ? getImageUrl(state.evidence_file) : null);

  return (
    <View
      style={[
        styles.checklistItem,
        state.is_checked && styles.checklistItemChecked,
      ]}
    >
      {/* Checkbox Row */}
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={isReadOnly ? undefined : onToggle}
        activeOpacity={isReadOnly ? 1 : 0.7}
        disabled={isReadOnly}
      >
        <View
          style={[
            styles.checkbox,
            state.is_checked && styles.checkboxChecked,
            isReadOnly && styles.checkboxReadOnly,
          ]}
        >
          {state.is_checked && (
            <CheckRounded width={16} height={16} color="#fff" />
          )}
        </View>
        <View style={styles.checkboxTextContainer}>
          <Text
            style={[
              styles.checkboxLabel,
              state.is_checked && styles.checkboxLabelChecked,
            ]}
          >
            {item.name}
          </Text>
          {item.description ? (
            <Text
              style={[
                styles.checkboxDescription,
                state.is_checked && styles.textMuted,
              ]}
            >
              {item.description}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {/* Photo Section (M3, M7, M8) */}
      {requiresPhoto && (
        <View style={styles.photoSection}>
          {state.evidence_file ? (
            // Successfully uploaded photo
            <View style={styles.photoPreviewContainer}>
              <TouchableOpacity
                onPress={() => activePhotoUri && onPreviewImage(activePhotoUri)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: activePhotoUri! }}
                  style={styles.photoPreview}
                />
              </TouchableOpacity>
              {!isReadOnly && (
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={onPickImage}
                  disabled={loadingImage}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retakeButtonText}>Foto Ulang</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : state.upload_failed && state.local_uri ? (
            // Upload failed — local URI preserved, retry action available (M7)
            <View style={styles.photoFailedContainer}>
              <TouchableOpacity
                onPress={() => onPreviewImage(state.local_uri!)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: state.local_uri }}
                  style={[styles.photoPreview, styles.photoPreviewFailed]}
                />
              </TouchableOpacity>
              <View style={styles.failedActionGroup}>
                <View style={styles.failedBadge}>
                  <Text style={styles.failedBadgeText}>Gagal Upload</Text>
                </View>
                {!isReadOnly && (
                  <View style={styles.failedBtnRow}>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={onRetryUpload}
                      disabled={loadingImage}
                      activeOpacity={0.8}
                    >
                      {loadingImage ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.retryButtonText}>Coba Lagi</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.retakeButtonSecondary}
                      onPress={onPickImage}
                      disabled={loadingImage}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.retakeButtonSecondaryText}>Ambil Ulang</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ) : (
            // No photo yet
            !isReadOnly ? (
              <TouchableOpacity
                style={[
                  styles.uploadPhotoButton,
                  loadingImage && { opacity: 0.6 },
                ]}
                onPress={onPickImage}
                disabled={loadingImage}
                activeOpacity={0.8}
              >
                {loadingImage ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <>
                    <ImageIcon color={colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={styles.uploadPhotoText}>Ambil Foto</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <Text style={styles.noPhotoText}>Tidak ada foto bukti</Text>
            )
          )}
        </View>
      )}

      {/* Notes Section (M2: present on both device and flat items) */}
      {isReadOnly ? (
        state.notes ? (
          <View style={styles.notesContainerReadOnly}>
            <Text style={styles.notesReadOnlyLabel}>Catatan:</Text>
            <Text style={styles.notesReadOnlyText}>{state.notes}</Text>
          </View>
        ) : null
      ) : (
        <View style={styles.notesContainer}>
          <TextInput
            style={styles.notesInput}
            placeholder="Catatan (opsional)"
            placeholderTextColor={colors.textMuted}
            value={state.notes}
            onChangeText={onChangeNotes}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    checklistItem: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 12,
    },
    checklistItemChecked: {
      backgroundColor: c.successSoft,
      borderColor: c.success,
    },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.borderStrong,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 2,
      backgroundColor: c.surface,
    },
    checkboxChecked: {
      backgroundColor: c.success,
      borderColor: c.success,
    },
    checkboxReadOnly: {
      opacity: 0.85,
    },
    checkboxTextContainer: {
      flex: 1,
    },
    checkboxLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: c.textStrong,
    },
    checkboxLabelChecked: {
      color: c.textStrong,
      fontWeight: "700",
    },
    checkboxDescription: {
      fontSize: 13,
      color: c.textSecondary,
      marginTop: 2,
      lineHeight: 18,
    },
    textMuted: {
      color: c.textSecondary,
    },

    // Photo
    photoSection: {
      marginTop: 12,
      marginLeft: 36,
    },
    photoPreviewContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    photoPreview: {
      width: 80,
      height: 80,
      borderRadius: 12,
      backgroundColor: c.border,
    },
    photoPreviewFailed: {
      borderWidth: 2,
      borderColor: c.danger,
    },
    photoFailedContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    failedActionGroup: {
      flex: 1,
      gap: 6,
    },
    failedBadge: {
      backgroundColor: c.dangerSoft,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.danger,
      alignSelf: "flex-start",
    },
    failedBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.danger,
    },
    failedBtnRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
    },
    retryButton: {
      backgroundColor: c.warning,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 72,
    },
    retryButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#ffffff",
    },
    retakeButton: {
      backgroundColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    retakeButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#ffffff",
    },
    retakeButtonSecondary: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    retakeButtonSecondaryText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textSecondary,
    },
    uploadPhotoButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      borderRadius: 12,
      padding: 12,
      borderStyle: "dashed",
      backgroundColor: c.inputBg,
    },
    uploadPhotoText: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: "600",
    },
    noPhotoText: {
      fontSize: 12,
      color: c.textMuted,
      fontStyle: "italic",
    },

    // Notes
    notesContainer: {
      marginTop: 10,
      marginLeft: 36,
    },
    notesInput: {
      backgroundColor: c.inputBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      fontSize: 13,
      color: c.text,
      minHeight: 40,
    },
    notesContainerReadOnly: {
      marginTop: 8,
      marginLeft: 36,
      backgroundColor: c.surface,
      borderRadius: 8,
      padding: 10,
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
    },
    notesReadOnlyLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: c.textSecondary,
      marginBottom: 2,
    },
    notesReadOnlyText: {
      fontSize: 13,
      color: c.text,
      lineHeight: 18,
    },
  });
