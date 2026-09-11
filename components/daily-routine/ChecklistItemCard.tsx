import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CheckRounded, DocumentCheck, ImageIcon } from "@/components/icon";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { IDailyRoutineItem } from "@/types";
import {
  EvidenceType,
  formatFileSize,
  getEvidenceRequirementLabel,
  resolveEvidenceType,
} from "@/utils/dailyRoutineHelpers";

import { IEvidenceFileItem } from "@/types/dailyRoutine";

export interface IItemState {
  daily_routine_item_id: string;
  device_id?: string;
  is_checked: boolean;
  evidence_file: string | null;
  evidence_files?: IEvidenceFileItem[];
  notes: string;
  local_uri: string | null;
  upload_failed?: boolean;
  file_name?: string | null;
  file_size?: number | null;
  file_type?: "image" | "pdf" | string | null;
}

export function getAttachedFiles(state: IItemState): IEvidenceFileItem[] {
  if (Array.isArray(state.evidence_files) && state.evidence_files.length > 0) {
    return state.evidence_files;
  }
  if (state.evidence_file || state.local_uri) {
    return [
      {
        id: "legacy",
        file: state.evidence_file,
        local_uri: state.local_uri,
        name:
          state.file_name ||
          (state.evidence_file
            ? state.evidence_file.split("/").pop()
            : "Lampiran Bukti"),
        size: state.file_size,
        type:
          state.file_type ||
          (state.evidence_file?.toLowerCase().endsWith(".pdf")
            ? "pdf"
            : "image"),
        upload_failed: state.upload_failed,
      },
    ];
  }
  return [];
}

export interface ChecklistItemCardProps {
  item: IDailyRoutineItem;
  state: IItemState;
  evidenceType?: EvidenceType;
  requiresPhoto?: boolean;
  isReadOnly: boolean;
  loadingImage?: boolean;
  loadingEvidence?: boolean;
  onToggle: () => void;
  onPickPhoto?: () => void;
  onPickImage?: () => void;
  onPickGallery?: () => void;
  onPickDocument?: () => void;
  onRetryUpload: (fileIndex?: number) => void;
  onRemoveEvidence?: (fileIndex?: number) => void;
  onReplaceEvidence?: (fileIndex?: number) => void;
  onPreviewImage: (uri: string) => void;
  onChangeNotes: (text: string) => void;
  getImageUrl: (file: string) => string;
}

