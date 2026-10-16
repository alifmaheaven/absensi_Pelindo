import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import React, { useMemo } from "react";
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appendRenderToken } from "@/lib/renderToken";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

interface Props {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

/**
 * ImageViewerModal — Reusable fullscreen image preview modal.
 *
 * Usage:
 *   <ImageViewerModal visible={!!previewImage} uri={previewImage} onClose={() => setPreviewImage(null)} />
 */
export default function ImageViewerModal({ visible, uri, onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.viewerBackdrop} />
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name="close" size={32} color={colors.onGradient} />
        </TouchableOpacity>
        {uri && (
          <Image
            source={{ uri: appendRenderToken(uri) }}
            style={styles.image}
            resizeMode="contain"
          />
        )}
        <Text style={styles.hint}>Tap anywhere to close</Text>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: c.viewerScrim,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: c.glassOnGradient,
    borderWidth: 1,
    borderColor: c.glassOnGradientBorder,
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  hint: {
    position: "absolute",
    bottom: 40,
    color: c.onGradient,
    opacity: 0.6,
    fontSize: 12,
    fontWeight: "600",
  },
});
