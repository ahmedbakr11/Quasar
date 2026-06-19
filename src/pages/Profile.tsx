import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/lib/tauriCommands";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

export default function Profile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.sessionToken);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.signOut);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [loading, setLoading] = useState(false);

  const memberSince = useMemo(() => (user ? new Date(user.created_at).toLocaleDateString() : ""), [user]);
  if (!user || !token) return <Navigate to="/login" replace />;

  const save = async (seed = user.avatar_seed ?? user.id) => {
    setLoading(true);
    try {
      const updated = await updateProfile({ sessionToken: token, displayName, avatarSeed: seed });
      setUser(updated);
      setEditing(false);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const regenerateAvatar = async () => {
    const seed = crypto.randomUUID();
    await save(seed);
  };

  return (
    <div className="app-page-scroll bg-background pb-28">
      <main className="flex items-start justify-center p-8">
        <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6">
          <div className="mb-6 flex items-center gap-4">
            <UserAvatar seed={user.avatar_seed ?? user.id} className="h-20 w-20 rounded-full border border-border" />
            <div>
              <p className="text-xl font-semibold">{user.display_name ?? user.username}</p>
              <p className="text-sm text-muted">@{user.username}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted">Display Name</p>
              {editing ? <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /> : <p>{user.display_name ?? "Not set"}</p>}
            </div>
            <div><p className="text-xs text-muted">Username</p><p>{user.username}</p></div>
            <div><p className="text-xs text-muted">Email</p><p>{user.email}</p></div>
            <div><p className="text-xs text-muted">Member since</p><p>{memberSince}</p></div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {editing ? (
              <Button onClick={() => save()} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            ) : (
              <Button onClick={() => setEditing(true)}>Edit Profile</Button>
            )}
            <Button variant="outline" onClick={regenerateAvatar} disabled={loading}>Regenerate Avatar</Button>
            <Button variant="destructive" onClick={async () => { await signOut(); navigate('/login'); }}>Sign Out</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
