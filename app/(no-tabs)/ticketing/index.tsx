import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { ArrowLeft, Device, InfoOutlineRounded, Ticket } from "@/components/icon";
import EmptyState from "@/components/ui/EmptyState";
import { getTicket, getDataStatus } from "@/services/ticket";
import { useAuthStore } from "@/stores/auth";
import { useTicketStore } from "@/stores/ticket";
import {
  IIncidentOwner,
  IMeta,
  ITicket,
  ITicketContract,
  ITicketDevice,
  ITicketEvid,
  ITicketSeverity,
  ITicketSite,
  ITicketStatus,
  ITicketUser,
} from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState , useMemo } from "react";
import {
  FlatList,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ================= TYPES ================= */

type TicketItemProps = {
  title: string;
  device: string;
  description: string;
  status: string;
  progress: string;
  date: string;
  onPress?: () => void;
};

type BadgeProps = {
  text: string;
  variant: BadgeVariant;
};

type BadgeVariant =
  | "open"
  | "high"
  | "medium"
  | "low"
  | "pending"
  | "in progress"
  | "complete"
  | "closed";

interface TicketData extends ITicket {
  user?: ITicketUser;
  site?: ITicketSite;
  evidence?: ITicketEvid[];
  contract?: ITicketContract;
  severity?: ITicketSeverity;
  device?: ITicketDevice;
  status?: ITicketStatus;
  incident_owners?: IIncidentOwner[];
}

// Warna badge dari token tema (soft bg + strong text) — dark mode aware.
const badgeVariant = (c: ThemeColors): Record<BadgeVariant, { bg: string; color: string }> => ({
  high: { bg: c.dangerSoft, color: c.danger },
  medium: { bg: c.warningSoft, color: c.warning },
  low: { bg: c.successSoft, color: c.success },
  pending: { bg: c.warningSoft, color: c.warning },
  'in progress': { bg: c.primarySoft, color: c.primary },
  open: { bg: c.primarySoft, color: c.primary },
  complete: { bg: c.successSoft, color: c.success },
  closed: { bg: c.successSoft, color: c.success },
});

const initialMeta: IMeta = {
  page: 1,
  per_page: 10,
  total: 0,
  total_pages: 10,
};

/* ================= SCREEN ================= */

const TicketingScreen = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [ticketDatas, setTicketDatas] = useState<TicketData[]>([]);
  const [ticketMeta, setTicketMeta] = useState<IMeta>(initialMeta);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isError, setIsError] = useState(false);
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const navigating = useRef(false);

  const { setTicket } = useTicketStore();

  // Filter state
  const [statusOptions, setStatusOptions] = useState<ITicketStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");

  const fetchTickets = async (page: number) => {
    const params: Record<string, any> = {
      page,
      per_page: ticketMeta.per_page,
      order_by_desc: ["created_at"],
      company_id_exact: [user?.company_id ?? ""],
      include: "user,site,contract,severity,status,device,incident_owners",
    };
    if (appliedSearch) params.name_ilike = appliedSearch;
    if (appliedStatus) params.status_id_exact = [appliedStatus];
    return getTicket(params as any);
  };

  const handleGetTicketList = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    setIsError(false);

    try {
      const response = await fetchTickets(ticketMeta.page);

      const tickets = response.data?.data || [];
      const meta = response.data?.meta;

      if (!tickets.length) {
        setHasMore(false);
        return;
      }

      // BE returns joined data via `include` param — no separate requests needed
      const ticketMap: TicketData[] = tickets.map((item: any) => ({
        ...item,
        user: item.user || undefined,
        site: item.site || undefined,
        evidence: item.evidence || [],
        contract: item.contract || undefined,
        severity: item.severity || undefined,
        device: item.device || undefined,
        status: item.status || undefined,
        incident_owners: item.incident_owners || [],
      }));

      setTicketDatas((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));

        const filtered = ticketMap.filter((item) => !existingIds.has(item.id));

        return [...prev, ...filtered];
      });

      setTicketMeta((prev) => {
        const nextPage = prev.page + 1;
        if (nextPage >= (meta?.total_pages || 0)) {
          setHasMore(false);
        }
        return {
          ...prev,
          total: meta?.total || 0,
          page: nextPage,
          total_pages: meta?.total_pages || 0,
        };
      });
    } catch (error) {
      console.error("Failed to fetch tickets:", error);
      if (ticketDatas.length === 0) {
        setIsError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setIsError(false);
    try {
      const response = await fetchTickets(1);
      const tickets = response.data?.data || [];
      const meta = response.data?.meta;

      // BE returns joined data via `include` param — no separate requests needed
      const ticketMap: TicketData[] = tickets.map((item: any) => ({
        ...item,
        user: item.user || undefined,
        site: item.site || undefined,
        evidence: item.evidence || [],
        contract: item.contract || undefined,
        severity: item.severity || undefined,
        device: item.device || undefined,
        status: item.status || undefined,
        incident_owners: item.incident_owners || [],
      }));

      setTicketDatas(ticketMap);
      setTicketMeta({
        ...initialMeta,
        total: meta?.total || 0,
        page: 2,
        total_pages: meta?.total_pages || 0,
      });

      setHasMore(1 < (meta?.total_pages || 0));
    } catch (error) {
      console.error("Failed to refresh tickets:", error);
      if (ticketDatas.length === 0) {
        setIsError(true);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch once on mount. Pull-to-refresh (handleRefresh) or
  // navigating back from detail can update the list without
  // resetting state, which avoids competing with the back gesture.
  useEffect(() => {
    handleGetTicketList();
  }, []);

  // Fetch status options on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await getDataStatus({ page: 1, per_page: 100 });
        setStatusOptions(res.data?.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  // Debounce filters: wait 500ms after user stops typing, then reset & refetch
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (appliedSearch !== searchQuery || appliedStatus !== statusFilter) {
        setTicketDatas([]);
        setTicketMeta(initialMeta);
        setHasMore(true);
        setAppliedSearch(searchQuery);
        setAppliedStatus(statusFilter);
      }
    }, 500);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, statusFilter]);

  // Refetch when applied filters change
  useEffect(() => {
    handleGetTicketList();
  }, [appliedSearch, appliedStatus]);

  // Refresh list when returning from edit that changed data
  useEffect(() => {
    const store = useTicketStore.getState();
    if (store.needsRefresh) {
      setTicketDatas([]);
      setTicketMeta(initialMeta);
      setHasMore(true);
      handleGetTicketList();
      store.setNeedsRefresh(false);
    }
  });

  const handleTicketDetail = (item: ITicket) => {
    if (navigating.current) return;
    navigating.current = true;
    setTicket(item);
    router.push({
      pathname: `/ticketing/[id]`,
      params: { id: item.id },
    });
    // Allow navigation again after a short debounce
    setTimeout(() => { navigating.current = false; }, 500);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(tabs)");
                }
              }}
              style={styles.backButton}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <ArrowLeft color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Ticketing</Text>

            <View style={{ width: 60 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Content */}
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push("/ticketing/create")}
        >
          <Text style={styles.createButtonText}>Create New Ticket</Text>
        </TouchableOpacity>

        {/* Filter Bar */}
        <View style={styles.filterContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari tiket..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.statusFilterWrapper}>
            <TouchableOpacity
              style={styles.statusFilterButton}
              onPress={() => setStatusDropdownOpen(!statusDropdownOpen)}
            >
              <Text style={statusFilter ? styles.statusFilterText : styles.statusFilterPlaceholder}>
                {statusFilter
                  ? statusOptions.find((s) => s.id === statusFilter)?.name || "Status"
                  : "Status"}
              </Text>
              <Ionicons name={statusDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            {statusDropdownOpen && (
              <View style={styles.statusDropdown}>
                <TouchableOpacity
                  style={[styles.statusOption, !statusFilter && styles.statusOptionActive]}
                  onPress={() => { setStatusFilter(""); setStatusDropdownOpen(false); }}
                >
                  <Text style={[styles.statusOptionText, !statusFilter && styles.statusOptionTextActive]}>Semua</Text>
                </TouchableOpacity>
                {statusOptions.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.statusOption, statusFilter === s.id && styles.statusOptionActive]}
                    onPress={() => { setStatusFilter(s.id); setStatusDropdownOpen(false); }}
                  >
                    <Text style={[styles.statusOptionText, statusFilter === s.id && styles.statusOptionTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Ticket</Text>
          <Text style={styles.ticketCount}>{ticketMeta?.total} Ticket</Text>
        </View>

        <FlatList
          data={ticketDatas}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TicketItem
              title={item.name}
              device={item.device?.name || ""}
              description={item.description}
              status={item.status?.name || ""}
              progress={item.severity?.name || ""}
              date={item.start_ticket}
              onPress={() => handleTicketDetail(item)}
              incidentOwners={item.incident_owners}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={ticketDatas.length === 0 ? { flexGrow: 1, justifyContent: "center", paddingBottom: 24 } : { paddingBottom: 24 }}
          onEndReached={handleGetTicketList}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListFooterComponent={loading ? <TicketSkeletonList /> : null}
          ListEmptyComponent={!loading ? (
            isError ? (
              <EmptyState
                title="Gagal Memuat Tiket"
                description="Koneksi internet bermasalah atau server tidak merespons. Periksa jaringan Anda dan coba lagi."
                actionLabel="Coba Lagi"
                onAction={handleRefresh}
                icon={<InfoOutlineRounded color={colors.danger} width={36} height={36} />}
              />
            ) : (
              <EmptyState
                title="Belum Ada Tiket"
                description="Tidak ada laporan tiket kendala atau perbaikan saat ini."
                actionLabel="+ Buat Tiket Baru"
                onAction={() => router.push("/ticketing/create")}
                icon={<Ticket color={colors.primary} width={36} height={36} />}
              />
            )
          ) : null}
        />
      </View>
    </View>
  );
};

export default TicketingScreen;

/* ================= COMPONENTS ================= */

const TicketItem = ({
  title,
  device,
  description,
  status,
  progress,
  date,
  onPress,
  incidentOwners,
}: TicketItemProps & { incidentOwners?: IIncidentOwner[] }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);  const variantStatus = status.toLowerCase() as BadgeVariant;
  const variantProgress = progress.toLowerCase() as BadgeVariant;

  return (
    <View style={styles.ticketCard}>
      <View style={styles.badgeRow}>
        <Badge text={progress} variant={variantProgress} />
        <Badge text={status} variant={variantStatus} />
      </View>

      <Text style={styles.ticketTitle}>{title}</Text>

      <View style={[styles.dateRow, { marginBottom: 6 }]}>
        <Device width={14} height={14} color={colors.textSecondary} />
        <Text style={styles.deviceText}>{device}</Text>
      </View>
      <Text style={styles.description}>{description}</Text>

      {incidentOwners && incidentOwners.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {incidentOwners.map((owner) => (
            <View key={owner.id} style={{ backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "500" }}>{owner.name}{owner.phone ? ` - ${owner.phone}` : ''}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.footerRow}>
        <View style={styles.dateRow}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.dateText}>{date}</Text>
        </View>

        <TouchableOpacity style={styles.detailButton} onPress={onPress}>
          <Ionicons name="eye-outline" size={14} color={colors.primary} />
          <Text style={styles.detailText}>View Detail</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const Badge = ({ text, variant }: BadgeProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const style = badgeVariant(colors)[variant] ?? {
    bg: colors.border,
    color: colors.textSecondary,
  };

  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.color }]}>{text}</Text>
    </View>
  );
};

export const TicketSkeleton = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);  return (
    <View style={styles.cardSkeleton}>
      <View style={styles.badgeRowSkeleton}>
        <View style={styles.badgeSkeleton} />
        <View style={styles.badgeSkeleton} />
      </View>

      <View style={styles.titleSkeleton} />
      <View style={styles.deviceSkeleton} />
      <View style={styles.descSkeleton} />

      <View style={styles.footerSkeleton}>
        <View style={styles.dateSkeleton} />
        <View style={styles.buttonSkeleton} />
      </View>
    </View>
  );
};

