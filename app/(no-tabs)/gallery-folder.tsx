import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share,
  Modal,
  Linking,
  StyleSheet,
  TextInput,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  getPhotos,
  uploadPhotos,
  deletePhoto,
  bulkDeletePhotos,
  updatePhotoCategory,
  updateFolder,
  generateShareToken,
} from "@/services/gallery";
import { IGalleryPhoto } from "@/types/gallery";

type UploadFile = {
  uri: string;
  name: string;
  type: string;
};

function imageToUploadFile(asset: ImagePicker.ImagePickerAsset): UploadFile {
  const filename = asset.uri.split("/").pop() || "photo.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";
  return { uri: asset.uri, name: filename, type };
}

function docToUploadFile(asset: DocumentPicker.DocumentPickerAsset): UploadFile {
  return {
    uri: asset.uri,
    name: asset.name || "document",
    type: asset.mimeType || "application/octet-stream",
  };
}

function isImageItem(item: IGalleryPhoto): boolean {
  return !!item.mime_type?.toLowerCase().startsWith("image/");
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const GRID_COLS = 3;
const GAP = 2;
const CELL_SIZE = (SCREEN_WIDTH - GAP * (GRID_COLS + 1)) / GRID_COLS;
const PAGE_SIZE = 30;

const CATEGORY_PRESETS = ["Sebelum", "Pengerjaan", "Sesudah", "Temuan", "Dokumentasi"];

export default function GalleryFolderScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const [currentFolderName, setCurrentFolderName] = useState(name || "Folder");
  const [photos, setPhotos] = useState<IGalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Error & Access
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [selectedUploadCategory, setSelectedUploadCategory] = useState<string>("Umum");

  // Selection mode (multi-delete)
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

  // Rename folder
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(false);

  // Fullscreen photo viewer
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const viewerListRef = useRef<FlatList<IGalleryPhoto>>(null);

  // Category change modal
  const [categoryTarget, setCategoryTarget] = useState<IGalleryPhoto | null>(null);
  const [categoryChoice, setCategoryChoice] = useState<string>("");
  const [customCategoryInput, setCustomCategoryInput] = useState<string>("");
  const [updatingCategory, setUpdatingCategory] = useState(false);

  // Filter image photos for fullscreen viewer
  const imagePhotos = useMemo(() => photos.filter(isImageItem), [photos]);

  const fetchPhotos = useCallback(async (targetPage = 1) => {
    if (!id) return;
    try {
      const res = await getPhotos(id, targetPage, PAGE_SIZE);
      const dataList: IGalleryPhoto[] = res?.data?.data || [];
      const meta = res?.data?.meta;

      if (targetPage === 1) {
        setPhotos(dataList);
      } else {
        setPhotos((prev) => [...prev, ...dataList]);
      }

      setPage(targetPage);
      if (meta) {
        setHasMore(targetPage < meta.total_page);
      } else {
        setHasMore(dataList.length === PAGE_SIZE);
      }

      setIsAccessDenied(false);
      setDeniedMessage(null);
      setIsError(false);
    } catch (err: any) {
      if (err?.code === 403 || err?.status === 403 || err?.response?.status === 403) {
        setIsAccessDenied(true);
        setDeniedMessage(err?.message || "Anda tidak memiliki izin untuk melihat foto dalam folder ini.");
      } else {
        console.error("Failed to fetch photos:", err);
        if (targetPage === 1) {
          setIsError(true);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [id]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!ignore) {
        await fetchPhotos(1);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [fetchPhotos]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPhotos(1);
  }, [fetchPhotos]);

  const loadMore = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPhotos(page + 1);
  }, [loading, refreshing, loadingMore, hasMore, page, fetchPhotos]);

  // Upload Handlers
  const uploadAssets = async (files: UploadFile[]) => {
    if (!id || files.length === 0) return;
    if (files.length > 20) {
      Alert.alert("Batas File Terlampaui", "Maksimal 20 file per sekali unggah. Silakan kurangi pilihan file.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("photos", {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as any);
      }
      const categoryParam = selectedUploadCategory !== "Umum" ? selectedUploadCategory : undefined;
      const res = await uploadPhotos(id, formData, categoryParam);
      const newPhotos = res?.data || [];
      setPhotos((prev) => [...newPhotos, ...prev]);
      Alert.alert("Berhasil", `${files.length} file berhasil diunggah.`);
    } catch (err: any) {
      Alert.alert(
        err?.title || "Gagal Unggah",
        err?.message || "Terjadi kesalahan saat mengunggah file. Pastikan koneksi internet stabil."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.getCameraPermissionsAsync();
      if (!permission.granted) {
        const requested = await ImagePicker.requestCameraPermissionsAsync();
        if (!requested.granted) {
          Alert.alert(
            "Izin Kamera Diperlukan",
            "Aplikasi membutuhkan akses kamera untuk mengambil foto dokumentasi operasional."
          );
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      await uploadAssets(result.assets.map(imageToUploadFile));
    } catch (err: any) {
      Alert.alert("Error Kamera", err?.message || "Gagal membuka kamera.");
    }
  };

  const handlePickImages = async () => {
    try {
      const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!requested.granted) {
          Alert.alert(
            "Izin Galeri Diperlukan",
            "Aplikasi membutuhkan akses media untuk memilih foto dokumentasi dari penyimpanan perangkat."
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      await uploadAssets(result.assets.map(imageToUploadFile));
    } catch (err: any) {
      Alert.alert("Error Galeri", err?.message || "Gagal membuka galeri foto.");
    }
  };

  const handlePickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      await uploadAssets(result.assets.map(docToUploadFile));
    } catch (err: any) {
      Alert.alert("Error Dokumen", err?.message || "Gagal memilih dokumen.");
    }
  };

  // Single Delete
  const handleDelete = (photo: IGalleryPhoto) => {
    Alert.alert("Hapus File", `Hapus "${photo.original_name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePhoto(photo.id);
            setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
            if (viewerVisible) {
              setViewerVisible(false);
            }
          } catch (err: any) {
            Alert.alert(err?.title || "Error", err?.message || "Gagal menghapus file");
          }
        },
      },
    ]);
  };

  // Multi-Select Handlers
  const toggleSelect = (photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(photos.map((p) => p.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Hapus Banyak File",
      `Hapus ${selectedIds.size} file yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            setDeletingBulk(true);
            try {
              const idsArray = Array.from(selectedIds);
              await bulkDeletePhotos(idsArray);
              setPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
              setIsSelectionMode(false);
              setSelectedIds(new Set());
              Alert.alert("Sukses", `${idsArray.length} file berhasil dihapus.`);
            } catch (err: any) {
              Alert.alert(err?.title || "Gagal Hapus", err?.message || "Gagal menghapus file yang dipilih.");
            } finally {
              setDeletingBulk(false);
            }
          },
        },
      ]
    );
  };

  // Rename Folder
  const handleRenameFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!id || !trimmed || renamingFolder) return;
    setRenamingFolder(true);
    try {
      await updateFolder(id, trimmed);
      setCurrentFolderName(trimmed);
      setShowRenameModal(false);
      setNewFolderName("");
      Alert.alert("Sukses", "Nama folder berhasil diperbarui.");
    } catch (err: any) {
      Alert.alert(err?.title || "Error", err?.message || "Gagal memperbarui nama folder.");
    } finally {
      setRenamingFolder(false);
    }
  };

  // Category Edit Handlers
  const openCategoryModal = (photo: IGalleryPhoto) => {
    setCategoryTarget(photo);
    const existing = photo.category || "";
    if (CATEGORY_PRESETS.includes(existing)) {
      setCategoryChoice(existing);
      setCustomCategoryInput("");
    } else if (existing) {
      setCategoryChoice("Lainnya");
      setCustomCategoryInput(existing);
    } else {
      setCategoryChoice("Sebelum");
      setCustomCategoryInput("");
    }
  };

  const handleSaveCategory = async () => {
    if (!categoryTarget) return;
    const finalCategory =
      categoryChoice === "Lainnya" ? customCategoryInput.trim() : categoryChoice.trim();

    if (!finalCategory) {
      Alert.alert("Kategori Wajib", "Silakan tentukan nama kategori.");
      return;
    }
    if (finalCategory.length > 50) {
      Alert.alert("Kategori Terlalu Panjang", "Maksimal 50 karakter.");
      return;
    }

    setUpdatingCategory(true);
    try {
      await updatePhotoCategory(categoryTarget.id, finalCategory);
      setPhotos((prev) =>
        prev.map((p) => (p.id === categoryTarget.id ? { ...p, category: finalCategory } : p))
      );
      setCategoryTarget(null);
      Alert.alert("Sukses", "Kategori foto berhasil diperbarui.");
    } catch (err: any) {
      Alert.alert(err?.title || "Error", err?.message || "Gagal mengubah kategori foto.");
    } finally {
      setUpdatingCategory(false);
    }
  };

  // Share
  const handleShare = async () => {
    if (!id) return;
    try {
      const res = await generateShareToken(id);
      const token = res?.data?.share_token;
      if (token) {
        await Share.share({
          message: `Lihat galeri "${currentFolderName}": https://ticketing.vps.prakhya.id/gallery/share/${token}`,
        });
      }
    } catch (err: any) {
      Alert.alert(err?.title || "Error", err?.message || "Gagal generate link share");
    }
  };

  // Open item viewer
  const handleItemPress = (item: IGalleryPhoto) => {
    if (isSelectionMode) {
      toggleSelect(item.id);
      return;
    }
    if (isImageItem(item)) {
      const idx = imagePhotos.findIndex((p) => p.id === item.id);
      setViewerIndex(idx >= 0 ? idx : 0);
      setViewerVisible(true);
    } else {
      Linking.openURL(item.url);
    }
  };

  const handleItemLongPress = (item: IGalleryPhoto) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([item.id]));
    } else {
      toggleSelect(item.id);
    }
  };

  // Render Grid Cell
  const renderPhoto = ({ item }: { item: IGalleryPhoto }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleItemLongPress(item)}
        activeOpacity={0.7}
        style={[
          styles.cell,
          isSelected && { borderColor: colors.primary, borderWidth: 2 },
        ]}
      >
        {isImageItem(item) ? (
          <Image source={{ uri: item.url }} style={styles.cellImage} contentFit="cover" />
        ) : (
          <View style={styles.cellDoc}>
            <Ionicons name="document-text-outline" size={32} color={colors.primary} />
            <Text numberOfLines={2} style={styles.cellDocText}>
              {item.original_name}
            </Text>
          </View>
        )}

        {/* Category Badge on thumbnail */}
        {item.category ? (
          <View style={styles.categoryBadge}>
            <Text numberOfLines={1} style={styles.categoryBadgeText}>
              {item.category}
            </Text>
          </View>
        ) : null}

        {/* Multi-select checkmark circle */}
        {isSelectionMode && (
          <View
            style={[
              styles.selectCircle,
              isSelected ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
            ]}
          >
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const currentViewerPhoto = imagePhotos[viewerIndex] || null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="dark-content" />

      {/* Top App Bar */}
      {isSelectionMode ? (
        <View style={styles.appBar}>
          <TouchableOpacity
            onPress={() => {
              setIsSelectionMode(false);
              setSelectedIds(new Set());
            }}
            style={styles.barButton}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "600" }}>Batal</Text>
          </TouchableOpacity>

          <Text style={styles.barTitle} numberOfLines={1}>
            {selectedIds.size} dipilih
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={toggleSelectAll} style={styles.barButton}>
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
                {selectedIds.size === photos.length ? "Batal Semua" : "Semua"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleBulkDelete}
              disabled={selectedIds.size === 0 || deletingBulk}
              style={[
                styles.bulkDeleteBtn,
                { opacity: selectedIds.size === 0 || deletingBulk ? 0.4 : 1 },
              ]}
            >
              {deletingBulk ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                    Hapus ({selectedIds.size})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8, padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>

          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.barTitle} numberOfLines={1}>
              {currentFolderName}
            </Text>
            {!isAccessDenied && (
              <TouchableOpacity
                onPress={() => {
                  setNewFolderName(currentFolderName);
                  setShowRenameModal(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {!isAccessDenied && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {photos.length > 0 && (
                <TouchableOpacity onPress={() => setIsSelectionMode(true)} style={styles.barButton}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>Pilih</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={handleShare} style={styles.barButton}>
                <Ionicons name="share-social-outline" size={20} color={colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowSourceModal(true)}
                disabled={uploading}
                style={styles.addBtn}
              >
                <Text style={{ color: colors.onGradient, fontWeight: "600", fontSize: 13 }}>
                  {uploading ? "Unggah..." : "+ Tambah"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Main Grid Content */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          key="gallery_photo_grid"
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLS}
          contentContainerStyle={{ padding: GAP }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            isAccessDenied ? (
              <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 24 }}>
                <Ionicons name="lock-closed-outline" size={48} color={colors.danger} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 12 }}>
                  Akses Ditolak
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 6 }}>
                  {deniedMessage || "Anda tidak memiliki izin untuk melihat foto dalam folder ini."}
                </Text>
              </View>
            ) : isError ? (
              <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 24 }}>
                <Ionicons name="cloud-offline-outline" size={48} color={colors.danger} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 12 }}>
                  Koneksi Bermasalah
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 6 }}>
                  Gagal memuat isi folder. Periksa jaringan Anda dan coba lagi.
                </Text>
                <TouchableOpacity onPress={onRefresh} style={[styles.addBtn, { marginTop: 16 }]}>
                  <Text style={{ color: colors.onGradient, fontWeight: "600" }}>Coba Lagi</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: "center", paddingTop: 80 }}>
                <Ionicons name="images-outline" size={48} color={colors.textFaint} />
                <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 10 }}>
                  Belum ada file dalam folder ini
                </Text>
              </View>
            )
          }
        />
      )}

      {/* Fullscreen Photo Viewer Modal with Swipe & Navigation */}
      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
        statusBarTranslucent
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.viewerContainer}>
          {/* Top Overlay */}
          <SafeAreaView style={styles.viewerTopBar}>
            <TouchableOpacity
              onPress={() => setViewerVisible(false)}
              style={styles.viewerIconButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.viewerCounter}>
              {imagePhotos.length > 0 ? `${viewerIndex + 1} / ${imagePhotos.length}` : ""}
            </Text>

            {currentViewerPhoto && (
              <TouchableOpacity
                onPress={() => handleDelete(currentViewerPhoto)}
                style={styles.viewerIconButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="trash-outline" size={22} color="#ff4d4f" />
              </TouchableOpacity>
            )}
          </SafeAreaView>

          {/* Swipeable Photo Slides */}
          <FlatList
            ref={viewerListRef}
            data={imagePhotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewerIndex >= 0 && viewerIndex < imagePhotos.length ? viewerIndex : 0}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                viewerListRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 50);
            }}
            onMomentumScrollEnd={(e) => {
              const nextIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              if (nextIdx >= 0 && nextIdx < imagePhotos.length) {
                setViewerIndex(nextIdx);
              }
            }}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.slideItem}>
                <Image
                  source={{ uri: item.url }}
                  style={styles.slideImage}
                  contentFit="contain"
                />
              </View>
            )}
          />

          {/* Previous / Next Arrow Controls for Accessibility */}
          {viewerIndex > 0 && (
            <TouchableOpacity
              style={[styles.arrowControl, { left: 12 }]}
              onPress={() => {
                const prev = viewerIndex - 1;
                viewerListRef.current?.scrollToIndex({ index: prev, animated: true });
                setViewerIndex(prev);
              }}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          {viewerIndex < imagePhotos.length - 1 && (
            <TouchableOpacity
              style={[styles.arrowControl, { right: 12 }]}
              onPress={() => {
                const next = viewerIndex + 1;
                viewerListRef.current?.scrollToIndex({ index: next, animated: true });
                setViewerIndex(next);
              }}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Bottom Overlay (Info & Edit Category) */}
          {currentViewerPhoto && (
            <SafeAreaView style={styles.viewerBottomBar}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.viewerOriginalName} numberOfLines={1}>
                  {currentViewerPhoto.original_name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 }}>
                  <Text style={styles.viewerMetaText}>
                    Kategori: {currentViewerPhoto.category || "Belum ditentukan"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => openCategoryModal(currentViewerPhoto)}
                style={styles.categoryEditBtn}
              >
                <Ionicons name="pricetag-outline" size={15} color="#fff" style={{ marginRight: 4 }} />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Ubah Kategori</Text>
              </TouchableOpacity>
            </SafeAreaView>
          )}
        </View>
      </Modal>

      {/* Edit Category Modal */}
      <Modal visible={!!categoryTarget} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.categoryModalCard}>
            <Text style={styles.modalHeading}>Atur Kategori Foto</Text>
            <Text style={styles.modalSubheading} numberOfLines={1}>
              {categoryTarget?.original_name}
            </Text>

            <View style={styles.chipContainer}>
              {CATEGORY_PRESETS.map((preset) => {
                const isSelected = categoryChoice === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => setCategoryChoice(preset)}
                    style={[
                      styles.presetChip,
                      isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        isSelected && { color: colors.onGradient, fontWeight: "700" },
                      ]}
                    >
                      {preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => setCategoryChoice("Lainnya")}
                style={[
                  styles.presetChip,
                  categoryChoice === "Lainnya" && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    categoryChoice === "Lainnya" && { color: colors.onGradient, fontWeight: "700" },
                  ]}
                >
                  Lainnya...
                </Text>
              </TouchableOpacity>
            </View>

            {categoryChoice === "Lainnya" && (
              <TextInput
                placeholder="Ketik nama kategori..."
                placeholderTextColor={colors.textFaint}
                value={customCategoryInput}
                onChangeText={setCustomCategoryInput}
                autoFocus
                maxLength={50}
                style={styles.customCategoryInput}
              />
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                onPress={() => setCategoryTarget(null)}
                style={{ paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={{ color: colors.textSecondary }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveCategory}
                disabled={updatingCategory}
                style={[styles.saveBtn, { opacity: updatingCategory ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.onGradient, fontWeight: "700" }}>
                  {updatingCategory ? "Menyimpan..." : "Simpan Kategori"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Folder Modal */}
      <Modal visible={showRenameModal} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.categoryModalCard}>
            <Text style={styles.modalHeading}>Ubah Nama Folder</Text>
            <TextInput
              placeholder="Nama folder baru"
              placeholderTextColor={colors.textFaint}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              style={styles.customCategoryInput}
              onSubmitEditing={handleRenameFolder}
            />
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                onPress={() => setShowRenameModal(false)}
                style={{ paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={{ color: colors.textSecondary }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRenameFolder}
                disabled={!newFolderName.trim() || renamingFolder}
                style={[
                  styles.saveBtn,
                  { opacity: !newFolderName.trim() || renamingFolder ? 0.5 : 1 },
                ]}
              >
                <Text style={{ color: colors.onGradient, fontWeight: "700" }}>
                  {renamingFolder ? "Menyimpan..." : "Simpan"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Upload Source Modal with Category Preset Selector */}
      <Modal
        visible={showSourceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSourceModal(false)}
      >
        <TouchableOpacity
          style={styles.bottomModalOverlay}
          activeOpacity={1}
          onPress={() => setShowSourceModal(false)}
        >
          <View style={styles.bottomModalContent}>
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>Pilih Sumber Unggah</Text>

            {/* Category selection for upload */}
            <Text style={styles.uploadCategoryLabel}>Tag Kategori (Opsional):</Text>
            <View style={styles.uploadChipRow}>
              {["Umum", ...CATEGORY_PRESETS].map((cat) => {
                const isSelected = selectedUploadCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedUploadCategory(cat)}
                    style={[
                      styles.uploadChip,
                      isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.uploadChipText,
                        isSelected && { color: colors.onGradient, fontWeight: "700" },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.modalButtonPrimary, { opacity: uploading ? 0.7 : 1 }]}
              onPress={() => {
                setShowSourceModal(false);
                handleTakePhoto();
              }}
              disabled={uploading}
            >
              <Ionicons name="camera-outline" size={18} color={colors.onGradient} style={{ marginRight: 8 }} />
              <Text style={styles.modalButtonTextPrimary}>Ambil Dari Kamera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButtonSecondary, { opacity: uploading ? 0.7 : 1 }]}
              onPress={() => {
                setShowSourceModal(false);
                handlePickImages();
              }}
              disabled={uploading}
            >
              <Ionicons name="images-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={styles.modalButtonTextSecondary}>Pilih Dari Galeri Foto</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButtonSecondary, { opacity: uploading ? 0.7 : 1 }]}
              onPress={() => {
                setShowSourceModal(false);
                handlePickDocuments();
              }}
              disabled={uploading}
            >
              <Ionicons name="document-attach-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={styles.modalButtonTextSecondary}>Dokumen (PDF / DOCX / XLSX)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalButtonCancel}
              onPress={() => setShowSourceModal(false)}
            >
              <Text style={styles.modalButtonTextCancel}>Kembali</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    appBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.background,
    },
    barTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: c.text,
      flex: 1,
    },
    barButton: {
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    addBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
    },
    bulkDeleteBtn: {
      backgroundColor: c.danger,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    cell: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      margin: GAP,
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor: c.border,
      position: "relative",
    },
    cellImage: {
      width: "100%",
      height: "100%",
    },
    cellDoc: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 6,
      backgroundColor: c.card,
    },
    cellDocText: {
      fontSize: 10,
      color: c.textSecondary,
      textAlign: "center",
      marginTop: 4,
    },
    categoryBadge: {
      position: "absolute",
      bottom: 4,
      left: 4,
      right: 4,
      backgroundColor: "rgba(0,0,0,0.65)",
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
    },
    categoryBadgeText: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "600",
      textAlign: "center",
    },
    selectCircle: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: "#fff",
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "center",
      alignItems: "center",
    },
    // Fullscreen Viewer
    viewerContainer: {
      flex: 1,
      backgroundColor: "#000",
      justifyContent: "center",
      alignItems: "center",
    },
    viewerTopBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    viewerCounter: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "600",
    },
    viewerIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,0.15)",
      justifyContent: "center",
      alignItems: "center",
    },
    slideItem: {
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      justifyContent: "center",
      alignItems: "center",
    },
    slideImage: {
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT * 0.74,
    },
    arrowControl: {
      position: "absolute",
      top: SCREEN_HEIGHT * 0.46,
      zIndex: 15,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    viewerBottomBar: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: "rgba(0,0,0,0.75)",
    },
    viewerOriginalName: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    viewerMetaText: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 12,
    },
    categoryEditBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    // Center Card Modal (Category & Rename)
    modalOverlayCenter: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "center",
      padding: 24,
    },
    categoryModalCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
    },
    modalHeading: {
      fontSize: 17,
      fontWeight: "700",
      color: c.text,
      marginBottom: 4,
    },
    modalSubheading: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 16,
    },
    chipContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    presetChip: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: c.surface,
    },
    presetChipText: {
      fontSize: 13,
      color: c.text,
      fontWeight: "500",
    },
    customCategoryInput: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 8,
      padding: 12,
      fontSize: 14,
      color: c.text,
      marginBottom: 16,
    },
    modalActionsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 8,
    },
    saveBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    // Bottom Sheet Modal (Upload Source)
    bottomModalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    bottomModalContent: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 36,
    },
    modalIndicator: {
      width: 40,
      height: 4,
      backgroundColor: c.border,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 16,
      color: c.text,
    },
    uploadCategoryLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textSecondary,
      marginBottom: 8,
    },
    uploadChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 18,
    },
    uploadChip: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: c.surface,
    },
    uploadChipText: {
      fontSize: 12,
      color: c.text,
    },
    modalButtonPrimary: {
      backgroundColor: c.primary,
      padding: 15,
      borderRadius: 12,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 10,
    },
    modalButtonTextPrimary: {
      color: c.onGradient,
      fontWeight: "700",
      fontSize: 14,
    },
    modalButtonSecondary: {
      backgroundColor: c.card,
      padding: 15,
      borderRadius: 12,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalButtonTextSecondary: {
      color: c.text,
      fontWeight: "600",
      fontSize: 14,
    },
    modalButtonCancel: {
      backgroundColor: c.surface,
      padding: 15,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 4,
    },
    modalButtonTextCancel: {
      color: c.textSecondary,
      fontWeight: "600",
      fontSize: 14,
    },
  });
