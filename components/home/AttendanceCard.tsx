import { DEFAULT_WORK_HOURS } from "@/constants";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function getHourMinute(datetime?: string | null): string {
  if (!datetime) return "--.--";

  const timePart = datetime.split(" ")[1];
  if (!timePart) return "--.--";

  const [hour, minute] = timePart.split(":");

  return `${hour}:${minute}`;
}

type StatusColor =
  | "#F7F9FC"
  | "#1A1C1E"
  | "#85e09c"
  | "#00B383"
  | "#ff9999"
  | "#B30000"
  | "#2F73FF";

export function mapTimeToColor(
  datetime?: string | null,
  type: "checkin" | "checkout" = "checkin"
): {
  text: StatusColor;
  container: StatusColor;
  button: StatusColor;
} {
  // 1. Jika kosong
  if (!datetime)
    return { text: "#1A1C1E", container: "#F7F9FC", button: "#2F73FF" };

  // 2. Convert ke format ISO aman
  const isoString = datetime.replace(" ", "T");

  const targetTime = new Date(isoString);
  if (isNaN(targetTime.getTime())) {
    return { text: "#1A1C1E", container: "#F7F9FC", button: "#2F73FF" };
  }

  const scheduledTime = new Date(targetTime);
  scheduledTime.setHours(type === "checkin" ? DEFAULT_WORK_HOURS.checkin : DEFAULT_WORK_HOURS.checkout);
  scheduledTime.setMinutes(0);
  scheduledTime.setSeconds(0);
  scheduledTime.setMilliseconds(0);

  const diffMs = targetTime.getTime() - scheduledTime.getTime();
  const diffMinutes = Math.floor(diffMs / 60000); // Minutes

  const now = new Date();

  // 3. Bandingkan waktu
  if (type === "checkin") {
    // Check In: Late (diff > 0) -> Bad (Red-ish)
    // On Time (diff <= 0) -> Good (Green-ish)
    const isLate = diffMinutes > 0;
    if (isLate) {
      return { text: "#F7F9FC", container: "#ff9999", button: "#B30000" };
    } else {
      return { text: "#F7F9FC", container: "#85e09c", button: "#00B383" };
    }
  } else {
    // Check Out
    // Early (diff < 0) -> Bad (Red-ish)
    // On Time / Overtime (diff >= 0) -> Good (Green-ish)
    const isEarly = diffMinutes < 0;
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
  onPress: () => void;
  badgeText: string;
}

export default function AttendanceCard({
  type,
  time,
  subtitle,
  onPress,
  badgeText,
}: AttendanceCardProps) {
  const colors = mapTimeToColor(time, type);
  const formattedTime = getHourMinute(time);

  // Default styles based on type (fallback if time is null/empty)
  const defaultBg = "#F7F9FC";
  const backgroundColor = time ? colors.container : defaultBg;
  const textColor = time ? colors.text : "#1A1C1E";
  const buttonColor = time ? colors.button : "#2F73FF";

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
