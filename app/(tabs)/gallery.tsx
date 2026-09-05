import { useThemeColors } from "@/hooks/use-theme-color";
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
import { Ionicons } from "@expo/vector-icons";
import { getFolders, createFolder, updateFolder, deleteFolder } from "@/services/gallery";
import { IGalleryFolder } from "@/types/gallery";
import EmptyState from "@/components/ui/EmptyState";
import { GalleryIcon, InfoOutlineRounded } from "@/components/icon";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_COLS = 2;
const GRID_GAP = 12;
const CARD_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;
const PAGE_SIZE = 20;

export default function GalleryScreen() {
  const colors = useThemeColors();
  const [folders, setFolders] = useState<IGalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Modal Create
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Modal Rename
  const [renameTarget, setRenameTarget] = useState<IGalleryFolder | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const fetchFolders = useCallback(async (targetPage = 1) => {
    try {
      const res = await getFolders(targetPage, PAGE_SIZE);
      const dataList = res?.data?.data || res?.data || [];
      const meta = res?.data?.meta;

      if (targetPage === 1) {
        setFolders(dataList);
      } else {
        setFolders((prev) => [...prev, ...dataList]);
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
        setDeniedMessage(err?.message || "Anda tidak memiliki izin untuk mengakses Galeri.");
      } else {
        console.error("Failed to fetch gallery folders:", err);
        if (targetPage === 1) {
          setIsError(true);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!ignore) {
        await fetchFolders(1);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [fetchFolders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFolders(1);
  }, [fetchFolders]);

  const loadMore = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchFolders(page + 1);
  }, [loading, refreshing, loadingMore, hasMore, page, fetchFolders]);

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
    } catch (err: any) {
      Alert.alert(err?.title || "Error", err?.message || "Gagal membuat folder");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenRename = (folder: IGalleryFolder) => {
    setRenameTarget(folder);
    setRenameName(folder.name);
  };

  const handleRename = async () => {
    const trimmed = renameName.trim();
    if (!renameTarget || !trimmed || renaming) return;
    setRenaming(true);
    try {
      await updateFolder(renameTarget.id, trimmed);
      setFolders((prev) =>
        prev.map((f) => (f.id === renameTarget.id ? { ...f, name: trimmed } : f))
      );
      setRenameTarget(null);
      setRenameName("");
    } catch (err: any) {
      Alert.alert(err?.title || "Error", err?.message || "Gagal mengubah nama folder");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = (folder: IGalleryFolder) => {
    Alert.alert("Hapus Folder", `Hapus "${folder.name}" beserta seluruh isinya?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteFolder(folder.id);
            setFolders((prev) => prev.filter((f) => f.id !== folder.id));
          } catch (err: any) {
            Alert.alert(err?.title || "Error", err?.message || "Gagal menghapus folder");
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
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
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
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: `${colors.primary}15`,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="folder" size={26} color={colors.primary} />
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity
            onPress={() => handleOpenRename(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: `${colors.primary}10`,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="pencil-outline" size={15} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: `${colors.danger}10`,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={{ fontSize: 15, fontWeight: "600", marginTop: 12 }} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
        {item.photo_count || 0} file
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Gallery</Text>
        {!isAccessDenied && (
          <TouchableOpacity
            onPress={() => setShowCreate(true)}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: colors.onGradient, fontWeight: "600", fontSize: 14 }}>+ Folder</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          key="gallery_folders_grid"
          data={folders}
          renderItem={renderFolder}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLS}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={folders.length === 0 ? { flexGrow: 1, justifyContent: "center" } : { paddingTop: GRID_GAP }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            isAccessDenied ? (
              <EmptyState
                title="Akses Ditolak"
                description={
                  deniedMessage ||
                  "Akun Anda tidak memiliki izin untuk mengakses fitur Galeri. Hubungi administrator untuk meminta hak akses."
                }
                icon={<GalleryIcon color={colors.danger} width={36} height={36} />}
              />
            ) : isError ? (
              <EmptyState
                title="Gagal Memuat Galeri"
                description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
                actionLabel="Coba Lagi"
                onAction={onRefresh}
                icon={<InfoOutlineRounded color={colors.danger} width={36} height={36} />}
              />
            ) : (
              <EmptyState
                title="Belum Ada Folder Galeri"
                description="Buat folder baru untuk menyimpan foto dokumentasi operasional dan file dokumen pendukung."
                actionLabel="+ Buat Folder Baru"
                onAction={() => setShowCreate(true)}
                icon={<GalleryIcon color={colors.primary} width={36} height={36} />}
              />
            )
          }
        />
      )}

      {/* Create Folder Modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>Folder Baru</Text>
            <TextInput
              placeholder="Nama folder"
              placeholderTextColor={colors.textFaint}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: colors.borderStrong,
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
                color: colors.text,
              }}
              onSubmitEditing={handleCreate}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 8 }}>
              <TouchableOpacity onPress={() => { setShowCreate(false); setNewName(""); }}>
                <Text style={{ padding: 8, color: colors.textSecondary }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
                style={{ padding: 8 }}
              >
                <Text style={{ color: newName.trim() ? colors.primary : colors.textFaint, fontWeight: "600" }}>
                  {creating ? "Membuat..." : "Buat"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Folder Modal */}
      <Modal visible={!!renameTarget} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>Ubah Nama Folder</Text>
            <TextInput
              placeholder="Nama folder baru"
              placeholderTextColor={colors.textFaint}
              value={renameName}
              onChangeText={setRenameName}
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: colors.borderStrong,
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
                color: colors.text,
              }}
              onSubmitEditing={handleRename}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 8 }}>
              <TouchableOpacity onPress={() => { setRenameTarget(null); setRenameName(""); }}>
                <Text style={{ padding: 8, color: colors.textSecondary }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRename}
                disabled={!renameName.trim() || renaming}
                style={{ padding: 8 }}
              >
                <Text style={{ color: renameName.trim() ? colors.primary : colors.textFaint, fontWeight: "600" }}>
                  {renaming ? "Menyimpan..." : "Simpan"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
