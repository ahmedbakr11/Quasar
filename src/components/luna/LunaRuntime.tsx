import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession, useLocalParticipant } from "@livekit/components-react";
import { TokenSource } from "livekit-client";
import { toast } from "sonner";
import { AgentSessionProvider } from "@/components/agent-session-provider";
import {
  LunaRuntimeContext,
  type LunaConnectionState
} from "@/components/luna/LunaRuntimeContext";
import { fetchLiveKitToken } from "@/lib/tokenFetcher";
import { useAgentStore } from "@/store/agentStore";
import { useAuthStore } from "@/store/authStore";

import { GlobalAgentStateProvider } from "@/components/luna/GlobalAgentState";
import { QuirkAntigravityProvider } from "@/components/luna/QuirkAntigravityContext";

type Props = {
  children: ReactNode;
};

export function LunaRuntime({ children }: Props) {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const isConfigured = useAgentStore((s) => s.is_configured);
  const livekitUrl = useAgentStore((s) => s.livekit_url);
  const agentName = useAgentStore((s) => s.agent_name);
  const muteShortcut = useAgentStore((s) => s.mute_shortcut);
  const loadConfig = useAgentStore((s) => s.loadConfig);
  const setConnected = useAgentStore((s) => s.setConnected);
  const [isStarting, setIsStarting] = useState(false);
  const [manuallyDisconnected, setManuallyDisconnected] = useState(false);
  const [autoConnectBlocked, setAutoConnectBlocked] = useState(false);
  const [connectCount, setConnectCount] = useState(0);
  const connectLockRef = useRef(false);
  const lastConnectAttemptRef = useRef(0);

  const tokenSource = useMemo(
    () => {
      void connectCount;
      return TokenSource.custom(async () => {
        if (!sessionToken) {
          throw new Error("Not authenticated");
        }
        const participantToken = await fetchLiveKitToken(sessionToken);
        return {
          participantToken,
          serverUrl: livekitUrl
        };
      });
    },
    [livekitUrl, sessionToken, connectCount]
  );

  const session = useSession(tokenSource, {
    agentName: agentName?.trim() || undefined
  });

  const connectionState = useMemo<LunaConnectionState>(() => {
    if (
      session.connectionState === "connected" ||
      session.connectionState === "reconnecting" ||
      session.connectionState === "signalReconnecting"
    ) {
      return "connected";
    }
    if (isStarting || session.connectionState === "connecting") return "connecting";
    return "disconnected";
  }, [isStarting, session.connectionState]);

  useEffect(() => {
    if (!sessionToken) return;
    void loadConfig(sessionToken).catch((err) => {
      const message = err instanceof Error ? err.message : "Failed to load Luna config";
      toast.error(message);
    });
  }, [loadConfig, sessionToken]);

  useEffect(() => {
    setConnected(connectionState === "connected");
  }, [connectionState, setConnected]);

  const connect = useCallback(async () => {
    if (!sessionToken || !isConfigured || connectLockRef.current) return;
    const now = Date.now();
    if (now - lastConnectAttemptRef.current < 1500) return;

    connectLockRef.current = true;
    lastConnectAttemptRef.current = now;
    setIsStarting(true);
    setAutoConnectBlocked(false);
    setManuallyDisconnected(false);
    setConnectCount((c) => c + 1);

    try {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (permErr) {
        console.warn("Microphone permission check failed:", permErr);
      }

      await session.start({
        tracks: {
          microphone: {
            enabled: false,
            publishOptions: { preConnectBuffer: true }
          }
        }
      });
    } catch (err) {
      setAutoConnectBlocked(true);
      setManuallyDisconnected(true);
      const message = err instanceof Error ? err.message : "Luna connection failed";
      toast.error(message);
    } finally {
      setIsStarting(false);
      connectLockRef.current = false;
    }
  }, [isConfigured, session, sessionToken]);

  const disconnect = useCallback(async () => {
    setManuallyDisconnected(true);
    setAutoConnectBlocked(true);
    try {
      await session.end();
    } catch {
      // no-op
    } finally {
      setConnected(false);
      setIsStarting(false);
    }
  }, [session, setConnected]);

  useEffect(() => {
    if (
      !sessionToken ||
      !isConfigured ||
      manuallyDisconnected ||
      autoConnectBlocked ||
      connectionState !== "disconnected"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void connect();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoConnectBlocked, connect, connectionState, isConfigured, manuallyDisconnected, sessionToken]);

  const value = useMemo(
    () => ({
      connectionState,
      isConfigured,
      isStarting,
      isManuallyDisconnected: manuallyDisconnected,
      autoConnectBlocked,
      connect,
      disconnect
    }),
    [autoConnectBlocked, connect, connectionState, disconnect, isConfigured, isStarting, manuallyDisconnected]
  );

  return (
    <LunaRuntimeContext.Provider value={value}>
      <AgentSessionProvider session={session}>
        <GlobalShortcutManager muteShortcut={muteShortcut} />
        <GlobalAgentStateProvider>
          <QuirkAntigravityProvider>
            {children}
          </QuirkAntigravityProvider>
        </GlobalAgentStateProvider>
      </AgentSessionProvider>
    </LunaRuntimeContext.Provider>
  );
}

function GlobalShortcutManager({ muteShortcut }: { muteShortcut: string }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const parts = muteShortcut.split("+").map((p) => p.toLowerCase());
      const needsAlt = parts.includes("alt");
      const needsCtrl = parts.includes("ctrl");
      const needsShift = parts.includes("shift");
      const key = parts.find((p) => p.length === 1);

      if (
        needsAlt === e.altKey &&
        needsCtrl === (e.ctrlKey || e.metaKey) &&
        needsShift === e.shiftKey &&
        key === e.key.toLowerCase()
      ) {
        e.preventDefault();
        void (async () => {
          try {
            await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
          } catch (err) {
            console.error("Failed to toggle microphone via shortcut:", err);
          }
        })();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMicrophoneEnabled, localParticipant, muteShortcut]);

  return null;
}
