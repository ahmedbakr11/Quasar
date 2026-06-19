import { useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Eye, EyeOff, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { useAgentStore } from "@/store/agentStore";
import { useAuthStore } from "@/store/authStore";
import { useRuntimeStore } from "@/store/runtimeStore";

type Section = "profile" | "agent" | "memory" | "quirks" | "runtime" | "appearance" | "keyboard";

type LunaSetupStatus = {
  hasGoogleApiKey: boolean;
  appEnvPath: string;
};

type LunaMemorySettings = {
  persistentMemory: string;
  memoryPath: string;
};

type QuirksSettings = {
  searchProvider: string;
  braveSearchApiKeySet: boolean;
  outlookEnabled: boolean;
  outlookTenantId: string;
  outlookClientId: string;
  outlookClientSecretSet: boolean;
  outlookRefreshTokenSet: boolean;
  outlookAccessTokenSet: boolean;
  outlookScopes: string;
  outlookTimeoutSeconds: string;
  googleWorkspaceMcpEnabled: boolean;
  googleWorkspaceMcpMode: string;
  googleWorkspaceMcpCommand: string;
  googleWorkspaceMcpArgs: string;
  googleWorkspaceMcpTimeoutSeconds: string;
  googleWorkspaceMcpAllowedTools: string;
  googleWorkspaceClientId: string;
  googleWorkspaceClientSecretSet: boolean;
  googleWorkspaceRefreshTokenSet: boolean;
  googleWorkspaceAccessTokenSet: boolean;
  googleWorkspaceEnabledCapabilities: string;
  appEnvPath: string;
};

type QuirksForm = QuirksSettings & {
  braveSearchApiKey: string;
  outlookClientSecret: string;
  outlookRefreshToken: string;
  outlookAccessToken: string;
  googleWorkspaceClientSecret: string;
  googleWorkspaceRefreshToken: string;
  googleWorkspaceAccessToken: string;
};

const defaultQuirksForm: QuirksForm = {
  searchProvider: "brave",
  braveSearchApiKeySet: false,
  braveSearchApiKey: "",
  outlookEnabled: false,
  outlookTenantId: "common",
  outlookClientId: "",
  outlookClientSecretSet: false,
  outlookClientSecret: "",
  outlookRefreshTokenSet: false,
  outlookRefreshToken: "",
  outlookAccessTokenSet: false,
  outlookAccessToken: "",
  outlookScopes: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access",
  outlookTimeoutSeconds: "20",
  googleWorkspaceMcpEnabled: false,
  googleWorkspaceMcpMode: "stdio",
  googleWorkspaceMcpCommand: "uvx",
  googleWorkspaceMcpArgs: "[\"--from\",\"google-workspace-mcp\",\"google-workspace-worker\",\"--transport\",\"stdio\"]",
  googleWorkspaceMcpTimeoutSeconds: "30",
  googleWorkspaceMcpAllowedTools: "",
  googleWorkspaceClientId: "",
  googleWorkspaceClientSecretSet: false,
  googleWorkspaceClientSecret: "",
  googleWorkspaceRefreshTokenSet: false,
  googleWorkspaceRefreshToken: "",
  googleWorkspaceAccessTokenSet: false,
  googleWorkspaceAccessToken: "",
  googleWorkspaceEnabledCapabilities: "[\"gmail\",\"calendar\",\"tasks\"]",
  appEnvPath: ""
};

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
  const runtimeStatus = useRuntimeStore((s) => s.status);
  const loadRuntimeStatus = useRuntimeStore((s) => s.loadStatus);
  const restartLuna = useRuntimeStore((s) => s.restartLuna);
  const restartLiveKit = useRuntimeStore((s) => s.restartLiveKit);
  const openLogsFolder = useRuntimeStore((s) => s.openLogsFolder);
  const copyDiagnostics = useRuntimeStore((s) => s.copyDiagnostics);
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
  const [runtimeBusy, setRuntimeBusy] = useState<string | null>(null);
  const [lunaSetup, setLunaSetup] = useState<LunaSetupStatus | null>(null);
  const [lunaApiKeyDraft, setLunaApiKeyDraft] = useState("");
  const [showLunaApiKey, setShowLunaApiKey] = useState(false);
  const [savingLunaKey, setSavingLunaKey] = useState(false);
  const [memorySettings, setMemorySettings] = useState<LunaMemorySettings | null>(null);
  const [persistentMemoryDraft, setPersistentMemoryDraft] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const [quirksForm, setQuirksForm] = useState<QuirksForm>(defaultQuirksForm);
  const [savingQuirks, setSavingQuirks] = useState(false);
  const [showQuirkSecrets, setShowQuirkSecrets] = useState(false);
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

  useEffect(() => {
    void loadRuntimeStatus().catch(() => {
      // Runtime status can be unavailable during early startup.
    });
    void invoke<LunaSetupStatus>("get_luna_setup_status")
      .then(setLunaSetup)
      .catch(() => {
        // Setup status is best-effort on first launch.
      });
    void invoke<LunaMemorySettings>("load_luna_memory_settings")
      .then((settings) => {
        setMemorySettings(settings);
        setPersistentMemoryDraft(settings.persistentMemory);
      })
      .catch(() => {
        // Memory file is created lazily when Luna runs or the user saves memory.
      });
    void invoke<QuirksSettings>("load_quirks_settings")
      .then((settings) => setQuirksForm({ ...defaultQuirksForm, ...settings }))
      .catch(() => {
        // Quirks are optional and stored lazily.
      });
  }, [loadRuntimeStatus]);

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

  const runRuntimeAction = async (label: string, action: () => Promise<unknown>) => {
    setRuntimeBusy(label);
    try {
      await action();
      toast.success(`${label} completed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : typeof err === "string" ? err : `${label} failed`);
    } finally {
      setRuntimeBusy(null);
    }
  };

  const saveLunaKey = async () => {
    if (!lunaApiKeyDraft.trim()) {
      toast.error("Google API key is required.");
      return;
    }

    setSavingLunaKey(true);
    try {
      const setup = await invoke<LunaSetupStatus>("save_luna_api_key", {
        apiKey: lunaApiKeyDraft,
        persistWindowsEnvironment: true
      });
      setLunaSetup(setup);
      setLunaApiKeyDraft("");
      await restartLuna();
      toast.success("Luna API key saved and Luna restarted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to save Luna API key");
    } finally {
      setSavingLunaKey(false);
    }
  };

  const savePersistentMemory = async () => {
    setSavingMemory(true);
    try {
      const settings = await invoke<LunaMemorySettings>("save_luna_persistent_memory", {
        persistentMemory: persistentMemoryDraft
      });
      setMemorySettings(settings);
      setPersistentMemoryDraft(settings.persistentMemory);
      toast.success("Luna memory saved. Restart Luna to load it into the next session.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to save Luna memory");
    } finally {
      setSavingMemory(false);
    }
  };

  const saveQuirks = async () => {
    setSavingQuirks(true);
    try {
      const settings = await invoke<QuirksSettings>("save_quirks_settings", {
        payload: {
          searchProvider: quirksForm.searchProvider,
          braveSearchApiKey: quirksForm.braveSearchApiKey,
          outlookEnabled: quirksForm.outlookEnabled,
          outlookTenantId: quirksForm.outlookTenantId,
          outlookClientId: quirksForm.outlookClientId,
          outlookClientSecret: quirksForm.outlookClientSecret,
          outlookRefreshToken: quirksForm.outlookRefreshToken,
          outlookAccessToken: quirksForm.outlookAccessToken,
          outlookScopes: quirksForm.outlookScopes,
          outlookTimeoutSeconds: quirksForm.outlookTimeoutSeconds,
          googleWorkspaceMcpEnabled: quirksForm.googleWorkspaceMcpEnabled,
          googleWorkspaceMcpMode: quirksForm.googleWorkspaceMcpMode,
          googleWorkspaceMcpCommand: quirksForm.googleWorkspaceMcpCommand,
          googleWorkspaceMcpArgs: quirksForm.googleWorkspaceMcpArgs,
          googleWorkspaceMcpTimeoutSeconds: quirksForm.googleWorkspaceMcpTimeoutSeconds,
          googleWorkspaceMcpAllowedTools: quirksForm.googleWorkspaceMcpAllowedTools,
          googleWorkspaceClientId: quirksForm.googleWorkspaceClientId,
          googleWorkspaceClientSecret: quirksForm.googleWorkspaceClientSecret,
          googleWorkspaceRefreshToken: quirksForm.googleWorkspaceRefreshToken,
          googleWorkspaceAccessToken: quirksForm.googleWorkspaceAccessToken,
          googleWorkspaceEnabledCapabilities: quirksForm.googleWorkspaceEnabledCapabilities
        }
      });
      setQuirksForm({ ...defaultQuirksForm, ...settings });
      await restartLuna().catch(() => undefined);
      toast.success("Quirks saved and Luna restarted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to save quirks");
    } finally {
      setSavingQuirks(false);
    }
  };

  const copyRuntimeDiagnostics = async () => {
    setRuntimeBusy("Copy diagnostics");
    try {
      const diagnostics = await copyDiagnostics();
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      toast.success("Diagnostics copied.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy diagnostics");
    } finally {
      setRuntimeBusy(null);
    }
  };

  return (
    <div className="app-page-scroll bg-[#0a0a0a] pb-28 text-zinc-100">
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
          className={`mb-1 w-full border-l-2 px-3 py-2 text-left text-sm ${active === "memory" ? "border-l-indigo-500 bg-[#1a1a1a]" : "border-l-transparent text-zinc-400 hover:bg-surfaceAlt"}`}
          onClick={() => setActive("memory")}
        >
          Memory
        </button>
        <button
          className={`mb-1 w-full border-l-2 px-3 py-2 text-left text-sm ${active === "quirks" ? "border-l-indigo-500 bg-[#1a1a1a]" : "border-l-transparent text-zinc-400 hover:bg-surfaceAlt"}`}
          onClick={() => setActive("quirks")}
        >
          Quirks
        </button>
        <button
          className={`mb-1 w-full border-l-2 px-3 py-2 text-left text-sm ${active === "runtime" ? "border-l-indigo-500 bg-[#1a1a1a]" : "border-l-transparent text-zinc-400 hover:bg-surfaceAlt"}`}
          onClick={() => setActive("runtime")}
        >
          Runtime
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

          {active === "memory" && (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-xl font-semibold">Luna Memory</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Persistent memory is stored in Quasar app data and reused by Luna across sessions.
              </p>

              <label className="mt-6 block">
                <p className="mb-1 text-sm text-zinc-200">Persistent Memory</p>
                <textarea
                  value={persistentMemoryDraft}
                  onChange={(event) => setPersistentMemoryDraft(event.target.value)}
                  className="min-h-[220px] w-full resize-y rounded-md border border-border bg-surfaceAlt px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                  placeholder="Add stable facts, preferences, or instructions Luna should remember."
                />
              </label>

              {memorySettings?.memoryPath && (
                <p className="mt-2 break-all text-xs text-zinc-500">Memory file: {memorySettings.memoryPath}</p>
              )}

              <Button
                className="mt-6 w-full bg-indigo-500 hover:bg-indigo-600"
                onClick={() => void savePersistentMemory()}
                disabled={savingMemory}
              >
                {savingMemory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Memory"}
              </Button>
            </div>
          )}

          {active === "quirks" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-xl font-semibold">Quirks</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Optional Luna integrations for web search, Outlook mail, and Google Workspace MCP.
                </p>
                {quirksForm.appEnvPath && (
                  <p className="mt-3 break-all text-xs text-zinc-500">Runtime env: {quirksForm.appEnvPath}</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-300">Internet Search</h3>
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Search Provider</p>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-surfaceAlt px-3 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                      value={quirksForm.searchProvider}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, searchProvider: event.target.value }))}
                    >
                      <option value="brave">Brave Search API</option>
                      <option value="duckduckgo">DuckDuckGo fallback</option>
                    </select>
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Brave Search API Key</p>
                    <Input
                      type={showQuirkSecrets ? "text" : "password"}
                      placeholder={quirksForm.braveSearchApiKeySet ? "Configured - enter a new key to replace it" : "BSA..."}
                      value={quirksForm.braveSearchApiKey}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, braveSearchApiKey: event.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">Recommended for Luna web search. DuckDuckGo remains available as a no-key fallback.</p>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-300">Outlook Mail</h3>
                    <p className="mt-1 text-sm text-zinc-400">Search Outlook mail through Microsoft Graph.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={quirksForm.outlookEnabled}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, outlookEnabled: event.target.checked }))}
                      className="h-4 w-4 rounded border-border bg-surfaceAlt accent-primary"
                    />
                    Enabled
                  </label>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">Tenant</p>
                      <Input
                        placeholder="common, organizations, consumers, or tenant ID"
                        value={quirksForm.outlookTenantId}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, outlookTenantId: event.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">Timeout Seconds</p>
                      <Input
                        value={quirksForm.outlookTimeoutSeconds}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, outlookTimeoutSeconds: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Application Client ID</p>
                    <Input
                      placeholder="Microsoft Entra application client ID"
                      value={quirksForm.outlookClientId}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, outlookClientId: event.target.value }))}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">Client Secret</p>
                      <Input
                        type={showQuirkSecrets ? "text" : "password"}
                        placeholder={quirksForm.outlookClientSecretSet ? "Configured - enter new value" : "Optional for public desktop apps"}
                        value={quirksForm.outlookClientSecret}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, outlookClientSecret: event.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">Refresh Token</p>
                      <Input
                        type={showQuirkSecrets ? "text" : "password"}
                        placeholder={quirksForm.outlookRefreshTokenSet ? "Configured - enter new value" : "OAuth refresh token"}
                        value={quirksForm.outlookRefreshToken}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, outlookRefreshToken: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Access Token</p>
                    <Input
                      type={showQuirkSecrets ? "text" : "password"}
                      placeholder={quirksForm.outlookAccessTokenSet ? "Configured - enter new value" : "Optional short-lived Graph bearer token"}
                      value={quirksForm.outlookAccessToken}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, outlookAccessToken: event.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      A refresh token is preferred so Luna can renew Graph access automatically.
                    </p>
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Scopes</p>
                    <Input
                      value={quirksForm.outlookScopes}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, outlookScopes: event.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Read/write/send needs Mail.Read, Mail.ReadWrite, Mail.Send, and offline_access.
                    </p>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-300">Google Workspace MCP</h3>
                    <p className="mt-1 text-sm text-zinc-400">Use the local Google Workspace MCP package. The official remote MCP remains available but is preview-gated.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={quirksForm.googleWorkspaceMcpEnabled}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceMcpEnabled: event.target.checked }))}
                      className="h-4 w-4 rounded border-border bg-surfaceAlt accent-primary"
                    />
                    Enabled
                  </label>
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">MCP Mode</p>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-surfaceAlt px-3 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                      value={quirksForm.googleWorkspaceMcpMode}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceMcpMode: event.target.value }))}
                    >
                      <option value="stdio">Local stdio MCP</option>
                      <option value="remote">Official Google remote MCP</option>
                    </select>
                    <p className="mt-1 text-xs text-zinc-500">
                      Stdio uses google-workspace-mcp locally. Remote uses Google's gated Developer Preview endpoints.
                    </p>
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Legacy MCP Command</p>
                    <Input
                      placeholder="uvx"
                      value={quirksForm.googleWorkspaceMcpCommand}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceMcpCommand: event.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Legacy MCP Arguments</p>
                    <Input
                      placeholder="[&quot;--from&quot;,&quot;google-workspace-mcp&quot;,&quot;google-workspace-worker&quot;,&quot;--transport&quot;,&quot;stdio&quot;]"
                      value={quirksForm.googleWorkspaceMcpArgs}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceMcpArgs: event.target.value }))}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">Timeout Seconds</p>
                      <Input
                        value={quirksForm.googleWorkspaceMcpTimeoutSeconds}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceMcpTimeoutSeconds: event.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">Allowed Tools</p>
                      <Input
                        placeholder="Comma-separated, blank exposes all"
                        value={quirksForm.googleWorkspaceMcpAllowedTools}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceMcpAllowedTools: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">OAuth Client ID</p>
                    <Input
                      placeholder="client-id.apps.googleusercontent.com"
                      value={quirksForm.googleWorkspaceClientId}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceClientId: event.target.value }))}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">OAuth Client Secret</p>
                      <Input
                        type={showQuirkSecrets ? "text" : "password"}
                        placeholder={quirksForm.googleWorkspaceClientSecretSet ? "Configured - enter new value" : "Client secret"}
                        value={quirksForm.googleWorkspaceClientSecret}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceClientSecret: event.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <p className="mb-1 text-sm text-zinc-200">Refresh Token</p>
                      <Input
                        type={showQuirkSecrets ? "text" : "password"}
                        placeholder={quirksForm.googleWorkspaceRefreshTokenSet ? "Configured - enter new value" : "OAuth refresh token"}
                        value={quirksForm.googleWorkspaceRefreshToken}
                        onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceRefreshToken: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Access Token</p>
                    <Input
                      type={showQuirkSecrets ? "text" : "password"}
                      placeholder={quirksForm.googleWorkspaceAccessTokenSet ? "Configured - enter new value" : "Optional short-lived bearer token"}
                      value={quirksForm.googleWorkspaceAccessToken}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceAccessToken: event.target.value }))}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Luna can use a refresh token with client ID/secret to get access tokens automatically.
                    </p>
                  </label>
                  <label className="block">
                    <p className="mb-1 text-sm text-zinc-200">Enabled Capabilities</p>
                    <Input
                      value={quirksForm.googleWorkspaceEnabledCapabilities}
                      onChange={(event) => setQuirksForm((form) => ({ ...form, googleWorkspaceEnabledCapabilities: event.target.value }))}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setShowQuirkSecrets((value) => !value)}
                    type="button"
                  >
                    {showQuirkSecrets ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {showQuirkSecrets ? "Hide Secrets" : "Show Secrets"}
                  </Button>
                  <Button
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600"
                    onClick={() => void saveQuirks()}
                    disabled={savingQuirks}
                  >
                    {savingQuirks ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Quirks & Restart Luna"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {active === "runtime" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Luna Setup</h2>
                    <p className="mt-1 text-sm text-zinc-400">Google realtime credentials are stored locally for the Luna sidecar.</p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1a1a1a] px-3 py-1 text-xs">
                      <span className={`h-2 w-2 rounded-full ${lunaSetup?.hasGoogleApiKey ? "bg-green-400" : "bg-zinc-500"}`} />
                      {lunaSetup?.hasGoogleApiKey ? "Google API key configured" : "Google API key missing"}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-1 text-sm text-zinc-200">Google API Key</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Input
                        type={showLunaApiKey ? "text" : "password"}
                        placeholder={lunaSetup?.hasGoogleApiKey ? "Enter a new key to replace the saved one" : "AIza..."}
                        value={lunaApiKeyDraft}
                        onChange={(e) => setLunaApiKeyDraft(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                        onClick={() => setShowLunaApiKey((v) => !v)}
                        type="button"
                        aria-label={showLunaApiKey ? "Hide Luna API key" : "Show Luna API key"}
                      >
                        {showLunaApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button
                      className="bg-indigo-500 hover:bg-indigo-600"
                      onClick={() => void saveLunaKey()}
                      disabled={savingLunaKey}
                    >
                      {savingLunaKey ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Restart"}
                    </Button>
                  </div>
                  {lunaSetup?.appEnvPath && (
                    <p className="mt-2 break-all text-xs text-zinc-500">Runtime env: {lunaSetup.appEnvPath}</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-xl font-semibold">Runtime Services</h2>
                <p className="mt-1 text-sm text-zinc-400">Quasar manages local LiveKit and Luna in the background.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <RuntimeServiceCard
                  name="Local Server"
                  state={runtimeStatus?.livekit.state ?? "stopped"}
                  pid={runtimeStatus?.livekit.pid}
                  error={runtimeStatus?.livekit.lastError}
                />
                <RuntimeServiceCard
                  name="Luna"
                  state={runtimeStatus?.luna.state ?? "stopped"}
                  pid={runtimeStatus?.luna.pid}
                  error={runtimeStatus?.luna.lastError}
                />
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    onClick={() => void runRuntimeAction("Restart Luna", restartLuna)}
                    disabled={runtimeBusy !== null}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Restart Luna
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void runRuntimeAction("Restart Local Server", restartLiveKit)}
                    disabled={runtimeBusy !== null}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Restart Local Server
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void runRuntimeAction("Open logs", openLogsFolder)}
                    disabled={runtimeBusy !== null}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Open Logs
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void copyRuntimeDiagnostics()}
                    disabled={runtimeBusy !== null}
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    Copy Diagnostics
                  </Button>
                </div>
                {runtimeStatus?.logsDir && (
                  <p className="mt-4 break-all text-xs text-zinc-500">{runtimeStatus.logsDir}</p>
                )}
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

function RuntimeServiceCard({
  name,
  state,
  pid,
  error
}: {
  name: string;
  state: string;
  pid?: number | null;
  error?: string | null;
}) {
  const stateColor =
    state === "running" ? "bg-green-400" : state === "failed" ? "bg-red-400" : state === "starting" ? "bg-amber-300" : "bg-zinc-500";

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-100">{name}</p>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#1a1a1a] px-2.5 py-1 text-xs text-zinc-300">
          <span className={`h-2 w-2 rounded-full ${stateColor}`} />
          {state}
        </span>
      </div>
      <p className="mt-3 text-xs text-zinc-500">PID: {pid ?? "not running"}</p>
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </div>
  );
}
