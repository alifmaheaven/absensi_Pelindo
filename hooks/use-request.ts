import { useState } from "react";

export function useRequest<T>(request: () => Promise<T>) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    try {
      setLoading(true);
      return await request();
    } catch (e) {
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { run, loading };
}
