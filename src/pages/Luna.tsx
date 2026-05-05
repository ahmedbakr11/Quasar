import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "@livekit/components-react";
import { TokenSource } from "livekit-client";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { AgentSessionProvider } from "@/components/agent-session-provider";
import { LunaConnected } from "@/components/luna/LunaConnected";
import { LunaConnecting } from "@/components/luna/LunaConnecting";
import { LunaDisconnected } from "@/components/luna/LunaDisconnected";
import { fetchLiveKitToken } from "@/lib/tokenFetcher";
import { useAgentStore } from "@/store/agentStore";
import { useAuthStore } from "@/store/authStore";

type ConnectionState = "disconnected" | "connecting" | "connected";

function getMicPermissionError(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name?: string }).name);
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Microphone permission denied. Enable microphone access for this app in Windows Privacy settings and site permissions.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone device found.";
    }
  }
  return err instanceof Error ? err.message : "Microphone access failed";
}

export default function Luna() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const isConfigured = useAgentStore((s) => s.is_configured);
  const livekitUrl = useAgentStore((s) => s.livekit_url);
  const agentName = useAgentStore((s) => s.agent_name);
  const setConnected = useAgentStore((s) => s.setConnected);
  const isStartingRef = useRef(false);
  const sessionRef = useRef<ReturnType<typeof useSession> | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");

  const transition = useMemo(() => ({ duration: 0.2 }), []);

  const tokenSource = useMemo(
    () =>
      TokenSource.custom(async () => {
        if (!sessionToken) {
          throw new Error("Not authenticated");
        }
        const participantToken = await fetchLiveKitToken(sessionToken);
        return {
          participantToken,
          serverUrl: livekitUrl
        };
      }),
    [livekitUrl, sessionToken]
  );

  const session = useSession(tokenSource, {
    agentName: agentName?.trim() || undefined
  });

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const lkState = session.connectionState;
    const connected =
      lkState === "connected" ||
      lkState === "reconnecting" ||
      lkState === "signalReconnecting";
    const connecting = lkState === "connecting";

    setConnected(connected);

    if (connected) {
      setConnectionState("connected");
      return;
    }
    if (connecting) {
      setConnectionState("connecting");
      return;
    }
    setConnectionState("disconnected");
  }, [session.connectionState, setConnected]);

  const connect = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setConnectionState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());

      await session.start({
        tracks: {
          microphone: {
            enabled: false,
            publishOptions: { preConnectBuffer: true }
          }
        }
      });
      setConnectionState("connected");
    } catch (err) {
      const message = getMicPermissionError(err);
      toast.error(message);
      setConnectionState("disconnected");
    } finally {
      isStartingRef.current = false;
    }
  }, [session]);

  const disconnect = useCallback(async () => {
    try {
      await session.end();
    } catch {
      // no-op
    } finally {
      setConnected(false);
      setConnectionState("disconnected");
    }
  }, [session, setConnected]);

  useEffect(() => {
    return () => {
      void sessionRef.current?.end();
      setConnected(false);
    };
  }, [setConnected]);

  if (!sessionToken) return <Navigate to="/login" replace />;

  return (
    <div className="h-[calc(100vh-40px)] bg-[#0a0a0a]">
      <AnimatePresence mode="wait">
        {connectionState === "disconnected" && (
          <motion.div
            key="disconnected"
            className="h-full"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={transition}
          >
            <LunaDisconnected
              isConfigured={isConfigured}
              onConnect={() => void connect()}
            />
          </motion.div>
        )}
        {connectionState === "connecting" && (
          <motion.div
            key="connecting"
            className="h-full"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={transition}
          >
            <LunaConnecting />
          </motion.div>
        )}
        {connectionState === "connected" && (
          <motion.div
            key="connected"
            className="h-full"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={transition}
          >
            <AgentSessionProvider session={session}>
              <LunaConnected onDisconnect={() => void disconnect()} />
            </AgentSessionProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
