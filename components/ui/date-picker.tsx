import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useState , useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { parseDateParts, todayWIB } from "@/utils/utils";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

interface Props {
  visible: boolean;
  value: string; // "YYYY-MM-DD"
  onConfirm: (date: string) => void;
  onClose: () => void;
  disabledDates?: string[]; // "YYYY-MM-DD" — days that should be disabled (e.g. already taken leave dates)
  disabledDateMessage?: string; // shown as tooltip/inline on why it's disabled
}

export default function DatePicker({ visible, value, onConfirm, onClose, disabledDates = [] }: Props) {

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // ponytail: Hindari Date instan absolut untuk komponen kalender.
  // Ekstraksi komponen kalender (YYYY-MM-DD) secara langsung untuk mencegah
  // pergeseran tanggal pada perangkat non-WIB (BUG-266-04).
  const initial = parseDateParts(value || todayWIB());
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(initial.day);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  const disabledSet = new Set(disabledDates);

  const isDayDisabled = (day: number): boolean => {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return disabledSet.has(`${year}-${mm}-${dd}`);
  };

  const goToPrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleConfirm = () => {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(selectedDay).padStart(2, "0");
    onConfirm(`${year}-${mm}-${dd}`);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.content} activeOpacity={1}>
          <View style={styles.header}>
            <Text style={styles.title}>Pilih Tanggal</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Month/Year navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.navButton}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTHS[month]} {year}
            </Text>
            <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={styles.dayHeaderRow}>
            {DAYS.map((d) => (
              <Text key={d} style={styles.dayHeader}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.grid}>
            {cells.map((day, i) => {
              const disabled = day ? isDayDisabled(day) : false;
              return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.dayCell,
                  day === selectedDay && styles.dayCellSelected,
                  disabled && styles.dayCellDisabled,
                ]}
                onPress={() => day && !disabled && setSelectedDay(day)}
                disabled={!day || disabled}
              >
                {day ? (
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={[
                        styles.dayText,
                        day === selectedDay && styles.dayTextSelected,
                        disabled && styles.dayTextDisabled,
                      ]}
                    >
                      {day}
                    </Text>
                    {disabled && <View style={styles.disabledDot} />}
                  </View>
                ) : null}
              </TouchableOpacity>
            )})}
          </View>
          {disabledDates.length > 0 && (
            <View style={styles.disabledHint}>
              <View style={styles.disabledDot} />
              <Text style={styles.disabledHintText}>Tanggal sudah ada pengajuan</Text>
            </View>
          )}

          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmText}>Pilih Tanggal</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    backgroundColor: c.card,
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 360,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: c.textStrong,
  },
  monthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
  },
  dayHeaderRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: c.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  dayCellSelected: {
    backgroundColor: c.primary,
  },
  dayText: {
    fontSize: 14,
    color: c.text,
  },
  dayTextSelected: {
    color: c.onGradient,
    fontWeight: "600",
  },
  confirmButton: {
    marginTop: 16,
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmText: {
    color: c.onGradient,
    fontSize: 15,
    fontWeight: "600",
  },
  dayCellDisabled: {
    backgroundColor: c.surface,
    opacity: 0.5,
  },
  dayTextDisabled: {
    color: c.textFaint,
  },
  disabledDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.danger,
    marginTop: 2,
  },
  disabledHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    backgroundColor: c.warningSoft,
    borderRadius: 8,
  },
  disabledHintText: {
    fontSize: 11,
    color: c.warning,
    fontWeight: "500",
  },
});
