import { Bot, Home, ListChecks, NotebookText, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const items = [
  { label: "Home", icon: Home, href: "/dashboard" },
  { label: "Tasks", icon: ListChecks, href: "/tasks" },
  { label: "Notes", icon: NotebookText, href: "/notes" },
  { label: "Luna", icon: Bot, href: "/luna" },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [visible, setVisible] = useState(true);

  const isActive = (href: string) =>
    location.pathname === href ||
    (href === "/settings" && location.pathname === "/profile") ||
    (href === "/profile" && location.pathname === "/settings");

  useEffect(() => {
    let raf = 0;
    const onMove = (event: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const nearBottom = event.clientY >= window.innerHeight - 130;
        setVisible(nearBottom);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!user) return null;

  return (
    <aside
      className={cn(
        "pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 transition-all duration-300",
        visible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
      )}
    >
      <nav className="pointer-events-auto rounded-2xl border border-white/15 bg-[#121212d9] px-2 py-2 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-center gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                "group relative flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-sm transition-colors duration-200",
                active
                  ? "bg-white/10 text-indigo-200"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              )}
              aria-label={item.label}
              title={item.label}
            >
              <Icon size={18} />
              <span className={cn("hidden text-xs font-medium sm:block transition-all duration-200", active ? "max-w-20 opacity-100 ml-1" : "max-w-0 overflow-hidden opacity-0")}>
                {item.label}
              </span>
            </Link>
          );
        })}
          <div className="mx-1 h-6 w-px bg-white/15" />
          <Link
            to="/settings"
            className={cn(
              "group flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-sm transition-colors duration-200",
              isActive("/settings")
                ? "bg-white/10 text-indigo-200"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            )}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={18} />
            <span className={cn("hidden text-xs font-medium sm:block transition-all duration-200", isActive("/settings") ? "max-w-20 opacity-100 ml-1" : "max-w-0 overflow-hidden opacity-0")}>
              Settings
            </span>
          </Link>
        </div>
      </nav>
    </aside>
  );
}
