import { useState } from "react";
import { useAgent } from "@livekit/components-react";
import { AgentAudioVisualizerGrid } from "@/components/agents/agent-audio-visualizer-grid";
import { ChatPanel } from "@/components/luna/ChatPanel";
import { ControlBar } from "@/components/luna/ControlBar";

type Props = {
  onDisconnect: () => void;
};

export function LunaConnected({ onDisconnect }: Props) {
  const agent = useAgent();
  const [showTranscript, setShowTranscript] = useState(true);

  return (
    <div className="flex h-[calc(100vh-40px)]">
      <section className={`flex flex-col items-center justify-center bg-[#0a0a0a] transition-all duration-200 ${showTranscript ? "w-3/5" : "w-full"}`}>
        <div className="flex h-[65%] w-full items-center justify-center px-10">
          <AgentAudioVisualizerGrid
            rowCount={15}
            columnCount={15}
            color="#6366f1"
            radius={3}
            interval={100}
            audioTrack={agent.microphoneTrack}
            state={agent.state}
            className="mx-auto w-full max-w-[540px]"
          />
        </div>
        <ControlBar
          onDisconnect={onDisconnect}
          showTranscript={showTranscript}
          onToggleTranscript={() => setShowTranscript((v) => !v)}
        />
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
