import React from "react";
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name="close" size={32} color="#fff" />
        </TouchableOpacity>
        {uri && (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
          />
        )}
        <Text style={styles.hint}>Tap anywhere to close</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    width: 40,
    height: 40,
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
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
});
