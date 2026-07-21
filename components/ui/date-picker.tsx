import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
  const today = new Date();
  const initial = value ? new Date(value) : today;
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(initial.getDate());

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
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Month/Year navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.navButton}>
              <Ionicons name="chevron-back" size={20} color="#1e90ff" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTHS[month]} {year}
            </Text>
            <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={20} color="#1e90ff" />
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    backgroundColor: "#fff",
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
    color: "#1a1a1a",
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
    color: "#333",
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
    color: "#999",
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
    backgroundColor: "#1e90ff",
  },
  dayText: {
    fontSize: 14,
    color: "#333",
  },
  dayTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  confirmButton: {
    marginTop: 16,
    backgroundColor: "#1e90ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  dayCellDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  dayTextDisabled: {
    color: "#ccc",
  },
  disabledDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F44336",
    marginTop: 2,
  },
  disabledHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    backgroundColor: "#FFF3E0",
    borderRadius: 8,
  },
  disabledHintText: {
    fontSize: 11,
    color: "#E65100",
    fontWeight: "500",
  },
});
