export const lightTheme = {
  background: "#fff",
  surface: "#f8f9fa",
  card: "#fff",
  text: "#333",
  textSecondary: "#999",
  textMuted: "#ccc",
  border: "#f0f0f0",
  primary: "#1e90ff",
  danger: "#ef4444",
  success: "#22c55e",
  warning: "#f59e0b",
  overlay: "rgba(0,0,0,0.5)",
  statusBar: "dark-content",
  tabBar: "#fff",
  inputBg: "#f8f9fa",
};

export const darkTheme = {
  background: "#121212",
  surface: "#1e1e1e",
  card: "#2a2a2a",
  text: "#e0e0e0",
  textSecondary: "#999",
  textMuted: "#666",
  border: "#333",
  primary: "#4da6ff",
  danger: "#f87171",
  success: "#4ade80",
  warning: "#fbbf24",
  overlay: "rgba(0,0,0,0.7)",
  statusBar: "light-content",
  tabBar: "#1e1e1e",
  inputBg: "#2a2a2a",
};

export type Theme = typeof lightTheme;
