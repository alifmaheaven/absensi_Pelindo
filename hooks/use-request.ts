import { useState, useRef, useEffect, useCallback } from "react";

export function useRequest<T>(request: () => Promise<T>) {
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(request);

  // Menulis ref saat fase render melanggar aturan React 19
  // (`react-hooks/refs`): pada Concurrent Mode render bisa dibatalkan/diulang
  // sehingga nilai ref bisa tidak sinkron dengan commit terakhir. Penulisan
  // dipindah ke effect agar hanya terjadi setelah commit.
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const run = useCallback(async () => {
    try {
      setLoading(true);
      return await requestRef.current();
    } finally {
      setLoading(false);
    }
  }, []);

  return { run, loading };
}
