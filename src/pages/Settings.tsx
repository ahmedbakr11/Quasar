import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { useAgentStore } from "@/store/agentStore";
import { useAuthStore } from "@/store/authStore";

type Section = "profile" | "agent" | "appearance" | "keyboard";

export default function Settings() {
  const token = useAuthStore((s) => s.sessionToken);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);
  const loadConfig = useAgentStore((s) => s.loadConfig);
  const saveConfig = useAgentStore((s) => s.saveConfig);
  const isConfigured = useAgentStore((s) => s.is_configured);
  const updateSettings = useAgentStore((s) => s.updateSettings);
  const popupTransparency = useAgentStore((s) => s.popup_transparency);
  const muteShortcut = useAgentStore((s) => s.mute_shortcut);
  const [active, setActive] = useState<Section>("profile");
  const [agentForm, setAgentForm] = useState({
    livekit_url: "",
    livekit_api_key: "",
    livekit_api_secret: "",
    room_name: "luna-room",
    agent_name: "gemini_voice_agent"
  });
  const [savingAgent, setSavingAgent] = useState(false);
  const [testingAgent, setTestingAgent] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState<string | null>(null);
  const [avatarSeedDraft, setAvatarSeedDraft] = useState<string | null>(null);
  const loadedForTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      loadedForTokenRef.current = null;
      return;
    }
    if (loadedForTokenRef.current === token) return;
    loadedForTokenRef.current = token;
    const run = async () => {
      setConfigLoading(true);
      setPageError(null);
      try {
        const config = await loadConfig(token);
        setAgentForm((prev) => ({
          ...prev,
          livekit_url: config.livekit_url,
          livekit_api_key: config.livekit_api_key,
          room_name: config.room_name,
          agent_name: config.agent_name
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to load settings";
        setPageError(message);
        toast.error(message);
      } finally {
        setConfigLoading(false);
      }
    };
    void run();
  }, [loadConfig, token]);

  const hasExistingSecret = useMemo(() => isConfigured, [isConfigured]);
  const displayName = displayNameDraft ?? (user?.display_name ?? "");
  const avatarSeed = avatarSeedDraft ?? (user?.avatar_seed ?? user?.id ?? "");

  if (!token) return <Navigate to="/login" replace />;
  if (authLoading || configLoading || !user) return <div className="p-8 text-sm text-zinc-300">Loading settings...</div>;
  if (pageError) {
    return (
      <div className="p-8">
        <div className="max-w-xl rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <p className="text-sm font-medium">Failed to open settings</p>
          <p className="mt-1 text-xs">{pageError}</p>
        </div>
      </div>
    );
  }

  const saveProfile = async () => {
    try {
      const updated = await invoke("update_profile", {
        sessionToken: token,
        displayName,
        avatarSeed
      });
      setUser(updated as typeof user);
      setDisplayNameDraft(null);
      setAvatarSeedDraft(null);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    }
  };

  const saveAgentConfig = async () => {
    setSavingAgent(true);
    try {
      await saveConfig(token, agentForm);
      setAgentForm((prev) => ({ ...prev, livekit_api_secret: "" }));
      toast.success("Configuration saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to save");
    } finally {
      setSavingAgent(false);
    }
  };

  const testAgent = async () => {
    setTestingAgent(true);
    try {
      const result = await invoke<string>("test_agent_connection", { sessionToken: token });
      toast.success(`${result} - agent connection looks good`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : typeof err === "string" ? err : "Connection test failed");
    } finally {
      setTestingAgent(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-40px)] bg-[#0a0a0a] pb-28 text-zinc-100">
      <div className="flex h-full">
      <aside className="w-[200px] border-r border-border p-3">
        <button
          className={`mb-1 w-full border-l-2 px-3 py-2 text-left text-sm ${active === "profile" ? "border-l-indigo-500 bg-[#1a1a1a]" : "border-l-transparent text-zinc-400 hover:bg-surfaceAlt"}`}
          onClick={() => setActive("profile")}
        >
          Profile
        </button>
        <button
          className={`mb-1 w-full border-l-2 px-3 py-2 text-left text-sm ${active === "agent" ? "border-l-indigo-500 bg-[#1a1a1a]" : "border-l-transparent text-zinc-400 hover:bg-surfaceAlt"}`}
          onClick={() => setActive("agent")}
        >
          Agent
        </button>
        <button
          className={`mb-1 w-full border-l-2 px-3 py-2 text-left text-sm ${active === "appearance" ? "border-l-indigo-500 bg-[#1a1a1a]" : "border-l-transparent text-zinc-400 hover:bg-surfaceAlt"}`}
          onClick={() => setActive("appearance")}
        >
          Appearance
        </button>
        <button
          className={`w-full border-l-2 px-3 py-2 text-left text-sm ${active === "keyboard" ? "border-l-indigo-500 bg-[#1a1a1a]" : "border-l-transparent text-zinc-400 hover:bg-surfaceAlt"}`}
          onClick={() => setActive("keyboard")}
        >
          Keyboard
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl">
          {active === "profile" && (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-xl font-semibold">Profile</h2>
              <div className="mt-6 flex items-center gap-4">
                <UserAvatar seed={avatarSeed} className="h-16 w-16 rounded-full border border-border" />
                <Button variant="outline" onClick={() => setAvatarSeedDraft(crypto.randomUUID())}>Regenerate Avatar</Button>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <p className="mb-1 text-sm text-zinc-300">Display Name</p>
                  <Input value={displayName} onChange={(e) => setDisplayNameDraft(e.target.value)} />
                </div>
                <div>
                  <p className="mb-1 text-sm text-zinc-300">Username</p>
                  <Input value={user.username} disabled />
                </div>
                <div>
                  <p className="mb-1 text-sm text-zinc-300">Email</p>
                  <Input value={user.email} disabled />
                </div>
                <Button className="w-full bg-indigo-500 hover:bg-indigo-600" onClick={() => void saveProfile()}>Save Changes</Button>
              </div>
            </div>
          )}

          {active === "agent" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-xl font-semibold">Agent Configuration</h2>
                <p className="mt-1 text-sm text-zinc-400">Credentials are stored locally and never leave your device</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1a1a1a] px-3 py-1 text-xs">
                  <span className={`h-2 w-2 rounded-full ${isConfigured ? "bg-green-400" : "bg-zinc-500"}`} />
                  {isConfigured ? "Configured" : "Not configured"}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <div className="space-y-4">
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">LiveKit Server URL</p>
                    <Input
                      placeholder="ws://localhost:7880"
                      value={agentForm.livekit_url}
                      onChange={(e) => setAgentForm((f) => ({ ...f, livekit_url: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">WebSocket URL of your LiveKit server</p>
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">API Key</p>
                    <Input
                      placeholder="your-api-key"
                      value={agentForm.livekit_api_key}
                      onChange={(e) => setAgentForm((f) => ({ ...f, livekit_api_key: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">Your LiveKit API key</p>
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">API Secret</p>
                    <div className="relative">
                      <Input
                        type={showSecret ? "text" : "password"}
                        placeholder="your-api-secret"
                        value={agentForm.livekit_api_secret}
                        onChange={(e) => setAgentForm((f) => ({ ...f, livekit_api_secret: e.target.value }))}
                        className="pr-10"
                      />
                      <button
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                        onClick={() => setShowSecret((v) => !v)}
                        type="button"
                      >
                        {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">Never shared with the frontend - stored securely in local SQLite</p>
                    {hasExistingSecret && (
                      <p className="mt-1 text-xs italic text-zinc-500">Secret already saved - enter a new value to update it</p>
                    )}
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Room Name</p>
                    <Input
                      placeholder="luna-room"
                      value={agentForm.room_name}
                      onChange={(e) => setAgentForm((f) => ({ ...f, room_name: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">Must match the room your LiveKit agent is listening on</p>
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Agent Name</p>
                    <Input
                      placeholder="gemini_voice_agent"
                      value={agentForm.agent_name}
                      onChange={(e) => setAgentForm((f) => ({ ...f, agent_name: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">The agent_name set in your Python WorkerOptions</p>
                  </label>
                </div>

                <div className="mt-6 space-y-3">
                  <Button className="w-full bg-indigo-500 hover:bg-indigo-600" onClick={() => void saveAgentConfig()} disabled={savingAgent}>
                    {savingAgent ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Configuration"}
                  </Button>
                  <Button className="w-full" variant="outline" onClick={() => void testAgent()} disabled={testingAgent}>
                    {testingAgent ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Connection"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {active === "appearance" && (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-xl font-semibold">Appearance</h2>
              <div className="mt-8 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-zinc-300">Luna Popup Transparency</p>
                    <span className="text-xs text-indigo-400 font-mono">{Math.round(popupTransparency * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={popupTransparency}
                    onChange={(e) => updateSettings({ popup_transparency: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <p className="mt-2 text-xs text-zinc-500">Adjust the background opacity of the floating Luna visualizer.</p>
                </div>
              </div>
            </div>
          )}

          {active === "keyboard" && (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
              <div className="mt-8 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-zinc-900/50">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Mute / Unmute Luna</p>
                    <p className="text-xs text-zinc-500 mt-1">Quickly toggle your microphone track.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-32 text-center font-mono text-xs uppercase"
                      value={muteShortcut}
                      onChange={(e) => updateSettings({ mute_shortcut: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
