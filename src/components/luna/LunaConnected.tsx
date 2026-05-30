import { useState, useEffect, useRef, useMemo } from "react";
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
  id: string;
  task: string;
  status: "running" | "success" | "error";
  logs: string[];
  output?: string;
  error?: string;
  startTime?: number;
}

interface TaskWidgetProps {
  task: ActiveTaskState;
  containerRef: React.RefObject<HTMLDivElement>;
  index: number;
  onDismiss: () => void;
}

function TaskWidget({ task, containerRef, index, onDismiss }: TaskWidgetProps) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Auto-scroll logs to bottom in real-time
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [task.logs]);

  // Handle 10-minute (600s) timeout counting
  useEffect(() => {
    if (task.status !== "running") {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - (task.startTime ?? Date.now())) / 1000);
      setElapsed(Math.min(sec, 600));
    }, 1000);

    return () => clearInterval(interval);
  }, [task]);

  // Staggered initial spawn offsets
  const initialStyle = useMemo(() => {
    const offset = index * 45;
    return {
      top: `${100 + offset}px`,
      left: `${100 + offset}px`,
    };
  }, [index]);

  return (
    <motion.div
      drag
      dragConstraints={containerRef}
      dragElastic={0.15}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={initialStyle}
      className="absolute w-96 z-25 bg-[#0d0d10]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-zinc-100 flex flex-col gap-3 font-sans text-xs select-none cursor-grab active:cursor-grabbing hover:border-indigo-500/30 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-2 text-indigo-400 font-medium">
          <Shield className="h-3.5 w-3.5 animate-pulse" />
          <span className="font-semibold tracking-wide uppercase text-[10px]">Antigravity Delegate</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-zinc-500 hover:text-zinc-300 transition-colors rounded p-0.5 hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Task Details */}
      <div className="flex flex-col gap-1">
        <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Active Task</span>
        <p className="text-zinc-200 font-medium line-clamp-2 leading-relaxed text-sm">{task.task}</p>
      </div>

      {/* Status & Countdown Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5 font-medium">
            {task.status === "running" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                <span className="text-indigo-400">Running Task...</span>
              </>
            ) : task.status === "success" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Completed</span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-red-400" />
                <span className="text-red-400 font-medium">Failed</span>
              </>
            )}
          </span>
          {task.status === "running" && (
            <span className="font-mono text-zinc-500">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / 10:00
            </span>
          )}
        </div>

        {task.status === "running" && (
          <div className="w-full bg-zinc-800/60 h-1 rounded-full overflow-hidden">
            <motion.div
              className="bg-indigo-500 h-full rounded-full"
              style={{ width: `${(elapsed / 600) * 100}%` }}
              transition={{ ease: "linear" }}
            />
          </div>
        )}
      </div>

      {/* Console Logs */}
      {task.logs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
            <Terminal className="h-3 w-3" /> Console Output
          </span>
          <div 
            ref={consoleRef}
            className="bg-black/95 rounded-xl p-3 font-mono text-[10px] text-zinc-300 h-32 overflow-y-auto border border-white/5 flex flex-col gap-1.5 leading-relaxed"
          >
            {task.logs.map((log, index) => (
              <div key={index} className="break-all whitespace-pre-wrap">
                <span className="text-indigo-400/85 mr-1.5 font-sans font-bold select-none">$</span>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result Displayers */}
      {task.status === "success" && task.output && (
        <div className="flex flex-col gap-1.5">
          <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Output Summary</span>
          <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3 font-mono text-[10px] text-emerald-300 max-h-24 overflow-y-auto leading-relaxed">
            {task.output}
          </div>
        </div>
      )}
      {task.status === "error" && task.error && (
        <div className="flex flex-col gap-1.5">
          <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Failure Error</span>
          <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-3 font-mono text-[10px] text-red-300 max-h-24 overflow-y-auto leading-relaxed">
            {task.error}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function LunaConnected() {
  const { connectionState } = useLunaRuntime();
  const containerRef = useRef<HTMLDivElement>(null);
  const room = useRoomContext();
  const { agentState, agentMicTrack, userMicTrack } = useGlobalAgentState();
  const [showTranscript, setShowTranscript] = useState(false);
  const [mode, setMode] = useState<"voice" | "matrix">("voice");
  const [tasks, setTasks] = useState<Record<string, ActiveTaskState>>({});
  const [dismissedTasks, setDismissedTasks] = useState<Record<string, boolean>>({});

  const visualState = connectionState === "connected" ? agentState : "idle";

  // Monitor LiveKit data channel messages for multiple task streams
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const parsed = JSON.parse(text);

        if (parsed.type === "antigravity_task_status") {
          const taskId = parsed.task_id;
          if (!taskId) return;

          if (parsed.status === "running") {
            // Re-enable visibility of this specific task widget
            setDismissedTasks((prev) => ({ ...prev, [taskId]: false }));
            setTasks((prev) => ({
              ...prev,
              [taskId]: {
                id: taskId,
                task: parsed.task,
                status: "running",
                logs: [],
                startTime: Date.now()
              }
            }));
          } else {
            setTasks((prev) => {
              if (!prev[taskId]) return prev;
              return {
                ...prev,
                [taskId]: {
                  ...prev[taskId],
                  status: parsed.status,
                  output: parsed.output || undefined,
                  error: parsed.error || undefined
                }
              };
            });
          }
        } else if (parsed.type === "antigravity_task_log") {
          const taskId = parsed.task_id;
          if (!taskId) return;

          setTasks((prev) => {
            if (!prev[taskId]) return prev;
            return {
              ...prev,
              [taskId]: {
                ...prev[taskId],
                logs: [...prev[taskId].logs.slice(-99), parsed.log] // Keep last 100 log lines
              }
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

        {/* Antigravity Progress Widgets (rendered only when in Mesh Mode, allowing multiple concurrent widgets) */}
        <AnimatePresence>
          {mode === "matrix" && Object.values(tasks)
            .filter((t) => !dismissedTasks[t.id])
            .map((task, index) => (
              <TaskWidget
                key={task.id}
                task={task}
                containerRef={containerRef}
                index={index}
                onDismiss={() => setDismissedTasks((prev) => ({ ...prev, [task.id]: true }))}
              />
            ))
          }
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
