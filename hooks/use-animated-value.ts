import { useState } from "react";
import { Animated } from "react-native";

/**
 * useAnimatedValue — satu `Animated.Value` yang stabil sepanjang umur komponen.
 *
 * Mengapa bukan `useRef(new Animated.Value(x)).current`:
 * Membaca `.current` saat fase render melanggar aturan React 19
 * (`react-hooks/refs`) dan membuat objek `Animated.Value` baru dibuang pada
 * setiap render. `useState` dengan initializer lazy mengevaluasi
 * `new Animated.Value(initial)` tepat satu kali, sehingga nilainya identik
 * tetapi aman terhadap Concurrent Mode.
 *
 * Pemakaian:
 *   const opacity = useAnimatedValue(0.3);
 *   useEffect(() => {
 *     const anim = Animated.loop(...);
 *     anim.start();
 *     return () => anim.stop();
 *   }, [opacity]);
 *
 * Catatan: nilai ini TIDAK memicu re-render saat berubah (sama seperti ref),
 * animasi tetap digerakkan `Animated.timing` + `useNativeDriver`.
 */
export function useAnimatedValue(initialValue: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initialValue));
  return value;
}
