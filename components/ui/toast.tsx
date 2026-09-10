import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckRounded, CloseRounded, InfoOutlineRounded } from "../icon";

// Toast Component
type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  visible: boolean;
  message: string;
  type: ToastType;
  onHide: () => void;
}

export function Toast({ visible, message, type, onHide }: ToastProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        hideToast();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => onHide());
  };

  const getBackgroundColor = () => {
    const c = colors;
    switch (type) {
      case "success":
        return c.success;
      case "error":
        return c.danger;
      case "warning":
        return c.warning;
      case "info":
        return c.primary;
      default:
        return c.text;
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckRounded {...styles.toastIcon} />;
      case "error":
        return <CloseRounded {...styles.toastIcon} />;
      case "warning":
        return <InfoOutlineRounded {...styles.toastIcon} />;
      case "info":
        return <InfoOutlineRounded {...styles.toastIcon} />;
      default:
        return "";
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
          backgroundColor: getBackgroundColor(),
        },
      ]}
    >
      <View style={styles.toastIconContainer}>{getIcon()}</View>
      <Text style={styles.toastMessage}>{message}</Text>
    </Animated.View>
  );
}

//

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: "",
    type: "info",
  });

  const showToast = (message: string, type: ToastType = "info") => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast((prev) => ({ ...prev, visible: false }));
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      {/* Toast GLOBAL */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast harus digunakan di dalam ToastProvider");
  }
  return ctx;
}

const makeStyles = (c: ThemeColors, insets?: { top: number }) => StyleSheet.create({
  // Toast Styles
  toastContainer: {
    position: "absolute",
    top: (insets?.top ?? 20) + 8,
    left: 20,
    right: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 99999,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  toastIcon: {
    color: c.onGradient,
    height: 15,
    width: 15,
  },
  toastMessage: {
    color: c.onGradient,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  toastIconContainer: {
    backgroundColor: "rgba(255,255,255,0.2)",
    width: 25,
    height: 25,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
});
