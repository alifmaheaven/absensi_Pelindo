import { DEFAULT_WORK_HOURS } from "@/constants";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { Ishift } from "@/types";
import { buildWIBScheduledTime, getWIBHour, parseWIBDate } from "@/utils/utils";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function getHourMinute(datetime?: string | null): string {
  if (!datetime) return "--.--";

  const timePart = datetime.split(" ")[1];
  if (!timePart) return "--.--";

  const [hour, minute] = timePart.split(":");

  return `${hour}:${minute}`;
}

// Warna status memenuhi WCAG AA/AAA di light & dark.
export function mapTimeToColor(
  datetime?: string | null,
  type: "checkin" | "checkout" = "checkin",
  shift?: Ishift | null,
  theme?: ThemeColors,
  shiftDate?: string | null
): {
  text: string;
  container: string;
  button: string;
} {
  // Netral mengikuti tema
  const neutral = theme
    ? { text: theme.text, container: theme.surface, button: theme.primary }
    : { text: "#1A1C1E", container: "#F7F9FC", button: "#2F73FF" };

  // 1. Jika kosong
  if (!datetime)
    return neutral;

  // 2. Parse WIB (checkin/checkout = WIB wall-clock), bukan device-local
  const targetTime = parseWIBDate(datetime);
  if (!targetTime) {
    return neutral;
  }

  // Scheduled hour: pakai shift real bila ada (sinkron dengan getWorkStatus),
  // fallback DEFAULT_WORK_HOURS.
  const scheduledHourStr =
    type === "checkin"
      ? shift?.start_time ?? `0${DEFAULT_WORK_HOURS.checkin}:00`
      : shift?.end_time ?? `0${DEFAULT_WORK_HOURS.checkout}:00`;
  const [sh, sm] = scheduledHourStr.split(":").map(Number);

  // S-MO-2: Tanggal jadwal diturunkan dari tanggal shift (baseDate), bukan tanggal checkout aktual.
  // Mencegah penambahan ganda +1 hari pada checkout pagi hari H+1.
  let baseDate = new Date(targetTime);
  if (shiftDate) {
    const parsedShiftDate = parseWIBDate(shiftDate.includes(" ") ? shiftDate : `${shiftDate} 00:00:00`);
    if (parsedShiftDate) {
      baseDate = parsedShiftDate;
    }
  } else if (type === "checkout" && shift?.is_overnight) {
    const checkinSh = Number(shift.start_time.split(":")[0]);
    if (getWIBHour(targetTime) < checkinSh) {
      baseDate.setDate(baseDate.getDate() - 1);
    }
  }

  let scheduledTime = buildWIBScheduledTime(baseDate, sh, sm ?? 0);
  // Overnight shift: checkout lewat tengah malam (H+1 dari tanggal mulai shift)
  if (type === "checkout" && shift?.is_overnight) {
    const eh = sh;
    const checkinSh = Number(shift.start_time.split(":")[0]);
    if (eh < checkinSh) {
      scheduledTime = new Date(scheduledTime.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const graceMs = (type === "checkin" ? shift?.grace_late : shift?.grace_early) ? (type === "checkin" ? shift!.grace_late : shift!.grace_early) * 60 * 1000 : 0;
  const diffMs = targetTime.getTime() - scheduledTime.getTime();

  // 3. Bandingkan waktu
  // Late / Early (Peringatan/Bahaya) -> dangerSoft, token theme.danger
  // On-time (Baik) -> successSoft, token theme.success
  const isLate = type === "checkin" ? diffMs > graceMs : diffMs < -graceMs;
  if (isLate) {
    return {
      text: theme ? theme.danger : "#991B1B",
      container: theme ? theme.dangerSoft : "#FFE9E9",
      button: theme ? theme.danger : "#DC2626",
    };
  } else {
    return {
      text: theme ? theme.success : "#166534",
      container: theme ? theme.successSoft : "#E8F5E9",
      button: theme ? theme.success : "#0D7A53",
    };
  }
}

interface AttendanceCardProps {
  type: "checkin" | "checkout";
  time?: string | null;
  subtitle: string;
  subtitle2?: string;
  shift?: Ishift | null;
  shiftDate?: string | null;
  onPress: () => void;
  badgeText: string;
  isOverdue?: boolean;
}

export default function AttendanceCard({
  type,
  time,
  subtitle,
  shift,
  shiftDate,
  onPress,
  badgeText,
  isOverdue,
}: AttendanceCardProps) {
  const theme = useThemeColors();
  const colors = mapTimeToColor(time, type, shift, theme, shiftDate);
  const formattedTime = getHourMinute(time);

  // Default styles based on type (fallback if time is null/empty)
  // Khusus overdue pada checkout belum selesai: tampilkan styling alert
  const isOverdueAlert = isOverdue && type === "checkout" && !time;
  const backgroundColor = time ? colors.container : isOverdueAlert ? theme.dangerSoft : theme.surface;
  const textColor = time ? colors.text : isOverdueAlert ? theme.danger : theme.text;
  const buttonColor = time ? colors.button : isOverdueAlert ? theme.danger : theme.primary;

  const cardTitle = type === "checkin" ? "Check in" : "Check out";

  return (
    <View
      style={[styles.card, { backgroundColor }]}
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={`${cardTitle} jam ${formattedTime}, ${subtitle}`}
    >
      <Text style={[styles.label, { color: textColor }]}>
        {cardTitle}
      </Text>
      <Text style={[styles.time, { color: textColor }]}>{formattedTime}</Text>
      <Text style={[styles.subtitle, { color: textColor }]}>{subtitle}</Text>

      <TouchableOpacity
        style={[styles.badge, { backgroundColor: buttonColor }]}
        onPress={onPress}
        activeOpacity={0.8}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`${badgeText}, tombol untuk aksi ${cardTitle}`}
      >
        <Text style={[styles.badgeText, { color: "#FFFFFF" }]}>
          {badgeText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    justifyContent: "space-between",
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
    opacity: 0.9,
    textTransform: "capitalize",
  },
  time: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    opacity: 0.8,
    marginBottom: 2,
  },
  badge: {
    borderRadius: 8,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "bold",
  },
});
