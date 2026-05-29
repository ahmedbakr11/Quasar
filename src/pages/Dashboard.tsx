import { format } from "date-fns";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { UserAvatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/authStore";

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const onSignOut = async () => {
    setLoading(true);
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-[calc(100vh-40px)] bg-background pb-28">
      <main className="p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Good morning, {user.display_name ?? user.username}</h1>
            <p className="mt-2 text-sm text-muted">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-md border border-border bg-surfaceAlt p-2">
              <UserAvatar seed={user.avatar_seed ?? user.id} className="h-8 w-8 rounded-full border border-border" />
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-md border border-border bg-surface p-1">
                <Link className="block rounded px-3 py-2 text-sm hover:bg-surfaceAlt" to="/profile">Profile</Link>
                <button onClick={onSignOut} className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-destructive hover:bg-surfaceAlt" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign Out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
