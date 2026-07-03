"use client";

import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { createUser } from "@/lib/api-client";

/**
 * Syncs the Clerk user to the backend exactly once per session.
 * Call this from any component — the ref guard prevents duplicate calls.
 */
export function useUserSync() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const synced = useRef(false);

  useEffect(() => {
    if (!user || synced.current) return;
    synced.current = true;

    (async () => {
      try {
        const token = await getToken();
        await createUser(
          {
            email: user.primaryEmailAddress?.emailAddress as string,
            name: user.firstName as string,
            image_url: user.imageUrl as string,
          },
          token,
        );
      } catch (error) {
        console.error("Error syncing user:", error);
      }
    })();
  }, [user, getToken]);
}
