import { useState, useRef } from "react";

export function useRequest<T>(request: () => Promise<T>) {
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(request);
  requestRef.current = request;

  const run = async () => {
    try {
      setLoading(true);
      return await requestRef.current();
    } catch (e) {
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { run, loading };
}
