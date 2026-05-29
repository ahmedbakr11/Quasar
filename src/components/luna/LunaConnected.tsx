import { useState } from "react";
import { AgentAudioVisualizerGrid } from "@/components/agents/agent-audio-visualizer-grid";
import { ChatPanel } from "@/components/luna/ChatPanel";
import { ControlBar } from "@/components/luna/ControlBar";
import { MatrixBoard } from "@/components/luna/MatrixBoard";
import { useGlobalAgentState } from "@/components/luna/GlobalAgentState";

import { useLunaRuntime } from "@/components/luna/LunaRuntimeContext";

export function LunaConnected() {
  const { connectionState } = useLunaRuntime();
  const { agentState, agentMicTrack, userMicTrack } = useGlobalAgentState();
  const [showTranscript, setShowTranscript] = useState(false);
  const [mode, setMode] = useState<"voice" | "matrix">("voice");

  const visualState = connectionState === "connected" ? agentState : "idle";

  return (
    <div className="flex h-[calc(100vh-40px)]">
      <section className={`flex flex-col bg-[#0a0a0a] transition-all duration-200 ${showTranscript ? "w-3/5" : "w-full"}`}>
        <div className="px-6 pb-2 pt-4">
          <div className="inline-flex rounded-xl border border-white/10 bg-[#141417] p-1">
            <button
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${mode === "voice" ? "bg-indigo-500/25 text-indigo-200" : "text-zinc-400 hover:text-zinc-100"}`}
              onClick={() => setMode("voice")}
            >
              Voice
            </button>
            <button
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${mode === "matrix" ? "bg-indigo-500/25 text-indigo-200" : "text-zinc-400 hover:text-zinc-100"}`}
              onClick={() => {
                setMode("matrix");
                setShowTranscript(false);
              }}
            >
              Mesh Mode
            </button>
          </div>
        </div>

        {mode === "voice" ? (
          <>
            <div className="flex h-[65%] w-full items-center justify-center px-10">
              <AgentAudioVisualizerGrid
                rowCount={15}
                columnCount={15}
                color={visualState === "speaking" ? "#6366f1" : visualState === "listening" ? "#818cf8" : "#8b8d98"}
                radius={3}
                interval={100}
                audioTrack={visualState === "speaking" ? agentMicTrack : userMicTrack}
                state={visualState}
                className="mx-auto w-full max-w-[540px]"
              />
            </div>
            <ControlBar
              showTranscript={showTranscript}
              onToggleTranscript={() => setShowTranscript((v) => !v)}
            />
          </>
        ) : (
          <div className="min-h-0 flex-1 px-6 pb-6">
            <MatrixBoard />
          </div>
        )}
      </section>
      <section
        className={`border-l border-[#222222] bg-[#111111] transition-all duration-200 ${
          showTranscript ? "w-2/5 opacity-100" : "w-0 overflow-hidden border-l-0 opacity-0 pointer-events-none"
        }`}
        aria-hidden={!showTranscript}
      >
        <div className="h-full min-w-0">
          <ChatPanel />
        </div>
      </section>
    </div>
  );
}
