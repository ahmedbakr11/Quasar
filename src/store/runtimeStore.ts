import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

export type RuntimeServiceState = "stopped" | "starting" | "running" | "failed";

export type ServiceStatus = {
  name: string;
  state: RuntimeServiceState;
  pid?: number | null;
  restartCount: number;
  lastError?: string | null;
  logPath: string;
};

export type RuntimeStatus = {
  livekit: ServiceStatus;
  luna: ServiceStatus;
  logsDir: string;
  livekitUrl: string;
  roomName: string;
  agentName: string;
};

export type RuntimeEvent = {
  message: string;
  status: RuntimeStatus;
};

export type DiagnosticSnapshot = {
  appVersion: string;
  os: string;
  status: RuntimeStatus;
  recentLogs: string[];
};

type RuntimeStore = {
  status?: RuntimeStatus;
  startupMessage: string;
  lastMessage?: string;
  isListening: boolean;
  loadStatus: () => Promise<RuntimeStatus>;
  restartLuna: () => Promise<RuntimeStatus>;
  restartLiveKit: () => Promise<RuntimeStatus>;
  openLogsFolder: () => Promise<void>;
  copyDiagnostics: () => Promise<DiagnosticSnapshot>;
  startListeners: () => Promise<void>;
};

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  startupMessage: "Starting Quasar",
  isListening: false,
  loadStatus: async () => {
    const status = await invoke<RuntimeStatus>("get_runtime_status");
    set({ status });
    return status;
  },
  restartLuna: async () => {
    const status = await invoke<RuntimeStatus>("restart_luna");
    set({ status });
    return status;
  },
  restartLiveKit: async () => {
    const status = await invoke<RuntimeStatus>("restart_livekit");
    set({ status });
    return status;
  },
  openLogsFolder: () => invoke("open_logs_folder"),
  copyDiagnostics: () => invoke<DiagnosticSnapshot>("copy_diagnostics"),
  startListeners: async () => {
    if (get().isListening) return;
    set({ isListening: true });

    await listen<RuntimeEvent>("quasar://startup-progress", (event) => {
      set({
        startupMessage: event.payload.message,
        lastMessage: event.payload.message,
        status: event.payload.status
      });
    });

    await listen<RuntimeEvent>("quasar://runtime-status", (event) => {
      set({
        lastMessage: event.payload.message,
        status: event.payload.status
      });
      notifyRuntime(event.payload.message);
    });
  }
}));

function notifyRuntime(message: string) {
  if (!("Notification" in window)) return;

  const send = () => {
    try {
      new Notification("Quasar", { body: message });
    } catch {
      // Notification support depends on the current WebView runtime.
    }
  };

  if (Notification.permission === "granted") {
    send();
    return;
  }

  if (Notification.permission !== "denied") {
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") send();
    });
  }
}
