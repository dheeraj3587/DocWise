"use client";
import { UserButton, useUser } from "@clerk/clerk-react";
import { useAuth } from "@clerk/nextjs";
import { createUser, getUser as fetchUser } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";

interface UserData {
  email: string;
  name: string;
}

const Header = ({ name }: { name: string }) => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);

  const checkUser = useCallback(async () => {
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
      setUserData(data);
    } catch (error) {
      console.error("Error syncing user:", error);
    }
  }, [getToken, user]);

  useEffect(() => {
    if (user) {
      const timeoutId = setTimeout(() => {
        void checkUser();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [user, checkUser]);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold text-slate-900">{name}</h1>
          <p className="text-xs text-slate-500">Manage your documents</p>
        </div>
        <div className="lg:hidden">
          <h1 className="text-lg font-semibold text-slate-900 ml-12">{name}</h1>
        </div>
      </div>

      {/* Profile */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-slate-900">
            {user?.firstName}
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
