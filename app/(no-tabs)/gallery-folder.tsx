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
  ActionSheetIOS,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getPhotos, uploadPhotos, deletePhoto, generateShareToken } from "@/services/gallery";
import { IGalleryPhoto } from "@/types/gallery";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_COLS = 3;
const GAP = 2;
const CELL_SIZE = (SCREEN_WIDTH - GAP * (GRID_COLS + 1)) / GRID_COLS;

export default function GalleryFolderScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [photos, setPhotos] = useState<IGalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchPhotos = useCallback(async () => {
    if (!id) return;
    try {
      const res = await getPhotos(id, 1, 1000);
      setPhotos(res?.data || []);
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

  const showUploadOptions = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Batal", "Kamera", "Galeri"], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) handleTakePhoto();
          else if (idx === 2) handlePickImages();
        },
      );
    } else {
      Alert.alert("Upload Foto", "Pilih sumber:", [
        { text: "Kamera", onPress: handleTakePhoto },
        { text: "Galeri", onPress: handlePickImages },
        { text: "Batal", style: "cancel" },
      ]);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Izin Diperlukan", "Akses kamera diperlukan untuk mengambil foto");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.length) return;
    await uploadAssets(result.assets);
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
    await uploadAssets(result.assets);
  };

  const uploadAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setUploading(true);
    try {
      const formData = new FormData();
      for (const asset of assets) {
        const filename = asset.uri.split("/").pop() || "photo.jpg";
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : "image/jpeg";
        formData.append("files", {
          uri: asset.uri,
          name: filename,
          type,
        } as any);
      }
      const res = await uploadPhotos(id!, formData);
      const newPhotos = res?.data || [];
      setPhotos((prev) => [...newPhotos, ...prev]);
    } catch {
      Alert.alert("Error", "Gagal upload foto");
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
      <Image source={{ uri: item.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
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
            {uploading ? "Upload..." : "+ Foto"}
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
              <Text style={{ color: "#999", fontSize: 14 }}>Belum ada foto</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
