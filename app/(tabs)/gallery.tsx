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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { getFolders, createFolder, deleteFolder } from "@/services/gallery";
import { IIGalleryFolder } from "@/types/gallery";

export default function GalleryScreen() {
  const [folders, setFolders] = useState<IIGalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await getFolders(1, 100);
      setFolders(res?.data || []);
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
      const newFolder = { ...res, photo_count: 0 };
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
        router.push({ pathname: "/gallery-folder", params: { id: item.id, name: item.name } })
      }
      onLongPress={() => handleDelete(item)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
        backgroundColor: "#fff",
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          backgroundColor: "#1e90ff20",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 20 }}>📁</Text>
      </View>
      <View style={{ marginLeft: 12, flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "600" }}>{item.name}</Text>
        <Text style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
          {item.photo_count || 0} foto
        </Text>
      </View>
      <Text style={{ color: "#ccc", fontSize: 18 }}>{">"}</Text>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 80 }}>
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