const TicketSkeletonList = () => {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TicketSkeleton key={i} />
      ))}
    </>
  );
};

/* ================= STYLES ================= */

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },

  headerGradient: {
    height: 140, // Tinggi gradient
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

  card: {
    flex: 1,
    backgroundColor: c.primarySoft,
    marginTop: -20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },

  createButton: {
    backgroundColor: c.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },

  createButtonText: {
    color: c.onGradient,
    fontWeight: "600",
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  sectionTitle: {
    fontWeight: "600",
  },

  ticketCount: {
    color: c.textSecondary,
  },

  ticketCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },

  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  badgeText: {
    fontSize: 12,
    fontWeight: "500",
  },

  ticketTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },

  deviceText: {
    fontSize: 12,
    color: c.textSecondary,
  },

  description: {
    fontSize: 12,
    color: c.textSecondary,
  },

  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  dateText: {
    fontSize: 12,
    color: c.textSecondary,
  },

  detailButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  detailText: {
    fontSize: 12,
    color: c.primary,
    fontWeight: "500",
  },

  // skeleton
  cardSkeleton: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },

  badgeRowSkeleton: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  badgeSkeleton: {
    width: 60,
    height: 18,
    borderRadius: 8,
    backgroundColor: c.border,
  },

  titleSkeleton: {
    height: 16,
    width: "70%",
    borderRadius: 8,
    backgroundColor: c.border,
    marginBottom: 8,
  },

  deviceSkeleton: {
    height: 12,
    width: "50%",
    borderRadius: 8,
    backgroundColor: c.border,
    marginBottom: 10,
  },

  descSkeleton: {
    height: 12,
    width: "100%",
    borderRadius: 8,
    backgroundColor: c.border,
    marginBottom: 12,
  },

  footerSkeleton: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  dateSkeleton: {
    width: 80,
    height: 12,
    borderRadius: 8,
    backgroundColor: c.border,
  },

  buttonSkeleton: {
    width: 70,
    height: 12,
    borderRadius: 8,
    backgroundColor: c.border,
  },

  // Filter
  filterContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: c.text,
    paddingVertical: 0,
  },
  statusFilterWrapper: {
    position: "relative",
    zIndex: 10,
  },
  statusFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    borderWidth: 1,
    borderColor: c.borderStrong,
    gap: 6,
    minWidth: 100,
    justifyContent: "space-between",
  },
  statusFilterPlaceholder: {
    fontSize: 14,
    color: c.textMuted,
  },
  statusFilterText: {
    fontSize: 14,
    color: c.text,
    fontWeight: "500",
  },
  statusDropdown: {
    position: "absolute",
    top: 48,
    right: 0,
    minWidth: 150,
    backgroundColor: c.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  statusOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  statusOptionActive: {
    backgroundColor: c.primarySoft,
  },
  statusOptionText: {
    fontSize: 14,
    color: c.textSecondary,
  },
  statusOptionTextActive: {
    color: c.primary,
    fontWeight: "600",
  },

  // Empty state
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "bold",
    color: c.text,
    textAlign: "center",
    marginBottom: 4,
  },
  emptyStateSubText: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: "center",
  },
});
