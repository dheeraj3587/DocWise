/**
 * React hooks that replace Convex's useQuery / useMutation / useAction.
 * Uses standard React state + useAuth() from Clerk for JWT tokens.
 */

"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useAuth } from "@clerk/nextjs";
import { getApiBase } from "@/lib/api-base";

const API_BASE = getApiBase();

/**
 * SWR fetcher that injects Clerk JWT token.
 */
function useAuthFetcher() {
  const { getToken } = useAuth();
  return useCallback(
    async (url: string) => {
      const token = await getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    [getToken],
  );
}

/**
 * Drop-in replacement for the old useApiQuery, now backed by SWR.
 * SWR automatically deduplicates in-flight requests and caches across components.
 */
export function useApiQuery<T>(
  url: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _deps: unknown[] = [],
): { data: T | undefined; isLoading: boolean; error: Error | null; refetch: () => void } {
  const fetcher = useAuthFetcher();
  const key = url ? `${API_BASE}${url}` : null;

  const { data, error, isLoading, mutate } = useSWR<T>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  return {
    data,
    isLoading,
    error: error ?? null,
    refetch: () => { mutate(); },
  };
}

/** Revalidate all queries matching a URL prefix (e.g. '/api/files'). */
export function revalidateQueries(urlPrefix: string) {
  globalMutate(
    (key: unknown) => typeof key === "string" && key.includes(urlPrefix),
    undefined,
    { revalidate: true },
  );
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
