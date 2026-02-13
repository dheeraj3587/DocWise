/**
 * React hooks that replace Convex's useQuery / useMutation / useAction.
 * Uses standard React state + useAuth() from Clerk for JWT tokens.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function buildHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * A hook that fetches data from the API and re-fetches on dependency changes.
 * Similar to Convex's useQuery but backed by REST.
 */
export function useApiQuery<T>(
  url: string | null,
  deps: unknown[] = [],
): { data: T | undefined; isLoading: boolean; error: Error | null; refetch: () => void } {
  const { getToken } = useAuth();
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!url) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}${url}`, {
        headers: buildHeaders(token),
      });

      if (!mountedRef.current) return;

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const result = await res.json();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err as Error);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [url, getToken, ...deps]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

/**
 * Hook for API mutations (POST/PUT/DELETE).
 * Returns a function you can call with the request body.
 */
export function useApiMutation<TInput, TOutput = unknown>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
) {
  const { getToken } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const mutate = useCallback(
    async (body?: TInput, customUrl?: string): Promise<TOutput> => {
      setIsLoading(true);
      try {
        const token = await getToken();
        const targetUrl = customUrl || url;

        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const isFormData = body instanceof FormData;
        if (!isFormData) {
          headers["Content-Type"] = "application/json";
        }

        const res = await fetch(`${API_BASE}${targetUrl}`, {
          method,
          headers,
          body: isFormData ? (body as unknown as FormData) : body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText);
        }

        // Handle empty responses (204 No Content)
        const text = await res.text();
        return text ? JSON.parse(text) : ({} as TOutput);
      } finally {
        setIsLoading(false);
      }
    },
    [url, method, getToken],
  );

  return { mutate, isLoading };
}
