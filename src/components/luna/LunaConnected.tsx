import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Terminal, X, XCircle } from "lucide-react";
import { AgentAudioVisualizerGrid } from "@/components/agents/agent-audio-visualizer-grid";
import { ChatPanel } from "@/components/luna/ChatPanel";
import { ControlBar } from "@/components/luna/ControlBar";
import { useGlobalAgentState } from "@/components/luna/GlobalAgentState";
import { useLunaRuntime } from "@/components/luna/LunaRuntimeContext";
import { MatrixBoard } from "@/components/luna/MatrixBoard";
import {
  type QuirkAntigravityLog,
  type QuirkAntigravityTask,
  useQuirkAntigravity,
} from "@/components/luna/QuirkAntigravityContext";

type LogView = "output" | "diagnostics" | "all";

interface TaskWidgetProps {
  task: QuirkAntigravityTask;
  containerRef: RefObject<HTMLDivElement | null>;
  index: number;
  onDismiss: () => void;
  onKill: (taskId: string) => void;
}

function TaskWidget({ task, containerRef, index, onDismiss, onKill }: TaskWidgetProps) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const [logView, setLogView] = useState<LogView>("all");
  const [now, setNow] = useState(() => Date.now());

  const visibleLogs = useMemo(() => filterLogs(task.logs, logView), [logView, task.logs]);
  const statusMeta = getStatusMeta(task.status);
  const elapsed = useMemo(() => elapsedSeconds(task, now), [now, task]);

  useEffect(() => {
    if (task.status !== "running") return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [task.status]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [visibleLogs]);

  const initialStyle = useMemo(() => {
    const offset = index * 44;
    return {
      top: `${96 + offset}px`,
      left: `${96 + offset}px`,
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
      className="absolute z-30 flex w-[28rem] cursor-grab select-none flex-col gap-3 rounded-lg border border-white/10 bg-[#0d0d10]/95 p-4 text-xs text-zinc-100 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-colors hover:border-indigo-500/30 active:cursor-grabbing"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-2 text-indigo-300">
          <Terminal className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold uppercase tracking-wide">Quirk Antigravity</span>
        </div>
        <button
          onClick={onDismiss}
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          title="Dismiss widget"
          aria-label="Dismiss widget"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Task</span>
        <p className="line-clamp-2 text-sm font-medium leading-relaxed text-zinc-200">{task.title}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className={`flex items-center gap-1.5 font-medium ${statusMeta.textClass}`}>
            {statusMeta.icon}
            {statusMeta.label}
          </span>
          <span className="font-mono text-zinc-500">{formatElapsed(elapsed)}</span>
        </div>
        {task.status === "running" && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800/60">
            <motion.div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.min((elapsed / 600) * 100, 100)}%` }}
              transition={{ ease: "linear" }}
            />
          </div>
        )}
      </div>

      <div className="inline-flex w-full rounded-lg border border-white/10 bg-black/30 p-1">
        {(["all", "output", "diagnostics"] as const).map((view) => (
          <button
            key={view}
            onClick={() => setLogView(view)}
            className={`flex-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
              logView === view ? "bg-indigo-500/25 text-indigo-100" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {view === "all" ? "All" : view === "output" ? "Output" : "Diagnostics"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <Terminal className="h-3 w-3" /> Logs
        </span>
        <div
          ref={consoleRef}
          className="flex h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border border-white/5 bg-black/95 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
        >
          {visibleLogs.length > 0 ? (
            visibleLogs.map((log) => (
              <div key={log.id} className={`whitespace-pre-wrap break-words ${logClass(log)}`}>
                <span className="mr-1.5 select-none font-sans font-bold text-indigo-500/70">
                  {streamLabel(log.stream)}
                </span>
                {log.line}
              </div>
            ))
          ) : (
            <div className="text-zinc-600">
              {task.status === "running" ? "Waiting for Antigravity stream..." : "No logs for this view."}
            </div>
          )}
        </div>
      </div>

      {task.output && (
        <div className="max-h-24 overflow-y-auto rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
          {task.output}
        </div>
      )}
      {task.error && (
        <div className="max-h-24 overflow-y-auto rounded-lg border border-red-900/40 bg-red-950/20 p-3 font-mono text-[10px] leading-relaxed text-red-300">
          {task.error}
        </div>
      )}

      {task.status === "running" && (
        <div className="flex justify-end">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onKill(task.id);
            }}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-red-400 transition-all hover:border-red-500/35 hover:bg-red-500/20 hover:text-red-300 active:bg-red-500/35"
          >
            <XCircle className="h-2.5 w-2.5" />
            <span>Terminate</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function LunaConnected() {
  const { connectionState } = useLunaRuntime();
  const containerRef = useRef<HTMLDivElement>(null);
  const { agentState, agentMicTrack, userMicTrack } = useGlobalAgentState();
  const { tasks, dismissTask, killTask } = useQuirkAntigravity();
  const [showTranscript, setShowTranscript] = useState(false);
  const [mode, setMode] = useState<"voice" | "matrix">("voice");

  const visualState = connectionState === "connected" ? agentState : "idle";

  return (
    <div className="flex h-[calc(100vh-40px)]">
      <section
        ref={containerRef}
        className={`relative flex flex-col bg-[#0a0a0a] transition-all duration-200 ${showTranscript ? "w-3/5" : "w-full"}`}
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
              onToggleTranscript={() => setShowTranscript((value) => !value)}
            />
          </>
        ) : (
          <div className="min-h-0 flex-1 px-6 pb-6">
            <MatrixBoard />
          </div>
        )}

        <AnimatePresence>
          {mode === "matrix" &&
            tasks.map((task, index) => (
              <TaskWidget
                key={task.id}
                task={task}
                containerRef={containerRef}
                index={index}
                onDismiss={() => dismissTask(task.id)}
                onKill={(taskId) => {
                  void killTask(taskId);
                }}
              />
            ))}
        </AnimatePresence>
      </section>
      <section
        className={`border-l border-[#222222] bg-[#111111] transition-all duration-200 ${
          showTranscript ? "w-2/5 opacity-100" : "pointer-events-none w-0 overflow-hidden border-l-0 opacity-0"
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

function filterLogs(logs: QuirkAntigravityLog[], view: LogView): QuirkAntigravityLog[] {
  if (view === "all") return logs;
  if (view === "diagnostics") {
    return logs.filter((log) => log.stream === "diagnostic" || log.stream === "lifecycle");
  }
  return logs.filter((log) => log.stream === "stdout" || log.stream === "stderr");
}

function elapsedSeconds(task: QuirkAntigravityTask, now: number): number {
  const end = task.status === "running" ? now : task.endedAt ?? now;
  return Math.max(0, Math.floor((end - task.startedAt) / 1000));
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getStatusMeta(status: QuirkAntigravityTask["status"]) {
  if (status === "success") {
    return {
      label: "Completed",
      textClass: "text-emerald-400",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
    };
  }
  if (status === "cancelled") {
    return {
      label: "Cancelled",
      textClass: "text-amber-400",
      icon: <XCircle className="h-3.5 w-3.5 text-amber-400" />,
    };
  }
  if (status === "error") {
    return {
      label: "Failed",
      textClass: "text-red-400",
      icon: <XCircle className="h-3.5 w-3.5 text-red-400" />,
    };
  }
  return {
    label: "Running",
    textClass: "text-indigo-400",
    icon: <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />,
  };
}

function logClass(log: QuirkAntigravityLog): string {
  if (log.stream === "stderr") return "text-red-300";
  if (log.stream === "diagnostic") return "text-cyan-300";
  if (log.stream === "lifecycle") return "text-indigo-300";
  return "text-zinc-300";
}

function streamLabel(stream: QuirkAntigravityLog["stream"]): string {
  if (stream === "stderr") return "err";
  if (stream === "diagnostic") return "diag";
  if (stream === "lifecycle") return "sys";
  return "out";
}
