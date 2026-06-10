import { getToken } from "@/lib/storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";

type GuardType = "auth" | "guest";

export function useAuthGuard(type: GuardType) {
  const [checking, setChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkToken = async () => {
      setIsLoading(true);
      try {
        const token = await getToken();

        if (!mounted) return;

        // 🔒 Halaman yang butuh login
        if (type === "auth" && !token) {
          router.replace("/auth");
        }

        // 🚫 Halaman login (guest only)
        if (type === "guest" && token) {
          // Only redirect after token check is definitively complete
          router.replace("/(tabs)");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          setChecking(false);
        }
      }
    };

    checkToken();

    return () => {
      mounted = false;
    };
  }, [type]);

  return { checking, isLoading };
}
