import { MessageSquare, MessageSquareOff, Mic, MicOff, PhoneOff, ScreenShare, ScreenShareOff } from "lucide-react";
import { useAgent, useConnectionState, useLocalParticipant } from "@livekit/components-react";
import { toast } from "sonner";

type Props = {
  onDisconnect: () => void;
  showTranscript: boolean;
  onToggleTranscript: () => void;
};

function getMicErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name?: string }).name);
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Microphone permission denied. Allow microphone access, then try again.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone device found.";
    }
  }
  return err instanceof Error ? err.message : "Microphone toggle failed";
}

function getScreenShareErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name?: string }).name);
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Screen-share permission denied. Allow screen capture and try again.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No shareable screen source was found.";
    }
    if (name === "AbortError") {
      return "Screen-share was canceled.";
    }
    if (name === "NotSupportedError") {
      return "Screen-share is not supported in this environment.";
    }
  }
  return err instanceof Error ? err.message : "Screen-share toggle failed";
}

function normalizeAgentState(state: string) {
  const lower = state.toLowerCase();
  if (lower.includes("listening")) return { label: "Listening", cls: "bg-indigo-500/20 text-indigo-200" };
  if (lower.includes("thinking")) return { label: "Thinking", cls: "bg-amber-500/20 text-amber-200" };
  if (lower.includes("speaking")) return { label: "Speaking", cls: "bg-green-500/20 text-green-200" };
  return { label: "Idle", cls: "bg-[#333333] text-zinc-300" };
}

export function ControlBar({ onDisconnect, showTranscript, onToggleTranscript }: Props) {
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const agent = useAgent();
  const connectionState = useConnectionState();
  const pill = normalizeAgentState(agent.state);
  const isConnected = connectionState === "connected";

  return (
    <div className="mt-6 flex items-center justify-center gap-4">
      <button
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-200 ease-out hover:scale-110 active:scale-95 ${
          isMicrophoneEnabled ? "bg-surfaceAlt text-text" : "border border-red-500/40 bg-red-500/20 text-red-400"
        }`}
        onClick={() => void (async () => {
          try {
            await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
          } catch (err) {
            toast.error(getMicErrorMessage(err));
          }
        })()}
        disabled={!isConnected}
      >
        {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      <button
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-200 ease-out hover:scale-110 active:scale-95 ${
          isScreenShareEnabled ? "bg-indigo-500/20 text-indigo-200" : "bg-surfaceAlt text-text"
        }`}
        onClick={() => void (async () => {
          try {
            await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
          } catch (err) {
            toast.error(getScreenShareErrorMessage(err));
          }
        })()}
        disabled={!isConnected}
        title={isScreenShareEnabled ? "Stop screen share" : "Start screen share"}
      >
        {isScreenShareEnabled ? <ScreenShareOff size={18} /> : <ScreenShare size={18} />}
      </button>
      <button
        className="flex h-12 w-12 items-center justify-center rounded-full bg-surfaceAlt text-text transition-colors hover:bg-[#2a2a2a]"
        onClick={onToggleTranscript}
        title={showTranscript ? "Hide transcript" : "Show transcript"}
      >
        {showTranscript ? <MessageSquare size={18} /> : <MessageSquareOff size={18} />}
      </button>
      <button
        className="flex h-12 w-12 items-center justify-center rounded-full bg-surfaceAlt text-text hover:bg-red-500/20 hover:text-red-400"
        onClick={onDisconnect}
      >
        <PhoneOff size={18} />
      </button>
      <div className={`rounded-full px-3 py-1 text-xs ${pill.cls}`}>{pill.label}</div>
    </div>
  );
}
