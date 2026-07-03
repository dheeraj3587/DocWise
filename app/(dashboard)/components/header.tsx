"use client";
import { UserButton, useUser } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUserSync } from "@/lib/use-user-sync";
import { useApiQuery } from "@/lib/hooks";

interface UserData {
  upgrade: boolean;
  email: string;
  name: string;
}

const Header = ({ name }: { name: string }) => {
  const { user } = useUser();
  useUserSync();

  const email = user?.primaryEmailAddress?.emailAddress;
  const { data: userData } = useApiQuery<UserData>(
    email ? `/api/users/me?email=${encodeURIComponent(email)}` : null,
    [email],
  );

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
            {userData?.upgrade === true ? "Pro plan" : "Free plan"}
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
