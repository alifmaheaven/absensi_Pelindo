import { ArrowLeft, Device } from "@/components/icon";
import {
  getDataContract,
  getDataDevice,
  getDataEvid,
  getDataSeverity,
  getDataSite,
  getDataStatus,
  getDataUser,
  getTicket,
} from "@/services/ticket";
import { useAuthStore } from "@/stores/auth";
import { useTicketStore } from "@/stores/ticket";
import {
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
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
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
}

const BADGE_VARIANT: Record<BadgeVariant, { bg: string; color: string }> = {
  high: {
    bg: "#FFE9E9",
    color: "#E53935",
  },
  medium: {
    bg: "#FFF4E5",
    color: "#FB8C00",
  },
  low: {
    bg: "#E8F5E9",
    color: "#43A047",
  },
  pending: {
    bg: "#FFF4E5",
    color: "#FB8C00",
  },
  "in progress": {
    bg: "#E9F0FF",
    color: "#4F7CFE",
  },
  open: {
    bg: "#E9F0FF",
    color: "#4F7CFE",
  },
  complete: {
    bg: "#E8F5E9",
    color: "#43A047",
  },
  closed: {
    bg: "#E8F5E9",
    color: "#43A047",
  },
};

const initialMeta: IMeta = {
  page: 1,
  per_page: 10,
  total: 0,
  total_pages: 10,
};

/* ================= SCREEN ================= */

