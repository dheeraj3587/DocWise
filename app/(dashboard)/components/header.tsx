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
    <header className="docwise-rail flex h-14 shrink-0 items-center border-b pr-4 pl-16 sm:pr-6 lg:pr-8 lg:pl-8">
      <div className="min-w-0">
        <h1 className="truncate font-heading text-sm text-foreground sm:text-base">
          {name}
        </h1>
        {name !== "Upgrade" ? (
          <p className="mono-label mt-1 hidden lg:block">
            Manage your documents
          </p>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2 pl-4">
        <ThemeToggle />
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-xs text-foreground">{user?.firstName}</p>
          <p className="mono-label mt-1">
            {userData?.upgrade === true ? "Pro plan" : "Free plan"}
          </p>
        </div>
        <UserButton
          appearance={{
            elements: {
              userButtonAvatar: "size-7",
              userButtonTrigger:
                "rounded-lg border border-border p-0.5 outline-none",
            },
          }}
        />
      </div>
    </header>
  );
};

export default Header;
