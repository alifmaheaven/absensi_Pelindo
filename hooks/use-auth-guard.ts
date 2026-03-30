import { getToken } from "@/lib/storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";

type GuardType = "auth" | "guest";

export function useAuthGuard(type: GuardType) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkToken = async () => {
      try {
        const token = await getToken();

        if (!mounted) return;

        // 🔒 Halaman yang butuh login
        if (type === "auth" && !token) {
          router.replace("/auth");
        }

        // 🚫 Halaman login (guest only)
        if (type === "guest" && token) {
          router.replace("/(tabs)");
        }
      } finally {
        if (mounted) setChecking(false);
      }
    };

    checkToken();

    return () => {
      mounted = false;
    };
  }, [type]);

  return { checking };
}
