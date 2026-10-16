import { useSafeAreaInsets } from "react-native-safe-area-context";

export const TAB_BAR_BASE_HEIGHT = 60;

/**
 * Tinggi tab bar yang melayang di atas konten (position: absolute).
 * Dihitung secara deterministik dari tinggi bar dasar (60) + bottom safe area inset.
 * Menggunakan react-native-safe-area-context (BUKAN @react-navigation)
 * agar kompatibel penuh dengan validasi Metro Expo Router SDK 56.
 */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  const bottomInset = (insets?.bottom ?? 0) > 0 ? insets.bottom : 10;
  return TAB_BAR_BASE_HEIGHT + bottomInset;
}