const TicketingScreen = () => {
  const router = useRouter();
  const [ticketDatas, setTicketDatas] = useState<TicketData[]>([]);
  const [ticketMeta, setTicketMeta] = useState<IMeta>(initialMeta);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { setTicket } = useTicketStore();

  const fetchTickets = async (page: number) => {
    return getTicket({
      page,
      per_page: ticketMeta.per_page,
      order_by_desc: ["created_at"],
      company_id_exact: [user?.company_id ?? ""],
    });
  };

  const handleGetTicketList = async () => {
    if (loading || !hasMore) return;

    setLoading(true);

    try {
      const response = await fetchTickets(ticketMeta.page);

      const tickets = response.data?.data || [];
      const meta = response.data?.meta;

      if (!tickets.length) {
        setHasMore(false);
        return;
      }

      /* ===== fetch relational data ===== */
      const [user, site, evid, contract, severity, device, status] =
        await Promise.all([
          getDataUser({
            page: 1,
            per_page: 100,
            user_id_exact: tickets.map((d) => d.user_id),
          }),
          getDataSite({
            page: 1,
            per_page: 100,
            site_id_exact: tickets.map((d) => d.site_id),
          }),
          getDataEvid({
            page: 1,
            per_page: 100,
            evidence_group_id_exact: tickets.map((d) => d.evidence_group_id),
          }),
          getDataContract({
            page: 1,
            per_page: 100,
            contract_id_exact: tickets.map((d) => d.contract_id),
          }),
          getDataSeverity({
            page: 1,
            per_page: 100,
            severity_id_exact: tickets.map((d) => d.severity_id),
          }),
          getDataDevice({
            page: 1,
            per_page: 100,
            device_id_exact: tickets.map((d) => d.device_id),
          }),
          getDataStatus({
            page: 1,
            per_page: 100,
            status_id_exact: tickets.map((d) => d.status_id),
          }),
        ]);

      const ticketMap: TicketData[] = tickets.map((item) => ({
        ...item,
        user: user.data?.data.find((u) => u.id === item.user_id),
        site: site.data?.data.find((s) => s.id === item.site_id),
        evidence: evid.data?.data.filter(
          (e) => e.evidence_group_id === item.evidence_group_id
        ),
        contract: contract.data?.data.find((c) => c.id === item.contract_id),
        severity: severity.data?.data.find((s) => s.id === item.severity_id),
        device: device.data?.data.find((d) => d.id === item.device_id),
        status: status.data?.data.find((s) => s.id === item.status_id),
      }));

      setTicketDatas((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));

        const filtered = ticketMap.filter((item) => !existingIds.has(item.id));

        return [...prev, ...filtered];
      });

      setTicketMeta((prev) => ({
        ...prev,
        total: meta?.total || 0,
        page: prev.page + 1,
        total_pages: meta?.total_pages || 0,
      }));

      if ((ticketMeta.page + 1) >= (meta?.total_pages || 0)) {
        setHasMore(false);
      }
    } catch (error) {
      console.debug(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setTicketDatas([]);
      setTicketMeta(initialMeta);
      setHasMore(true);

      const response = await fetchTickets(1);
      const tickets = response.data?.data || [];
      const meta = response.data?.meta;

      if (!tickets.length) {
        setHasMore(false);
        setRefreshing(false);
        return;
      }

      /* ===== fetch relational data ===== */
      const [user, site, evid, contract, severity, device, status] =
        await Promise.all([
          getDataUser({
            page: 1,
            per_page: 100,
            user_id_exact: tickets.map((d) => d.user_id),
          }),
          getDataSite({
            page: 1,
            per_page: 100,
            site_id_exact: tickets.map((d) => d.site_id),
          }),
          getDataEvid({
            page: 1,
            per_page: 100,
            evidence_group_id_exact: tickets.map((d) => d.evidence_group_id),
          }),
          getDataContract({
            page: 1,
            per_page: 100,
            contract_id_exact: tickets.map((d) => d.contract_id),
          }),
          getDataSeverity({
            page: 1,
            per_page: 100,
            severity_id_exact: tickets.map((d) => d.severity_id),
          }),
          getDataDevice({
            page: 1,
            per_page: 100,
            device_id_exact: tickets.map((d) => d.device_id),
          }),
          getDataStatus({
            page: 1,
            per_page: 100,
            status_id_exact: tickets.map((d) => d.status_id),
          }),
        ]);

      const ticketMap: TicketData[] = tickets.map((item) => ({
        ...item,
        user: user.data?.data.find((u) => u.id === item.user_id),
        site: site.data?.data.find((s) => s.id === item.site_id),
        evidence: evid.data?.data.filter(
          (e) => e.evidence_group_id === item.evidence_group_id
        ),
        contract: contract.data?.data.find((c) => c.id === item.contract_id),
        severity: severity.data?.data.find((s) => s.id === item.severity_id),
        device: device.data?.data.find((d) => d.id === item.device_id),
        status: status.data?.data.find((s) => s.id === item.status_id),
      }));

      setTicketDatas(ticketMap);
      setTicketMeta((prev) => ({
        ...prev,
        total: meta?.total || 0,
        page: 2,
        total_pages: meta?.total_pages || 0,
      }));

      if (1 >= (meta?.total_pages || 0)) {
        setHasMore(false);
      }
    } catch (error) {
      console.debug(error);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setTicketDatas([]);
      setTicketMeta(initialMeta);
      setHasMore(true);
      handleGetTicketList();
    }, [])
  );

  const handleTicketDetail = (item: ITicket) => {
    setTicket(item);
    router.push({
      pathname: `/ticketing/[id]`,
      params: { id: item.id },
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#1e90ff", "#8fd5f5ff"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <ArrowLeft color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Ticketing</Text>

            {/* Spacer kanan agar title tetap center */}
            <View style={{ width: 40 }} />
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
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          onEndReached={handleGetTicketList}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListFooterComponent={loading ? <TicketSkeletonList /> : null}
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
}: TicketItemProps) => {
  const variantStatus = status.toLowerCase() as BadgeVariant;
  const variantProgress = progress.toLowerCase() as BadgeVariant;

  return (
    <View style={styles.ticketCard}>
      <View style={styles.badgeRow}>
        <Badge text={progress} variant={variantProgress} />
        <Badge text={status} variant={variantStatus} />
      </View>

      <Text style={styles.ticketTitle}>{title}</Text>

      <View style={[styles.dateRow, { marginBottom: 6 }]}>
        <Device width={14} height={14} color="#777" />
        <Text style={styles.deviceText}>{device}</Text>
      </View>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.footerRow}>
        <View style={styles.dateRow}>
          <Ionicons name="time-outline" size={14} color="#777" />
          <Text style={styles.dateText}>{date}</Text>
        </View>

        <TouchableOpacity style={styles.detailButton} onPress={onPress}>
          <Ionicons name="eye-outline" size={14} color="#4F7CFE" />
          <Text style={styles.detailText}>View Detail</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const Badge = ({ text, variant }: BadgeProps) => {
  const style = BADGE_VARIANT[variant] ?? {
    bg: "#F0F0F0",
    color: "#777",
  };

  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.color }]}>{text}</Text>
    </View>
  );
};

export const TicketSkeleton = () => {
  return (
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

const styles = StyleSheet.create({
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
    position: "absolute",
    alignSelf: "center",
    width: "100%",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },

  backButton: {
    padding: 8,
    borderRadius: 20,
  },

  card: {
    flex: 1,
    backgroundColor: "#F8FBFF",
    marginTop: -20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },

  createButton: {
    backgroundColor: "#4F7CFE",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },

  createButtonText: {
    color: "#FFF",
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
    color: "#777",
  },

  ticketCard: {
    backgroundColor: "#FFF",
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
    color: "#555",
  },

  description: {
    fontSize: 12,
    color: "#777",
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
    color: "#777",
  },

  detailButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  detailText: {
    fontSize: 12,
    color: "#4F7CFE",
    fontWeight: "500",
  },

  // skeleton
  cardSkeleton: {
    backgroundColor: "#FFF",
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
    backgroundColor: "#E5E7EB",
  },

  titleSkeleton: {
    height: 16,
    width: "70%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    marginBottom: 8,
  },

  deviceSkeleton: {
    height: 12,
    width: "50%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },

  descSkeleton: {
    height: 12,
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
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
    backgroundColor: "#E5E7EB",
  },

  buttonSkeleton: {
    width: 70,
    height: 12,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
});
