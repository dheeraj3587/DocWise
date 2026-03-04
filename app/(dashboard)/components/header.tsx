"use client";
import { UserButton, useUser } from "@clerk/clerk-react";
import { useAuth } from "@clerk/nextjs";
import { createUser, getUser as fetchUser } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

interface UserData {
  upgrade: boolean;
  email: string;
  name: string;
}

const Header = ({ name }: { name: string }) => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const syncUser = async () => {
      try {
        const token = await getToken();
        await createUser(
          {
            email: user?.primaryEmailAddress?.emailAddress as string,
            name: user?.firstName as string,
            image_url: user?.imageUrl as string,
          },
          token,
        );
        const data = await fetchUser(
          user?.primaryEmailAddress?.emailAddress as string,
          token,
        );
        if (!cancelled) setUserData(data);
      } catch (error) {
        console.error("Error syncing user:", error);
      }
    };
    syncUser();
    return () => { cancelled = true; };
  }, [getToken, user]);

  return (
    <header className="h-16 glass-subtle border-b border-border px-4 lg:px-8 flex-between">
      <div className="flex items-center gap-4">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold text-foreground">{name}</h1>
          {name !== "Upgrade" && (
            <p className="text-xs text-muted-foreground">Manage your documents</p>
          )}
        </div>
        <div className="lg:hidden">
          <h1 className="text-lg font-semibold text-foreground ml-12">{name}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-foreground">
            {user?.firstName}
          </p>
          <p className="text-xs text-muted-foreground">
            {userData && userData?.upgrade == true ? "Pro plan" : "Free plan"}
          </p>
        </div>
        <UserButton
          appearance={{
            elements: {
              userButtonAvatar: "w-12 h-12",
              userButtonTrigger: "p-2",
            },
          }}
        />
      </div>
    </header>
  );
};

export default Header;
