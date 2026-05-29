import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

type AgentConfig = {
  livekit_url: string;
  livekit_api_key: string;
  room_name: string;
  agent_name: string;
  is_configured: boolean;
  popup_transparency: number;
  mute_shortcut: string;
};

type SaveAgentConfigPayload = {
  livekit_url: string;
  livekit_api_key: string;
  livekit_api_secret: string;
  room_name: string;
  agent_name: string;
};

type AgentStore = AgentConfig & {
  is_connected: boolean;
  loadConfig: (sessionToken: string) => Promise<AgentConfig>;
  saveConfig: (sessionToken: string, payload: SaveAgentConfigPayload) => Promise<void>;
  updateSettings: (settings: Partial<Pick<AgentConfig, "popup_transparency" | "mute_shortcut">>) => void;
  setConnected: (val: boolean) => void;
};

const defaults: AgentConfig = {
  livekit_url: "",
  livekit_api_key: "",
  room_name: "luna-room",
  agent_name: "gemini_voice_agent",
  is_configured: false,
  popup_transparency: 0.8,
  mute_shortcut: "Alt+M"
};

export const useAgentStore = create<AgentStore>((set, get) => ({
  ...defaults,
  is_connected: false,
  loadConfig: async (sessionToken) => {
    const config = await invoke<AgentConfig>("load_agent_config", { sessionToken });
    set({ ...config, is_connected: get().is_connected });
    return config;
  },
  saveConfig: async (sessionToken, payload) => {
    await invoke("save_agent_config", { sessionToken, payload });
    set({
      livekit_url: payload.livekit_url,
      livekit_api_key: payload.livekit_api_key,
      room_name: payload.room_name,
      agent_name: payload.agent_name,
      is_configured:
        payload.livekit_url.trim().length > 0 &&
        payload.livekit_api_key.trim().length > 0 &&
        payload.livekit_api_secret.trim().length > 0
    });
  },
  updateSettings: (settings) => set((s) => ({ ...s, ...settings })),
  setConnected: (val) => set({ is_connected: val })
}));
