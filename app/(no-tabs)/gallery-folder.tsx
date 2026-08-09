import React, { useEffect, useState, useCallback } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ImageViewerModal from "@/components/ImageViewerModal";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { getPhotos, uploadPhotos, deletePhoto, generateShareToken } from "@/services/gallery";
import { IGalleryPhoto } from "@/types/gallery";

/** File siap-upload yang dinormalisasi dari image picker ataupun document picker. */
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

/** Gambar vs dokumen ditentukan dari mime_type yang disimpan server. */
function isImageItem(item: IGalleryPhoto): boolean {
  return !!item.mime_type?.toLowerCase().startsWith("image/");
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_COLS = 3;
const GAP = 2;
const CELL_SIZE = (SCREEN_WIDTH - GAP * (GRID_COLS + 1)) / GRID_COLS;

export default function GalleryFolderScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [photos, setPhotos] = useState<IGalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);

  const fetchPhotos = useCallback(async () => {
    if (!id) return;
    try {
      const res = await getPhotos(id, 1, 1000);
      setPhotos(res?.data?.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPhotos();
  }, [fetchPhotos]);

  const handlePickDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    await uploadAssets(result.assets.map(docToUploadFile));
  };

  const showUploadOptions = () => {
    setShowSourceModal(true);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Izin Diperlukan", "Akses kamera diperlukan untuk mengambil foto");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.length) return;
    await uploadAssets(result.assets.map(imageToUploadFile));
  };

  const handlePickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Izin Diperlukan", "Akses galeri diperlukan untuk upload foto");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;
    await uploadAssets(result.assets.map(imageToUploadFile));
  };

  const uploadAssets = async (files: UploadFile[]) => {
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
      const res = await uploadPhotos(id!, formData);
      const newPhotos = res?.data || [];
      setPhotos((prev) => [...newPhotos, ...prev]);
    } catch {
      Alert.alert("Error", "Gagal upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (photo: IGalleryPhoto) => {
    Alert.alert("Hapus Foto", `Hapus "${photo.original_name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePhoto(photo.id);
            setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
          } catch {
            Alert.alert("Error", "Gagal menghapus foto");
          }
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (!id) return;
    try {
      const res = await generateShareToken(id);
      const token = res?.data?.share_token;
      if (token) {
        await Share.share({
          message: `Lihat galeri "${name}": https://ticketing.vps.prakhya.id/gallery/share/${token}`,
        });
      }
    } catch {
      Alert.alert("Error", "Gagal generate link share");
    }
  };

  const renderPhoto = ({ item }: { item: IGalleryPhoto }) => (
    <TouchableOpacity
      onPress={() =>
        isImageItem(item) ? setPreviewImage(item.url) : Linking.openURL(item.url)
      }
      onLongPress={() => handleDelete(item)}
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        margin: GAP,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: "#f0f0f0",
      }}
    >
      {isImageItem(item) ? (
        <Image source={{ uri: item.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 6 }}>
          <Ionicons name="document-text-outline" size={34} color="#1e90ff" />
          <Text
            numberOfLines={2}
            style={{ fontSize: 9, color: "#555", textAlign: "center", marginTop: 4 }}
          >
            {item.original_name}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: "#f0f0f0",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 18, color: "#1e90ff" }}>{"< Back"}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", flex: 1 }} numberOfLines={1}>
          {name}
        </Text>
        <TouchableOpacity onPress={handleShare} style={{ marginRight: 12 }}>
          <Text style={{ color: "#1e90ff", fontSize: 14 }}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={showUploadOptions}
          disabled={uploading}
          style={{
            backgroundColor: "#1e90ff",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
            {uploading ? "Upload..." : "+ Tambah"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1e90ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLS}
          contentContainerStyle={{ padding: GAP }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 80 }}>
              <Text style={{ color: "#999", fontSize: 14 }}>Belum ada file</Text>
            </View>
          }
        />
      )}
      <ImageViewerModal visible={!!previewImage} uri={previewImage} onClose={() => setPreviewImage(null)} />

      {/* Modal pilih sumber upload — konsisten dengan checkin/checkout/ticketing */}
      <Modal
        visible={showSourceModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSourceModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSourceModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>Pilih sumber Upload</Text>

            <TouchableOpacity
              style={[styles.modalButtonPrimary, { opacity: uploading ? 0.7 : 1 }]}
              onPress={() => { setShowSourceModal(false); handleTakePhoto(); }}
              disabled={uploading}
            >
              <Text style={styles.modalButtonTextPrimary}>Ambil Dari Kamera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButtonSecondary, { opacity: uploading ? 0.7 : 1 }]}
              onPress={() => { setShowSourceModal(false); handlePickImages(); }}
              disabled={uploading}
            >
              <Text style={styles.modalButtonTextSecondary}>Ambil Dari Galeri</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButtonSecondary, { opacity: uploading ? 0.7 : 1 }]}
              onPress={() => { setShowSourceModal(false); handlePickDocuments(); }}
              disabled={uploading}
            >
              <Text style={styles.modalButtonTextSecondary}>Dokumen (PDF/DOCX/XLSX)</Text>
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

const styles = StyleSheet.create({
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
});
