import { useState, useEffect, useRef } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { AnimatePresence, motion } from "framer-motion";
import { Terminal, Shield, CheckCircle2, XCircle, X, Loader2 } from "lucide-react";
import { AgentAudioVisualizerGrid } from "@/components/agents/agent-audio-visualizer-grid";
import { ChatPanel } from "@/components/luna/ChatPanel";
import { ControlBar } from "@/components/luna/ControlBar";
import { MatrixBoard } from "@/components/luna/MatrixBoard";
import { useGlobalAgentState } from "@/components/luna/GlobalAgentState";
import { useLunaRuntime } from "@/components/luna/LunaRuntimeContext";

interface ActiveTaskState {
  task: string;
  status: "running" | "success" | "error";
  logs: string[];
  output?: string;
  error?: string;
  startTime?: number;
}

export function LunaConnected() {
  const { connectionState } = useLunaRuntime();
  const containerRef = useRef<HTMLDivElement>(null);
  const room = useRoomContext();
  const { agentState, agentMicTrack, userMicTrack } = useGlobalAgentState();
  const [showTranscript, setShowTranscript] = useState(false);
  const [mode, setMode] = useState<"voice" | "matrix">("voice");
  const [isDismissed, setIsDismissed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeTask, setActiveTask] = useState<ActiveTaskState | null>(null);

  const visualState = connectionState === "connected" ? agentState : "idle";

  // Monitor LiveKit data channel messages
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const parsed = JSON.parse(text);

        if (parsed.type === "antigravity_task_status") {
          if (parsed.status === "running") {
            setIsDismissed(false);
            setActiveTask({
              task: parsed.task,
              status: "running",
              logs: [],
              startTime: Date.now()
            });
          } else {
            setActiveTask((prev) => {
              if (!prev || prev.task !== parsed.task) return prev;
              return {
                ...prev,
                status: parsed.status,
                output: parsed.output || undefined,
                error: parsed.error || undefined
              };
            });
          }
        } else if (parsed.type === "antigravity_task_log") {
          setActiveTask((prev) => {
            if (!prev || prev.task !== parsed.task) return prev;
            return {
              ...prev,
              logs: [...prev.logs.slice(-49), parsed.log] // Keep last 50 log lines
            };
          });
        }
      } catch (e) {
        // Non-JSON or other event payload
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  // Handle 10-minute (600s) timeout counting
  useEffect(() => {
    if (!activeTask || activeTask.status !== "running") {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - (activeTask.startTime ?? Date.now())) / 1000);
      setElapsed(Math.min(sec, 600));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTask]);

  return (
    <div className="flex h-[calc(100vh-40px)]">
      <section 
        ref={containerRef}
        className={`flex flex-col bg-[#0a0a0a] transition-all duration-200 relative ${showTranscript ? "w-3/5" : "w-full"}`}
      >
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

        {/* Antigravity Progress Widget overlay (rendered on top of either Voice mode or Mesh Mode) */}
        <AnimatePresence>
          {activeTask && !isDismissed && (
            <motion.div
              drag
              dragConstraints={containerRef}
              dragElastic={0.1}
              dragMomentum={false}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-6 right-6 w-96 z-20 bg-zinc-950/85 backdrop-blur-lg border border-zinc-800 rounded-xl p-4 shadow-2xl text-zinc-100 flex flex-col gap-3 font-sans text-sm select-none cursor-grab active:cursor-grabbing"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2 text-indigo-400 font-medium">
                  <Shield className="h-4 w-4 animate-pulse" />
                  <span>Antigravity Delegate</span>
                </div>
                <button
                  onClick={() => setIsDismissed(true)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Task Details */}
              <div className="flex flex-col gap-1">
                <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Active Task</span>
                <p className="text-zinc-200 font-medium line-clamp-2 leading-snug">{activeTask.task}</p>
              </div>

              {/* Status and Progress */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    {activeTask.status === "running" ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                        <span className="text-indigo-400">Running Task...</span>
                      </>
                    ) : activeTask.status === "success" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Completed Successfully</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-red-400 font-medium">Task Failed</span>
                      </>
                    )}
                  </span>
                  {activeTask.status === "running" && (
                    <span className="font-mono text-zinc-500">
                      {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / 10:00
                    </span>
                  )}
                </div>

                {activeTask.status === "running" && (
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <motion.div
                      className="bg-indigo-500 h-full rounded-full"
                      style={{ width: `${(elapsed / 600) * 100}%` }}
                      transition={{ ease: "linear" }}
                    />
                  </div>
                )}
              </div>

              {/* Logs Console tail */}
              {activeTask.logs.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                    <Terminal className="h-3 w-3" /> Console Output
                  </span>
                  <div className="bg-zinc-900/90 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 h-28 overflow-y-auto border border-zinc-800/80 flex flex-col gap-1.5 leading-relaxed">
                    {activeTask.logs.map((log, index) => (
                      <div key={index} className="truncate">
                        <span className="text-indigo-400/80 mr-1.5 font-sans font-bold select-none">$</span>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Output/Error Viewers */}
              {activeTask.status === "success" && activeTask.output && (
                <div className="flex flex-col gap-1">
                  <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Output Summary</span>
                  <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-2.5 font-mono text-[11px] text-emerald-300 max-h-24 overflow-y-auto leading-relaxed">
                    {activeTask.output}
                  </div>
                </div>
              )}
              {activeTask.status === "error" && activeTask.error && (
                <div className="flex flex-col gap-1">
                  <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Failure Error</span>
                  <div className="bg-red-950/20 border border-red-900/40 rounded-lg p-2.5 font-mono text-[11px] text-red-300 max-h-24 overflow-y-auto leading-relaxed">
                    {activeTask.error}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
