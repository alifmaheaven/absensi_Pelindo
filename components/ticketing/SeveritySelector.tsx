import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { ITicketSeverity } from "@/types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ITicketSeverity[];
}

// Netral mengikuti tema (fallback bila severity tanpa warna).
const defaultSeverityColor = (c: ThemeColors) => ({
  bg: "rgba(150,150,150,0.15)",
  border: c.textMuted,
  text: c.textSecondary,
});

function parseSeverityColor(hex: string | undefined, c: ThemeColors) {
  if (!hex) return defaultSeverityColor(c);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    bg: `rgba(${r},${g},${b},0.15)`,
    border: hex,
    text: hex,
  };
}

export function SeveritySelector({ value, onChange, options }: Props) {

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.severityContainer}>
      {options?.length > 0 ? (
        options?.map((item) => {
          const isActive = value === item.id;
          const color = parseSeverityColor(item.color, colors);

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onChange(item.id)}
              activeOpacity={0.8}
              style={[
                styles.severityButton,
                isActive && {
                  backgroundColor: color.bg,
                  borderColor: color.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.severityText,
                  isActive && { color: color.text, fontWeight: "600" },
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })
      ) : (
        <Text style={styles.emptyText}>Tidak ada severity</Text>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  severityContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  severityButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
  },
  severityText: {
    fontSize: 13,
    color: c.textSecondary,
  },
  emptyText: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: "center",
    flex: 1,
  },
});
