import { Bot, Home, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { UserAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const items = [
  { label: "Luna", icon: Bot, href: "/luna" },
  { label: "Home", icon: Home, href: "/dashboard" },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return null;

  return (
    <aside className="w-60 border-r border-border bg-surface p-4">
      <div className="mb-6 flex items-center gap-3 rounded-md bg-surfaceAlt p-3">
        <UserAvatar seed={user.avatar_seed ?? user.id} className="h-10 w-10 rounded-full border border-border" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{user.display_name ?? user.username}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
      </div>
      <nav className="flex h-[calc(100%-88px)] flex-col">
        <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.href || (item.href === "/settings" && location.pathname === "/profile");
          return (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md border-l-2 px-3 py-2 text-sm",
                active
                  ? "border-l-indigo-500 bg-[#1a1a1a] text-text"
                  : "border-l-transparent text-muted hover:bg-surfaceAlt hover:text-text"
              )}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
        </div>
        <div className="mt-auto border-t border-border pt-3">
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-2 rounded-md border-l-2 px-3 py-2 text-sm",
              location.pathname === "/settings"
                ? "border-l-indigo-500 bg-[#1a1a1a] text-text"
                : "border-l-transparent text-muted hover:bg-surfaceAlt hover:text-text"
            )}
          >
            <Settings size={16} />
            Settings
          </Link>
        </div>
      </nav>
    </aside>
  );
}
