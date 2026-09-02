import { DEFAULT_WORK_HOURS } from "@/constants";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { Ishift } from "@/types";
import { parseWIBDate } from "@/utils/utils";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function getHourMinute(datetime?: string | null): string {
  if (!datetime) return "--.--";

  const timePart = datetime.split(" ")[1];
  if (!timePart) return "--.--";

  const [hour, minute] = timePart.split(":");

  return `${hour}:${minute}`;
}

// Warna state (late/early) sengaja literal — kontras di light & dark.
type StatusColor = "#85e09c" | "#00B383" | "#ff9999" | "#B30000";

export function mapTimeToColor(
  datetime?: string | null,
  type: "checkin" | "checkout" = "checkin",
  shift?: Ishift | null,
  theme?: ThemeColors
): {
  text: string;
  container: string;
  button: string;
} {
  // Netral mengikuti tema; state colors (late/early) tetap literal.
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

  const scheduledTime = new Date(targetTime);
  scheduledTime.setHours(sh, sm ?? 0, 0, 0);
  // Overnight shift: checkout lewat tengah malam
  if (type === "checkout" && shift?.is_overnight) {
    const eh = sh;
    const checkinSh = Number(shift.start_time.split(":")[0]);
    if (eh < checkinSh) scheduledTime.setDate(scheduledTime.getDate() + 1);
  }

  const graceMs = (type === "checkin" ? shift?.grace_late : shift?.grace_early) ? (type === "checkin" ? shift!.grace_late : shift!.grace_early) * 60 * 1000 : 0;
  const diffMs = targetTime.getTime() - scheduledTime.getTime();
  const diffMinutes = Math.floor(diffMs / 60000); // Minutes

  // 3. Bandingkan waktu
  if (type === "checkin") {
    // Check In: Late (diff > grace) -> Bad (Red-ish), else Good (Green-ish)
    const isLate = diffMs > graceMs;
    if (isLate) {
      return { text: "#F7F9FC", container: "#ff9999", button: "#B30000" };
    } else {
      return { text: "#F7F9FC", container: "#85e09c", button: "#00B383" };
    }
  } else {
    // Check Out: Early (diff < -grace) -> Bad, else Good
    const isEarly = diffMs < -graceMs;
    if (isEarly) {
      return { text: "#F7F9FC", container: "#ff9999", button: "#B30000" };
    } else {
      return { text: "#F7F9FC", container: "#85e09c", button: "#00B383" };
    }
  }
}

interface AttendanceCardProps {
  type: "checkin" | "checkout";
  time?: string | null;
  subtitle: string;
  subtitle2?: string;
  shift?: Ishift | null;
  onPress: () => void;
  badgeText: string;
}

export default function AttendanceCard({
  type,
  time,
  subtitle,
  shift,
  onPress,
  badgeText,
}: AttendanceCardProps) {
  const theme = useThemeColors();
  const colors = mapTimeToColor(time, type, shift, theme);
  const formattedTime = getHourMinute(time);

  // Default styles based on type (fallback if time is null/empty)
  const backgroundColor = time ? colors.container : theme.surface;
  const textColor = time ? colors.text : theme.text;
  const buttonColor = time ? colors.button : theme.primary;

  return (
    <View style={[styles.card, { backgroundColor }]}>
      <Text style={[styles.label, { color: textColor }]}>
        {type === "checkin" ? "Check in" : "Check out"}
      </Text>
      <Text style={[styles.time, { color: textColor }]}>{formattedTime}</Text>
      <Text style={[styles.subtitle, { color: textColor }]}>{subtitle}</Text>

      <TouchableOpacity
        style={[styles.badge, { backgroundColor: buttonColor }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[styles.badgeText, { color: "#F7F9FC" }]}>
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
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "bold",
  },
});
