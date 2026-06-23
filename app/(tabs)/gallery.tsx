import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getFolders, createFolder, deleteFolder } from "@/services/gallery";
import { IGalleryFolder } from "@/types/gallery";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_COLS = 2;
const GRID_GAP = 12;
const CARD_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;

export default function GalleryScreen() {
  const [folders, setFolders] = useState<IGalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await getFolders(1, 100);
      setFolders(res?.data?.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFolders();
  }, [fetchFolders]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const res = await createFolder(trimmed);
      const newFolder = { ...(res?.data ?? res), photo_count: 0 };
      setFolders((prev) => [newFolder, ...prev]);
      setNewName("");
      setShowCreate(false);
    } catch {
      Alert.alert("Error", "Gagal membuat folder");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (folder: IGalleryFolder) => {
    Alert.alert("Hapus Folder", `Hapus "${folder.name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteFolder(folder.id);
            setFolders((prev) => prev.filter((f) => f.id !== folder.id));
          } catch {
            Alert.alert("Error", "Gagal menghapus folder");
          }
        },
      },
    ]);
  };

  const renderFolder = ({ item }: { item: IGalleryFolder }) => (
    <TouchableOpacity
      onPress={() =>
        router.push({ pathname: "/(no-tabs)/gallery-folder" as any, params: { id: item.id, name: item.name } })
      }
      activeOpacity={0.7}
      style={{
        width: CARD_SIZE,
        marginLeft: GRID_GAP,
        marginBottom: GRID_GAP,
        backgroundColor: "#fff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#f0f0f0",
        padding: 14,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            backgroundColor: "#1e90ff15",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 26 }}>📁</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: "#ff3b3010",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 15 }}>🗑️</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 15, fontWeight: "600", marginTop: 12 }} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
        {item.photo_count || 0} foto
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: "#f0f0f0",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Gallery</Text>
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          style={{
            backgroundColor: "#1e90ff",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>+ Folder</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1e90ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={folders}
          renderItem={renderFolder}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLS}
          contentContainerStyle={{ paddingTop: GRID_GAP, paddingRight: GRID_GAP, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 80, width: SCREEN_WIDTH - GRID_GAP }}>
              <Text style={{ color: "#999", fontSize: 14 }}>Belum ada folder</Text>
            </View>
          }
        />
      )}

      {/* Create Folder Modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>Folder Baru</Text>
            <TextInput
              placeholder="Nama folder"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
              }}
              onSubmitEditing={handleCreate}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 8 }}>
              <TouchableOpacity onPress={() => { setShowCreate(false); setNewName(""); }}>
                <Text style={{ padding: 8, color: "#666" }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
                style={{ padding: 8 }}
              >
                <Text style={{ color: newName.trim() ? "#1e90ff" : "#ccc", fontWeight: "600" }}>
                  {creating ? "Membuat..." : "Buat"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