export default function ChecklistItemCard({
  item,
  state,
  evidenceType,
  requiresPhoto,
  isReadOnly,
  loadingImage,
  loadingEvidence,
  onToggle,
  onPickPhoto,
  onPickImage,
  onPickGallery,
  onPickDocument,
  onRetryUpload,
  onRemoveEvidence,
  onReplaceEvidence,
  onPreviewImage,
  onChangeNotes,
  getImageUrl,
}: ChecklistItemCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isLoading = loadingEvidence ?? loadingImage ?? false;
  const handlePickPhoto = onPickPhoto || onPickImage || (() => {});
  const handlePickGallery = onPickGallery || handlePickPhoto;
  const handlePickDocument = onPickDocument || (() => {});

  const effectiveEvidenceType = resolveEvidenceType(
    evidenceType ?? item.evidence_type,
    requiresPhoto ?? item.is_photo_required
  );

  const requirementLabel = getEvidenceRequirementLabel(
    effectiveEvidenceType,
    requiresPhoto ?? item.is_photo_required
  );

  const files = getAttachedFiles(state);
  const count = files.length;
  const isMaxReached = count >= 5;
  const hasEvidence = count > 0;

  const handleReplacePress = (index = 0) => {
    if (isReadOnly) return;
    if (onReplaceEvidence) {
      onReplaceEvidence(index);
      return;
    }
    if (effectiveEvidenceType === "photo") {
      Alert.alert("Ganti Bukti", "Pilih metode bukti pengganti:", [
        { text: "Batal", style: "cancel" },
        { text: "Ambil Foto Kamera", onPress: handlePickPhoto },
        { text: "Pilih dari Galeri", onPress: handlePickGallery },
      ]);
    } else if (effectiveEvidenceType === "file") {
      Alert.alert("Ganti Bukti", "Pilih metode bukti pengganti:", [
        { text: "Batal", style: "cancel" },
        { text: "Ambil Foto Kamera", onPress: handlePickPhoto },
        { text: "Pilih dari Galeri", onPress: handlePickGallery },
        { text: "Pilih Berkas Dokumen (PDF)", onPress: handlePickDocument },
      ]);
    } else {
      // Both photo or file (OD-4: both is photo only)
      Alert.alert("Ganti Bukti", "Pilih metode bukti pengganti:", [
        { text: "Batal", style: "cancel" },
        { text: "Ambil Foto Kamera", onPress: handlePickPhoto },
        { text: "Pilih Berkas", onPress: handlePickGallery },
      ]);
    }
  };

  const handleRemovePress = (index = 0) => {
    if (isReadOnly) return;
    Alert.alert(
      "Hapus Bukti",
      "Apakah Anda yakin ingin menghapus lampiran bukti ini?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            if (onRemoveEvidence) onRemoveEvidence(index);
          },
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.checklistItem,
        state.is_checked && styles.checklistItemChecked,
      ]}
    >
      {/* Checkbox Row — Touch target >= 44px (hitSlop 12 on 24x24 box = 48px) */}
      <View style={styles.checkboxRow}>
        <TouchableOpacity
          style={styles.checkboxTouchTarget}
          onPress={isReadOnly ? undefined : onToggle}
          activeOpacity={isReadOnly ? 1 : 0.7}
          disabled={isReadOnly}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: state.is_checked }}
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
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkboxTextContainer}
          onPress={isReadOnly ? undefined : onToggle}
          activeOpacity={isReadOnly ? 1 : 0.7}
          disabled={isReadOnly}
        >
          <View style={styles.labelHeaderRow}>
            <Text
              style={[
                styles.checkboxLabel,
                state.is_checked && styles.checkboxLabelChecked,
              ]}
            >
              {item.name}
            </Text>
            {requirementLabel && (
              <View
                style={[
                  styles.requirementBadge,
                  effectiveEvidenceType === "photo" && styles.badgePhoto,
                  effectiveEvidenceType === "file" && styles.badgeFile,
                  effectiveEvidenceType === "both" && styles.badgeBoth,
                ]}
              >
                <Text
                  style={[
                    styles.requirementBadgeText,
                    effectiveEvidenceType === "photo" && styles.badgeTextPhoto,
                    effectiveEvidenceType === "file" && styles.badgeTextFile,
                    effectiveEvidenceType === "both" && styles.badgeTextBoth,
                  ]}
                >
                  {requirementLabel}
                </Text>
              </View>
            )}
          </View>

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
        </TouchableOpacity>
      </View>

      {/* Reveal-on-check Section (Only visible when checked or in read-only checked) */}
      {state.is_checked && (
        <View style={styles.revealedSection}>
          {/* Evidence Panel (if evidence required) */}
          {effectiveEvidenceType !== "none" && (
            <View style={styles.evidenceSection}>
              {hasEvidence ? (
                <>
                  <View style={styles.counterRow}>
                    <Text
                      style={[
                        styles.counterText,
                        isMaxReached && styles.counterMaxText,
                      ]}
                    >
                      {isMaxReached
                        ? "5/5 berkas terlampir (Batas maksimal tercapai)"
                        : `${count}/5 berkas terlampir`}
                    </Text>
                  </View>

                  {files.map((file, index) => {
                    const activePhotoUri =
                      file.local_uri ||
                      (file.file ? getImageUrl(file.file) : null);
                    const isPdf =
                      file.type === "pdf" ||
                      (file.name
                        ? file.name.toLowerCase().endsWith(".pdf")
                        : false) ||
                      (file.file
                        ? file.file.toLowerCase().endsWith(".pdf")
                        : false);
                    const fileNameDisplay =
                      file.name ||
                      (file.file
                        ? file.file.split("/").pop() || "Lampiran Bukti"
                        : "Lampiran Bukti");
                    const fileSizeDisplay = file.size
                      ? formatFileSize(file.size)
                      : "";

                    return (
                      <View
                        key={file.id || `${index}-${fileNameDisplay}`}
                        style={{ marginBottom: 8 }}
                      >
                        {file.upload_failed ? (
                          // Upload failed state
                          <View style={styles.evidenceFailedBox}>
                            <View style={styles.thumbnailWrapper}>
                              {isPdf ? (
                                <View style={styles.pdfThumbnailFailed}>
                                  <DocumentCheck
                                    width={28}
                                    height={28}
                                    color={colors.danger}
                                  />
                                  <Text style={styles.pdfBadgeTextFailed}>
                                    PDF
                                  </Text>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  onPress={() =>
                                    activePhotoUri &&
                                    onPreviewImage(activePhotoUri)
                                  }
                                  activeOpacity={0.8}
                                  accessibilityRole="imagebutton"
                                  accessibilityLabel={`Lihat foto ${fileNameDisplay}`}
                                >
                                  <Image
                                    source={{ uri: activePhotoUri || "" }}
                                    style={[
                                      styles.evidenceThumbnail,
                                      styles.evidenceThumbnailFailed,
                                    ]}
                                  />
                                </TouchableOpacity>
                              )}
                            </View>

                            <View style={styles.evidenceInfoCol}>
                              <View style={styles.failedBadge}>
                                <Text style={styles.failedBadgeText}>
                                  Gagal Upload
                                </Text>
                              </View>
                              <Text
                                style={styles.fileNameText}
                                numberOfLines={1}
                              >
                                {fileNameDisplay}
                              </Text>
                              {fileSizeDisplay ? (
                                <Text style={styles.fileSizeText}>
                                  ({fileSizeDisplay})
                                </Text>
                              ) : null}

                              {!isReadOnly && (
                                <View style={styles.actionBtnRow}>
                                  <TouchableOpacity
                                    style={styles.retryButton}
                                    onPress={() => onRetryUpload(index)}
                                    disabled={isLoading}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel="Coba Lagi"
                                  >
                                    {isLoading ? (
                                      <ActivityIndicator
                                        size="small"
                                        color="#fff"
                                      />
                                    ) : (
                                      <Text style={styles.retryButtonText}>
                                        Coba Lagi
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.actionButtonSecondary}
                                    onPress={() => handleReplacePress(index)}
                                    disabled={isLoading}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Ganti bukti ${fileNameDisplay}`}
                                  >
                                    <Text
                                      style={styles.actionButtonSecondaryText}
                                    >
                                      Ganti
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.actionButtonDanger}
                                    onPress={() => handleRemovePress(index)}
                                    disabled={isLoading}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Hapus bukti ${fileNameDisplay}`}
                                  >
                                    <Text style={styles.actionButtonDangerText}>
                                      Hapus
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          </View>
                        ) : (
                          // Successfully attached evidence preview
                          <View style={styles.evidenceAttachedBox}>
                            <View style={styles.thumbnailWrapper}>
                              {isPdf ? (
                                <View style={styles.pdfThumbnail}>
                                  <DocumentCheck
                                    width={30}
                                    height={30}
                                    color={colors.primary}
                                  />
                                  <Text style={styles.pdfBadgeText}>PDF</Text>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  onPress={() =>
                                    activePhotoUri &&
                                    onPreviewImage(activePhotoUri)
                                  }
                                  activeOpacity={0.8}
                                  accessibilityRole="imagebutton"
                                  accessibilityLabel={`Lihat foto ${fileNameDisplay}`}
                                >
                                  <Image
                                    source={{ uri: activePhotoUri || "" }}
                                    style={styles.evidenceThumbnail}
                                  />
                                </TouchableOpacity>
                              )}
                            </View>

                            <View style={styles.evidenceInfoCol}>
                              <View style={styles.attachedStatusRow}>
                                <CheckRounded
                                  width={14}
                                  height={14}
                                  color={colors.success}
                                />
                                <Text style={styles.attachedStatusText}>
                                  Bukti terlampir
                                </Text>
                              </View>
                              <Text
                                style={styles.fileNameText}
                                numberOfLines={1}
                              >
                                {fileNameDisplay}{" "}
                                {fileSizeDisplay ? `(${fileSizeDisplay})` : ""}
                              </Text>

                              {!isReadOnly && (
                                <View style={styles.actionBtnRow}>
                                  <TouchableOpacity
                                    style={styles.actionButtonPrimary}
                                    onPress={() => handleReplacePress(index)}
                                    disabled={isLoading}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Ganti bukti ${fileNameDisplay}`}
                                  >
                                    <Text
                                      style={styles.actionButtonPrimaryText}
                                    >
                                      Ganti
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.actionButtonDanger}
                                    onPress={() => handleRemovePress(index)}
                                    disabled={isLoading}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Hapus bukti ${fileNameDisplay}`}
                                  >
                                    <Text style={styles.actionButtonDangerText}>
                                      Hapus
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* Add more slot if under cap (< 5) */}
                  {!isReadOnly && !isMaxReached && (
                    <View style={styles.addMoreSection}>
                      {effectiveEvidenceType === "photo" && (
                        <View style={styles.bothButtonsRow}>
                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonPhoto,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickPhoto}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            <ImageIcon
                              color={colors.primary}
                              width={16}
                              height={16}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.pickerButtonPhotoText}>
                              Ambil Foto
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonGallery,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickGallery}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            <ImageIcon
                              color={colors.textSecondary}
                              width={16}
                              height={16}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.pickerButtonGalleryText}>
                              Pilih dari Galeri
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {effectiveEvidenceType === "file" && (
                        <View style={styles.bothButtonsRow}>
                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonGallery,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickGallery}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            <ImageIcon
                              color={colors.textSecondary}
                              width={16}
                              height={16}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.pickerButtonGalleryText}>
                              Pilih dari Galeri
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonFile,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickDocument}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            <DocumentCheck
                              color={colors.textSecondary}
                              width={16}
                              height={16}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.pickerButtonFileText}>
                              Pilih Berkas Dokumen (PDF)
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {effectiveEvidenceType === "both" && (
                        <View style={styles.bothButtonsRow}>
                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonPhoto,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickPhoto}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            <ImageIcon
                              color={colors.primary}
                              width={16}
                              height={16}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.pickerButtonPhotoText}>
                              Ambil Foto
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonFile,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickGallery}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            <DocumentCheck
                              color={colors.textSecondary}
                              width={16}
                              height={16}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.pickerButtonFileText}>
                              Pilih Berkas
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </>
              ) : (
                // No evidence attached yet: render pickers according to evidence_type
                !isReadOnly ? (
                  <View style={styles.pickerSection}>
                    {effectiveEvidenceType === "photo" && (
                      <View style={styles.pickerSection}>
                        <TouchableOpacity
                          style={[
                            styles.pickerButton,
                            styles.pickerButtonPhoto,
                            isLoading && { opacity: 0.6 },
                          ]}
                          onPress={handlePickPhoto}
                          disabled={isLoading}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Ambil Foto"
                        >
                          {isLoading ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.primary}
                            />
                          ) : (
                            <>
                              <ImageIcon
                                color={colors.primary}
                                width={18}
                                height={18}
                                style={{ marginRight: 8 }}
                              />
                              <Text style={styles.pickerButtonPhotoText}>
                                Ambil Foto
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.pickerButton,
                            styles.pickerButtonGallery,
                            isLoading && { opacity: 0.6 },
                          ]}
                          onPress={handlePickGallery}
                          disabled={isLoading}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Pilih dari Galeri"
                        >
                          <ImageIcon
                            color={colors.textSecondary}
                            width={18}
                            height={18}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.pickerButtonGalleryText}>
                            Pilih dari Galeri
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {effectiveEvidenceType === "file" && (
                      <View style={styles.pickerSection}>
                        <TouchableOpacity
                          style={[
                            styles.pickerButton,
                            styles.pickerButtonFile,
                            isLoading && { opacity: 0.6 },
                          ]}
                          onPress={handlePickDocument}
                          disabled={isLoading}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Pilih Berkas Dokumen"
                        >
                          {isLoading ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.textSecondary}
                            />
                          ) : (
                            <>
                              <DocumentCheck
                                color={colors.textSecondary}
                                width={18}
                                height={18}
                                style={{ marginRight: 8 }}
                              />
                              <Text style={styles.pickerButtonFileText}>
                                Pilih Berkas Dokumen (PDF/JPG/PNG)
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.pickerButton,
                            styles.pickerButtonGallery,
                            isLoading && { opacity: 0.6 },
                          ]}
                          onPress={handlePickGallery}
                          disabled={isLoading}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Pilih dari Galeri"
                        >
                          <ImageIcon
                            color={colors.textSecondary}
                            width={18}
                            height={18}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.pickerButtonGalleryText}>
                            Pilih dari Galeri
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {effectiveEvidenceType === "both" && (
                      <View style={styles.bothPickerContainer}>
                        <Text style={styles.bothPickerHint}>
                          Pilih salah satu bukti pelaksanaan *:
                        </Text>
                        <View style={styles.bothButtonsRow}>
                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonPhoto,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickPhoto}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            {isLoading ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.primary}
                              />
                            ) : (
                              <>
                                <ImageIcon
                                  color={colors.primary}
                                  width={16}
                                  height={16}
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.pickerButtonPhotoText}>
                                  Ambil Foto
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <Text style={styles.orSeparatorText}>atau</Text>

                          <TouchableOpacity
                            style={[
                              styles.pickerButton,
                              styles.pickerButtonFile,
                              styles.bothBtn,
                              isLoading && { opacity: 0.6 },
                            ]}
                            onPress={handlePickGallery}
                            disabled={isLoading}
                            activeOpacity={0.8}
                          >
                            {isLoading ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.textSecondary}
                              />
                            ) : (
                              <>
                                <DocumentCheck
                                  color={colors.textSecondary}
                                  width={16}
                                  height={16}
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.pickerButtonFileText}>
                                  Pilih Berkas
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noEvidenceText}>
                    Tidak ada bukti terlampir
                  </Text>
                )
              )}
            </View>
          )}

          {/* Notes Section */}
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
                placeholder="Catatan tambahan (opsional)"
                placeholderTextColor={colors.textMuted}
                value={state.notes || ""}
                onChangeText={onChangeNotes}
                multiline={true}
                numberOfLines={4}
                maxLength={2000}
                textAlignVertical="top"
                returnKeyType="default"
                blurOnSubmit={false}
                editable={!isReadOnly}
              />
              {state.notes && state.notes.length > 1800 ? (
                <Text
                  style={{
                    fontSize: 11,
                    textAlign: "right",
                    marginTop: 4,
                    color: state.notes.length >= 2000 ? "#ef4444" : "#f59e0b",
                    fontWeight: state.notes.length >= 2000 ? "700" : "500",
                  }}
                >
                  {state.notes.length}/2000 karakter
                </Text>
              ) : null}
            </View>
          )}
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
    checkboxTouchTarget: {
      paddingTop: 2,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.borderStrong,
      justifyContent: "center",
      alignItems: "center",
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
    labelHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 6,
    },
    checkboxLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: c.textStrong,
      flex: 1,
    },
    checkboxLabelChecked: {
      color: c.textStrong,
      fontWeight: "700",
    },
    checkboxDescription: {
      fontSize: 13,
      color: c.textSecondary,
      marginTop: 3,
      lineHeight: 18,
    },
    textMuted: {
      color: c.textSecondary,
    },

    // Requirement Badge before checked
    requirementBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
    },
    badgePhoto: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    badgeFile: {
      backgroundColor: c.surface,
      borderColor: c.borderStrong,
    },
    badgeBoth: {
      backgroundColor: "rgba(16, 185, 129, 0.12)",
      borderColor: c.success,
    },
    requirementBadgeText: {
      fontSize: 11,
      fontWeight: "700",
    },
    badgeTextPhoto: {
      color: c.primary,
    },
    badgeTextFile: {
      color: c.textSecondary,
    },
    badgeTextBoth: {
      color: c.success,
    },

    // Revealed Section
    revealedSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },

    // Evidence Section
    evidenceSection: {
      marginBottom: 8,
    },
    evidenceAttachedBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    evidenceFailedBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.dangerSoft,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: c.danger,
    },
    thumbnailWrapper: {
      width: 64,
      height: 64,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: c.border,
      justifyContent: "center",
      alignItems: "center",
    },
    evidenceThumbnail: {
      width: 64,
      height: 64,
      borderRadius: 10,
    },
    evidenceThumbnailFailed: {
      borderWidth: 2,
      borderColor: c.danger,
    },
    pdfThumbnail: {
      width: 64,
      height: 64,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
      justifyContent: "center",
      alignItems: "center",
    },
    pdfThumbnailFailed: {
      width: 64,
      height: 64,
      borderRadius: 10,
      backgroundColor: c.dangerSoft,
      justifyContent: "center",
      alignItems: "center",
    },
    pdfBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: c.primary,
      marginTop: 2,
    },
    pdfBadgeTextFailed: {
      fontSize: 10,
      fontWeight: "700",
      color: c.danger,
      marginTop: 2,
    },
    evidenceInfoCol: {
      flex: 1,
      gap: 4,
    },
    attachedStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    attachedStatusText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.success,
    },
    fileNameText: {
      fontSize: 12.5,
      color: c.textStrong,
      fontWeight: "600",
    },
    fileSizeText: {
      fontSize: 11.5,
      color: c.textSecondary,
    },
    actionBtnRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 4,
    },
    actionButtonPrimary: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    actionButtonPrimaryText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: c.primary,
    },
    actionButtonSecondary: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    actionButtonSecondaryText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textSecondary,
    },
    actionButtonDanger: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    actionButtonDangerText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: c.danger,
    },
    retryButton: {
      backgroundColor: c.warning,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    retryButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#ffffff",
    },
    failedBadge: {
      backgroundColor: c.dangerSoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: "flex-start",
    },
    failedBadgeText: {
      fontSize: 10.5,
      fontWeight: "700",
      color: c.danger,
    },

    // Pickers
    pickerSection: {
      gap: 8,
    },
    pickerButton: {
      minHeight: 44,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
    },
    pickerButtonPhoto: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    pickerButtonPhotoText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    pickerButtonFile: {
      backgroundColor: c.surface,
      borderColor: c.borderStrong,
    },
    pickerButtonFileText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textSecondary,
    },
    bothPickerContainer: {
      gap: 8,
    },
    bothPickerHint: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textSecondary,
    },
    bothButtonsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    bothBtn: {
      flex: 1,
    },
    orSeparatorText: {
      fontSize: 12,
      color: c.textSecondary,
      fontWeight: "500",
    },
    noEvidenceText: {
      fontSize: 12,
      color: c.textMuted,
      fontStyle: "italic",
    },
    counterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    counterText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textSecondary,
    },
    counterMaxText: {
      color: c.warning,
      fontWeight: "700",
    },
    addMoreSection: {
      marginTop: 8,
    },
    pickerButtonGallery: {
      backgroundColor: c.surface,
      borderColor: c.borderStrong,
    },
    pickerButtonGalleryText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textSecondary,
    },

    // Notes
    notesContainer: {
      marginTop: 6,
    },
    notesInput: {
      backgroundColor: c.inputBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 13,
      color: c.text,
      minHeight: 80,
      textAlignVertical: "top",
    },
    notesContainerReadOnly: {
      marginTop: 6,
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
