import { format } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Loader2,
  Play,
  Pause,
  Zap,
  Mic,
  MicOff,
  PhoneOff,
  MessageSquare,
  ArrowUpRight,
  Check,
  AlarmClock,
  GripHorizontal
} from "lucide-react";
import { useEffect, useState, useRef, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { UserAvatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/authStore";
import { useTaskStore, type Task } from "@/store/taskStore";
import { useNoteStore, type Note } from "@/store/noteStore";
import { type UserProfile } from "@/lib/tauriCommands";
import { AgentAudioVisualizerGrid } from "@/components/agents/agent-audio-visualizer-grid";
import { useLunaRuntime } from "@/components/luna/LunaRuntimeContext";
import { useGlobalAgentState } from "@/components/luna/GlobalAgentState";
import { useLocalParticipant } from "@livekit/components-react";
import { motion, AnimatePresence } from "framer-motion";

// Greeting calculator
const getGreeting = (name: string) => {
  const hr = new Date().getHours();
  if (hr < 12) return `Good morning, ${name}`;
  if (hr < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
};

// 1. User Profile Card
function UserProfileCard({ user }: { user: UserProfile }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-br from-[#141417] to-[#111111] p-6 shadow-md relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
      <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-500" />
      
      <div className="flex items-start gap-4">
        <UserAvatar
          seed={user.avatar_seed ?? user.id}
          className="h-16 w-16 rounded-2xl border-2 border-indigo-500/30 shadow-md shadow-indigo-500/5 group-hover:border-indigo-500/70 transition-all"
        />
        <div>
          <h2 className="text-lg font-bold text-zinc-100 truncate max-w-[150px]">{user.display_name ?? user.username}</h2>
          <p className="text-xs text-indigo-400 font-medium mt-0.5">Space Voyager</p>
          <p className="text-[10px] text-zinc-500 truncate max-w-[150px] mt-1">{user.email ?? `@${user.username}`}</p>
        </div>
      </div>

      <div className="border-t border-white/5 pt-4 flex justify-between text-center">
        <div>
          <div className="text-xs text-zinc-500 font-medium">Rank</div>
          <div className="text-xs font-semibold text-zinc-200 mt-0.5">#{user.id.slice(0, 4).toUpperCase()}</div>
        </div>
        <div className="border-l border-white/5 h-8" />
        <div>
          <div className="text-xs text-zinc-500 font-medium">Tier</div>
          <div className="text-xs font-semibold text-indigo-400 mt-0.5">Explorer</div>
        </div>
        <div className="border-l border-white/5 h-8" />
        <div>
          <div className="text-xs text-zinc-500 font-medium">Account</div>
          <div className="text-xs font-semibold text-zinc-200 mt-0.5">Local</div>
        </div>
      </div>
      
      <Link
        to="/profile"
        className="flex items-center justify-between text-xs text-zinc-400 hover:text-indigo-300 bg-white/5 hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/20 px-3 py-2 rounded-xl transition-all duration-200 w-full mt-2 font-medium"
      >
        <span>Manage Profile</span>
        <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}

// 2. Stopwatch & Timer Card
function StopwatchCard() {
  const [mode, setMode] = useState<"stopwatch" | "timer">("stopwatch");
  
  // States for Stopwatch
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchTimerRef = useRef<number | null>(null);

  // States for Timer
  const [timerDuration, setTimerDuration] = useState(300); // 5 mins default
  const [timerTime, setTimerTime] = useState(300);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerTimerRef = useRef<number | null>(null);

  // Stopwatch ticking
  useEffect(() => {
    if (isStopwatchRunning) {
      stopwatchTimerRef.current = window.setInterval(() => {
        setStopwatchTime((t) => t + 1);
      }, 1000);
    } else {
      if (stopwatchTimerRef.current) {
        clearInterval(stopwatchTimerRef.current);
        stopwatchTimerRef.current = null;
      }
    }
    return () => {
      if (stopwatchTimerRef.current) clearInterval(stopwatchTimerRef.current);
    };
  }, [isStopwatchRunning]);

  // Timer ticking
  useEffect(() => {
    if (isTimerRunning) {
      timerTimerRef.current = window.setInterval(() => {
        setTimerTime((t) => {
          if (t <= 1) {
            setIsTimerRunning(false);
            if (timerTimerRef.current) clearInterval(timerTimerRef.current);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } else {
      if (timerTimerRef.current) {
        clearInterval(timerTimerRef.current);
        timerTimerRef.current = null;
      }
    }
    return () => {
      if (timerTimerRef.current) clearInterval(timerTimerRef.current);
    };
  }, [isTimerRunning]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleReset = () => {
    if (mode === "stopwatch") {
      setIsStopwatchRunning(false);
      setStopwatchTime(0);
    } else {
      setIsTimerRunning(false);
      setTimerTime(timerDuration);
    }
  };

  const adjustTimer = (amount: number) => {
    if (isTimerRunning) return;
    setTimerDuration((prev) => {
      const next = Math.max(60, Math.min(5940, prev + amount)); // Limit between 1m and 99m
      setTimerTime(next);
      return next;
    });
  };

  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  // Stopwatch values
  const stopwatchCurrentSecond = stopwatchTime % 60;
  const stopwatchStrokeDashoffset = circumference - (stopwatchCurrentSecond / 60) * circumference;

  // Timer values
  const timerCurrentSecond = timerTime % 60;
  const timerStrokeDashoffset = circumference - (timerTime / timerDuration) * circumference;

  const renderTicks = (currentVal: number, isResetState: boolean) => {
    const ticks = [];
    for (let i = 0; i < 60; i++) {
      const isVisible = isResetState ? true : i > currentVal;
      if (isVisible) {
        const angleRad = ((i * 6 - 90) * Math.PI) / 180;
        const x1 = 72 + (radius + 4) * Math.cos(angleRad);
        const y1 = 72 + (radius + 4) * Math.sin(angleRad);
        const x2 = 72 + (radius + 8) * Math.cos(angleRad);
        const y2 = 72 + (radius + 8) * Math.sin(angleRad);
        ticks.push(
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1"
          />
        );
      }
    }
    return ticks;
  };

  return (
    <div className="flex h-full min-h-[240px] flex-col justify-between rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-md relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
      <AnimatePresence mode="wait" initial={false}>
        {mode === "stopwatch" ? (
          <motion.div
            key="stopwatch"
            initial={{ x: -150, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 150, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex-1 flex flex-col justify-between h-full w-full"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-tight text-zinc-100">Time tracker</span>
              <button
                onClick={() => setMode("timer")}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-950 flex items-center justify-center transition-all duration-200 shadow-sm border-none"
                title="Switch to Timer"
              >
                <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="flex items-center justify-center my-1">
              <div className="relative flex items-center justify-center w-36 h-36">
                <svg className="w-full h-full" viewBox="0 0 144 144">
                  {renderTicks(stopwatchCurrentSecond, stopwatchTime === 0)}
                  {/* Background track circle */}
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    className="stroke-white/5 fill-none"
                    strokeWidth="5"
                  />
                  {stopwatchTime > 0 && (
                    <circle
                      cx="72"
                      cy="72"
                      r={radius}
                      className="stroke-amber-400 fill-none transform -rotate-90 origin-center transition-all duration-300"
                      strokeWidth="5"
                      strokeDasharray={circumference}
                      strokeDashoffset={stopwatchStrokeDashoffset}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center mt-[-4px]">
                  <div className="text-3xl font-light text-zinc-100 tracking-tight">{formatTime(stopwatchTime)}</div>
                  <div className="text-[10px] text-zinc-500 font-medium tracking-wide mt-1">Work Time</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex gap-2">
                <button
                  onClick={() => setIsStopwatchRunning(true)}
                  className={`flex items-center justify-center h-10 w-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-950 shadow transition-all duration-200 border-none ${
                    isStopwatchRunning ? "opacity-50 pointer-events-none" : ""
                  }`}
                  title="Start"
                >
                  <Play size={14} className="fill-current ml-0.5" />
                </button>
                <button
                  onClick={() => setIsStopwatchRunning(false)}
                  className={`flex items-center justify-center h-10 w-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-950 shadow transition-all duration-200 border-none ${
                    !isStopwatchRunning ? "opacity-50 pointer-events-none" : ""
                  }`}
                  title="Pause"
                >
                  <Pause size={14} className="fill-current" />
                </button>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center justify-center h-10 w-10 rounded-full bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 transition-all duration-200"
                title="Reset Stopwatch"
              >
                <AlarmClock size={16} />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="timer"
            initial={{ x: 150, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -150, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex-1 flex flex-col justify-between h-full w-full"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-tight text-zinc-100">Timer</span>
              <button
                onClick={() => setMode("stopwatch")}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-950 flex items-center justify-center transition-all duration-200 shadow-sm border-none"
                title="Switch to Stopwatch"
              >
                <ArrowUpRight size={14} className="rotate-180" />
              </button>
            </div>

            <div className="flex items-center justify-center my-1">
              <div className="relative flex items-center justify-center w-36 h-36">
                <svg className="w-full h-full" viewBox="0 0 144 144">
                  {renderTicks(timerCurrentSecond, timerTime === timerDuration)}
                  {/* Background track circle */}
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    className="stroke-white/5 fill-none"
                    strokeWidth="5"
                  />
                  {timerTime < timerDuration && (
                    <circle
                      cx="72"
                      cy="72"
                      r={radius}
                      className="stroke-amber-400 fill-none transform -rotate-90 origin-center transition-all duration-300"
                      strokeWidth="5"
                      strokeDasharray={circumference}
                      strokeDashoffset={timerStrokeDashoffset}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center mt-[-4px]">
                  {!isTimerRunning && (
                    <button
                      onClick={() => adjustTimer(60)}
                      className="absolute top-2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                      title="Add 1 minute"
                    >
                      <ChevronUp size={14} />
                    </button>
                  )}

                  <div className="text-3xl font-light text-zinc-100 tracking-tight">{formatTime(timerTime)}</div>
                  <div className="text-[10px] text-zinc-500 font-medium tracking-wide mt-1">Work Time</div>

                  {!isTimerRunning && (
                    <button
                      onClick={() => adjustTimer(-60)}
                      className="absolute bottom-1.5 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                      title="Subtract 1 minute"
                    >
                      <ChevronDown size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex gap-2">
                <button
                  onClick={() => setIsTimerRunning(true)}
                  className={`flex items-center justify-center h-10 w-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-950 shadow transition-all duration-200 border-none ${
                    isTimerRunning || timerTime === 0 ? "opacity-50 pointer-events-none" : ""
                  }`}
                  title="Start"
                >
                  <Play size={14} className="fill-current ml-0.5" />
                </button>
                <button
                  onClick={() => setIsTimerRunning(false)}
                  className={`flex items-center justify-center h-10 w-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-950 shadow transition-all duration-200 border-none ${
                    !isTimerRunning ? "opacity-50 pointer-events-none" : ""
                  }`}
                  title="Pause"
                >
                  <Pause size={14} className="fill-current" />
                </button>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center justify-center h-10 w-10 rounded-full bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 transition-all duration-200"
                title="Reset Timer"
              >
                <AlarmClock size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 3. Task Priority Distribution Card
function PriorityChartCard({ tasks }: { tasks: Task[] }) {
  const high = tasks.filter((t) => t.priority === "high").length;
  const medium = tasks.filter((t) => t.priority === "medium").length;
  const low = tasks.filter((t) => t.priority === "low").length;
  const total = high + medium + low;

  const barCapacity = Math.max(total, 5);
  const getPercent = (val: number) => (val === 0 ? 0 : Math.max(8, Math.min(100, (val / barCapacity) * 100)));

  return (
    <div className="flex h-full min-h-[240px] flex-col justify-between rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-md hover:border-indigo-500/30 transition-all duration-300">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 font-medium">Task Analysis</span>
        <span className="text-[10px] text-zinc-500">{total} analyzed</span>
      </div>

      <div className="flex items-end justify-around h-32 mt-4 px-2">
        <div className="flex flex-col items-center gap-2 group w-12">
          <div className="relative w-8 bg-zinc-950 rounded-lg h-24 flex items-end overflow-hidden">
            <div
              style={{ height: `${getPercent(low)}%` }}
              className="w-full bg-blue-500/60 group-hover:bg-blue-500 transition-all duration-300 rounded-b-lg"
            />
            <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-zinc-900/90 border border-white/10 text-[10px] text-zinc-100 px-1 rounded shadow-md z-10">
              {low}
            </div>
          </div>
          <span className="text-[10px] text-zinc-400">Low</span>
        </div>

        <div className="flex flex-col items-center gap-2 group w-12">
          <div className="relative w-8 bg-zinc-950 rounded-lg h-24 flex items-end overflow-hidden">
            <div
              style={{ height: `${getPercent(medium)}%` }}
              className="w-full bg-amber-500/60 group-hover:bg-amber-500 transition-all duration-300 rounded-b-lg"
            />
            <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-zinc-900/90 border border-white/10 text-[10px] text-zinc-100 px-1 rounded shadow-md z-10">
              {medium}
            </div>
          </div>
          <span className="text-[10px] text-zinc-400">Medium</span>
        </div>

        <div className="flex flex-col items-center gap-2 group w-12">
          <div className="relative w-8 bg-zinc-950 rounded-lg h-24 flex items-end overflow-hidden">
            <div
              style={{ height: `${getPercent(high)}%` }}
              className="w-full bg-red-500/60 group-hover:bg-red-500 transition-all duration-300 rounded-b-lg"
            />
            <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-zinc-900/90 border border-white/10 text-[10px] text-zinc-100 px-1 rounded shadow-md z-10">
              {high}
            </div>
          </div>
          <span className="text-[10px] text-zinc-400">High</span>
        </div>
      </div>
    </div>
  );
}

// 4. Task Timeline Card (Calendar Placeholder)
function TaskTimelineCard() {
  return (
    <div className="flex h-full min-h-[240px] flex-col justify-between rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-md hover:border-indigo-500/30 transition-all duration-300 overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Task Timeline</span>
        <span className="text-[10px] text-zinc-500">September 2026</span>
      </div>

      <div className="grid grid-cols-5 gap-2 text-center text-xs text-zinc-500 font-medium mt-2">
        <div>Mon 22</div>
        <div>Tue 23</div>
        <div className="text-indigo-400 font-bold border-b border-indigo-500/40 pb-0.5">Wed 24</div>
        <div>Thu 25</div>
        <div>Fri 26</div>
      </div>

      <div className="flex-1 mt-3 grid grid-cols-5 gap-2 relative min-h-0 overflow-y-auto pr-1 scrollbar-none">
        <div className="absolute inset-0 grid grid-rows-3 pointer-events-none border-t border-white/5 border-dashed">
          <div className="border-b border-white/5 border-dashed" />
          <div className="border-b border-white/5 border-dashed" />
        </div>

        <div className="col-start-1 col-end-3 row-start-1 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-2 h-14 flex flex-col justify-between">
          <span className="text-[10px] font-semibold text-indigo-200 truncate">Weekly Design Review</span>
          <span className="text-[8px] text-indigo-400/80">9:30 AM</span>
        </div>

        <div className="col-start-3 col-end-5 row-start-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 h-14 flex flex-col justify-between">
          <span className="text-[10px] font-semibold text-amber-200 truncate">Mesh Sync & Architecture</span>
          <span className="text-[8px] text-amber-400/80">11:00 AM</span>
        </div>

        <div className="col-start-5 col-end-6 row-start-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2 h-14 flex flex-col justify-between">
          <span className="text-[10px] font-semibold text-emerald-200 truncate">Demo prep</span>
          <span className="text-[8px] text-emerald-400/80">3:00 PM</span>
        </div>
      </div>
    </div>
  );
}

// 5. Embedded Luna Agent Block Card
function LunaAgentBlock() {
  const { connectionState, connect, disconnect, isStarting } = useLunaRuntime();
  const { agentState, agentMicTrack, userMicTrack, userMicVolume } = useGlobalAgentState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting" || isStarting;
  const visualState = isConnected ? agentState : "idle";

  const handleToggleMic = async () => {
    try {
      if (localParticipant) {
        await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      }
    } catch (err) {
      console.error("Mic toggle failed:", err);
    }
  };

  return (
    <div className="flex h-full min-h-[240px] flex-col justify-between rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-md relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
      {isConnected && visualState === "listening" && (
        <div
          style={{
            transform: `scale(${1 + userMicVolume * 0.4})`,
            opacity: userMicVolume > 0.01 ? userMicVolume * 0.4 : 0
          }}
          className="absolute inset-0 rounded-2xl bg-indigo-500/10 pointer-events-none blur-xl transition-all duration-150"
        />
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Luna Assistant</span>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : isConnecting ? "bg-amber-500 animate-pulse" : "bg-zinc-500"}`} />
          <span className="text-[9px] text-zinc-500 font-mono">
            {isConnected ? visualState.toUpperCase() : isConnecting ? "CONNECTING" : "SLEEPING"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center my-1.5 h-[110px]">
        {isConnected ? (
          <AgentAudioVisualizerGrid
            rowCount={7}
            columnCount={7}
            color={visualState === "speaking" ? "#6366f1" : visualState === "listening" ? "#818cf8" : "#8b8d98"}
            radius={2}
            interval={100}
            audioTrack={visualState === "speaking" ? agentMicTrack : userMicTrack}
            state={visualState}
            size="md"
            className="w-20 h-20 place-content-center relative z-10"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2">
            <Zap size={28} className="text-zinc-600 animate-pulse" />
            <p className="text-[10px] text-zinc-500 text-center max-w-[140px]">Wake Luna to use real-time British voice controls</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 mt-auto">
        {isConnected ? (
          <>
            <button
              onClick={handleToggleMic}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                isMicrophoneEnabled ? "bg-zinc-900 border border-white/5 text-zinc-300 hover:text-white" : "border border-red-500/30 bg-red-500/10 text-red-400"
              }`}
              title={isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone"}
            >
              {isMicrophoneEnabled ? <Mic size={14} /> : <MicOff size={14} />}
            </button>
            <button
              onClick={() => void disconnect()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 border border-white/5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
              title="Disconnect"
            >
              <PhoneOff size={14} />
            </button>
          </>
        ) : (
          <button
            onClick={() => void connect()}
            disabled={isConnecting}
            className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-semibold shadow-md transition-all w-3/4 disabled:opacity-50"
          >
            {isConnecting ? "Waking Up..." : "Wake Luna"}
          </button>
        )}
        <Link
          to="/luna"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 border border-white/5 text-zinc-400 hover:text-zinc-200 transition-all"
          title="Open Mesh Console"
        >
          <MessageSquare size={14} />
        </Link>
      </div>
    </div>
  );
}

// 6. System Stats Card (Collapsible Diagnostics)
function SystemStatsCard() {
  const [openSection, setOpenSection] = useState<string | null>("diag");

  const toggle = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className="flex h-full min-h-[240px] flex-col rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-md overflow-y-auto hover:border-indigo-500/30 transition-all duration-300 scrollbar-none">
      <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">System Diagnostics</span>
      
      <div className="flex flex-col gap-2">
        <div className="border-b border-white/5 pb-2">
          <button
            onClick={() => toggle("diag")}
            className="flex items-center justify-between w-full text-left text-xs font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <span>Diagnostics Status</span>
            <ChevronDown size={14} className={`transform transition-transform ${openSection === "diag" ? "rotate-180" : ""}`} />
          </button>
          {openSection === "diag" && (
            <div className="mt-2 text-[10px] text-zinc-400 flex flex-col gap-1 pl-1">
              <div className="flex justify-between"><span>SQLite Engine</span><span className="text-emerald-400">Connected</span></div>
              <div className="flex justify-between"><span>API Gateway</span><span className="text-emerald-400">Active</span></div>
            </div>
          )}
        </div>

        <div className="border-b border-white/5 pb-2">
          <button
            onClick={() => toggle("devices")}
            className="flex items-center justify-between w-full text-left text-xs font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <span>Client Devices</span>
            <ChevronDown size={14} className={`transform transition-transform ${openSection === "devices" ? "rotate-180" : ""}`} />
          </button>
          {openSection === "devices" && (
            <div className="mt-2 text-[10px] text-zinc-400 flex flex-col gap-1 pl-1">
              <div className="flex justify-between"><span>Host Environment</span><span>Tauri + Vite</span></div>
              <div className="flex justify-between"><span>Active Audio Device</span><span>System Default</span></div>
            </div>
          )}
        </div>

        <div className="pb-1">
          <button
            onClick={() => toggle("workspace")}
            className="flex items-center justify-between w-full text-left text-xs font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <span>Workspace Metadata</span>
            <ChevronDown size={14} className={`transform transition-transform ${openSection === "workspace" ? "rotate-180" : ""}`} />
          </button>
          {openSection === "workspace" && (
            <div className="mt-2 text-[10px] text-zinc-400 flex flex-col gap-1 pl-1">
              <div className="flex justify-between"><span>App Version</span><span>1.0.0-beta.2</span></div>
              <div className="flex justify-between"><span>Corpus Name</span><span>Quasar Mesh</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 7. Recent Tasks Card
function RecentTasksCard({
  tasks,
  sessionToken,
  updateTask
}: {
  tasks: Task[];
  sessionToken: string;
  updateTask: (
    sessionToken: string,
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "dueDate" | "priority" | "status" | "colorToken">>
  ) => Promise<void>;
}) {
  const pendingTasks = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime())
    .slice(0, 5);

  const toggleTaskCompletion = async (taskId: string) => {
    await updateTask(sessionToken, taskId, { status: "done" });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-500/15 border-red-500/30 text-red-400";
      case "medium":
        return "bg-amber-500/15 border-amber-500/30 text-amber-400";
      default:
        return "bg-blue-500/15 border-blue-500/30 text-blue-400";
    }
  };

  return (
    <div className="flex h-full min-h-[240px] flex-col justify-between rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-md hover:border-indigo-500/30 transition-all duration-300">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Recent Tasks</span>
        <Link to="/tasks" className="text-[10px] text-zinc-500 hover:text-indigo-300 flex items-center gap-0.5">
          <span>All Tasks</span>
          <ArrowUpRight size={10} />
        </Link>
      </div>

      <div className="flex-1 mt-3 flex flex-col gap-2 overflow-y-auto pr-1 scrollbar-none">
        {pendingTasks.length > 0 ? (
          pendingTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between p-2 rounded-xl bg-zinc-950/40 border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 overflow-hidden mr-2">
                <button
                  onClick={() => toggleTaskCompletion(task.id)}
                  className="flex-shrink-0 w-4 h-4 rounded border border-zinc-700 hover:border-indigo-500 flex items-center justify-center text-indigo-500 hover:bg-indigo-500/10 transition-all"
                >
                  <Check size={10} className="opacity-0 hover:opacity-100" />
                </button>
                <span className="text-xs font-medium text-zinc-200 truncate" title={task.title}>
                  {task.title}
                </span>
              </div>
              <span
                className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${getPriorityColor(
                  task.priority
                )}`}
              >
                {task.priority}
              </span>
            </div>
          ))
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-4 text-center">
            <p className="text-[10px] text-zinc-500">All tasks completed!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// 8. Recent Notes Card
function RecentNotesCard({ notes }: { notes: Note[] }) {
  const recentNotes = notes.slice(0, 3);

  return (
    <div className="flex h-full min-h-[240px] flex-col justify-between rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-md hover:border-indigo-500/30 transition-all duration-300">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Recent Notes</span>
        <Link to="/notes" className="text-[10px] text-zinc-500 hover:text-indigo-300 flex items-center gap-0.5">
          <span>All Notes</span>
          <ArrowUpRight size={10} />
        </Link>
      </div>

      <div className="flex-1 mt-3 flex flex-col gap-2 overflow-y-auto pr-1 scrollbar-none">
        {recentNotes.length > 0 ? (
          recentNotes.map((note) => (
            <Link
              key={note.id}
              to="/notes"
              className="flex flex-col p-2 rounded-xl bg-zinc-950/40 border border-white/5 hover:border-indigo-500/20 transition-all text-left"
            >
              <span className="text-xs font-semibold text-zinc-200 truncate">{note.title || "Untitled Note"}</span>
              <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                {note.body ? note.body.replace(/[#*`_]/g, "") : "Empty content"}
              </p>
            </Link>
          ))
        ) : (
          <div className="text-center py-4 flex flex-col items-center gap-1.5">
            <span className="text-xl">📝</span>
            <p className="text-[10px] text-zinc-500">No notes saved yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

type WeatherState = {
  temperature: number | null;
  label: string;
  status: "loading" | "ready" | "unavailable";
};

function TimeWeatherPanel() {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherState>(() =>
    "geolocation" in navigator
      ? { temperature: null, label: "Local weather", status: "loading" }
      : { temperature: null, label: "Weather unavailable", status: "unavailable" }
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`
          );
          const payload = await response.json();
          const temperature = payload.current?.temperature_2m;
          setWeather({
            temperature: typeof temperature === "number" ? Math.round(temperature) : null,
            label: getWeatherLabel(payload.current?.weather_code),
            status: "ready"
          });
        } catch {
          setWeather({ temperature: null, label: "Weather unavailable", status: "unavailable" });
        }
      },
      () => setWeather({ temperature: null, label: "Weather unavailable", status: "unavailable" }),
      { maximumAge: 1000 * 60 * 30, timeout: 4000 }
    );
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/50 px-4 py-3 shadow-md">
      <div className="flex items-center gap-2 border-r border-white/10 pr-3">
        <CalendarDays size={16} className="text-indigo-300" />
        <div>
          <div className="font-mono text-lg font-semibold leading-none text-zinc-100">{format(now, "h:mm a")}</div>
          <div className="mt-1 text-[10px] font-medium text-zinc-500">{format(now, "EEEE, MMMM d, yyyy")}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <CloudSun size={17} className="text-amber-300" />
        <div>
          <div className="text-xs font-semibold text-zinc-200">
            {weather.temperature !== null ? `${weather.temperature}C` : "--"}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-zinc-500">
            {weather.status === "loading" ? "Checking weather" : weather.label}
          </div>
        </div>
      </div>
    </div>
  );
}

const getWeatherLabel = (code: number | undefined) => {
  if (code === undefined) return "Current conditions";
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Current conditions";
};

type DashboardWidgetId =
  | "profile"
  | "stopwatch"
  | "priority"
  | "timeline"
  | "luna"
  | "system"
  | "tasks"
  | "notes";

type DashboardWidgetLayout = {
  id: DashboardWidgetId;
  w: number;
  h: number;
};

const dashboardLayoutStorageKey = "quasar-dashboard-widget-layout-v2";

const defaultWidgetLayouts: DashboardWidgetLayout[] = [
  { id: "profile", w: 3, h: 2 },
  { id: "stopwatch", w: 3, h: 2 },
  { id: "priority", w: 3, h: 2 },
  { id: "timeline", w: 6, h: 2 },
  { id: "luna", w: 3, h: 2 },
  { id: "system", w: 3, h: 2 },
  { id: "tasks", w: 3, h: 2 },
  { id: "notes", w: 3, h: 2 }
];

const dashboardWidgetIds = defaultWidgetLayouts.map((layout) => layout.id);

const clampWidgetSize = (id: DashboardWidgetId, w: number, h: number): Pick<DashboardWidgetLayout, "w" | "h"> => {
  const minW = id === "timeline" ? 4 : 2;
  return {
    w: Math.max(minW, Math.min(8, w)),
    h: Math.max(2, Math.min(4, h))
  };
};

const normalizeDashboardLayout = (layout: DashboardWidgetLayout[]): DashboardWidgetLayout[] => {
  const seen = new Set<DashboardWidgetId>();
  const normalized: DashboardWidgetLayout[] = [];

  for (const item of layout) {
    if (!dashboardWidgetIds.includes(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const size = clampWidgetSize(item.id, Number(item.w) || 3, Number(item.h) || 2);
    normalized.push({ id: item.id, ...size });
  }

  for (const fallback of defaultWidgetLayouts) {
    if (!seen.has(fallback.id)) normalized.push(fallback);
  }

  return normalized;
};

const persistDashboardLayout = (layout: DashboardWidgetLayout[]) => {
  window.localStorage.setItem(dashboardLayoutStorageKey, JSON.stringify(layout));
};

function DashboardWidget({
  id,
  layout,
  children,
  draggingWidgetId,
  resizingWidgetId,
  onDragStartWidget,
  onDragEndWidget,
  onResizeStartWidget,
  onResizeEndWidget,
  onMoveWidget,
  onResizeWidget
}: {
  id: DashboardWidgetId;
  layout: DashboardWidgetLayout;
  children: ReactNode;
  draggingWidgetId: DashboardWidgetId | null;
  resizingWidgetId: DashboardWidgetId | null;
  onDragStartWidget: (id: DashboardWidgetId) => void;
  onDragEndWidget: () => void;
  onResizeStartWidget: (id: DashboardWidgetId) => void;
  onResizeEndWidget: () => void;
  onMoveWidget: (from: DashboardWidgetId, to: DashboardWidgetId) => void;
  onResizeWidget: (id: DashboardWidgetId, w: number, h: number) => void;
}) {
  const isDragging = draggingWidgetId === id;
  const isResizing = resizingWidgetId === id;

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const from = draggingWidgetId ?? (event.dataTransfer.getData("application/x-dashboard-widget") as DashboardWidgetId);
    if (from && from !== id) onMoveWidget(from, id);
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startW = layout.w;
    const startH = layout.h;
    const gridUnitWidth = 118;
    const gridUnitHeight = 128;
    onResizeStartWidget(id);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextW = startW + Math.round((moveEvent.clientX - startX) / gridUnitWidth);
      const nextH = startH + Math.round((moveEvent.clientY - startY) / gridUnitHeight);
      const size = clampWidgetSize(id, nextW, nextH);
      onResizeWidget(id, size.w, size.h);
    };

    const handlePointerUp = () => {
      onResizeEndWidget();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  return (
    <motion.section
      layout
      transition={{ layout: { type: "spring", stiffness: 420, damping: 34 }, scale: { duration: 0.16 }, opacity: { duration: 0.16 } }}
      style={{
        gridColumn: `span ${layout.w} / span ${layout.w}`,
        gridRow: `span ${layout.h} / span ${layout.h}`
      }}
      className={`group/widget relative min-h-[240px] rounded-2xl outline-none ${
        isDragging || isResizing ? "z-30 scale-[1.015] opacity-90 shadow-2xl shadow-indigo-500/15" : "z-0"
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={handleDragEnter}
    >
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-dashboard-widget", id);
          onDragStartWidget(id);
        }}
        onDragEnd={onDragEndWidget}
        className={`absolute left-1/2 top-2 z-20 flex h-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border px-2 shadow-sm transition-all active:cursor-grabbing ${
          isDragging
            ? "border-indigo-400/50 bg-indigo-500/20 text-indigo-100 opacity-100"
            : "border-white/10 bg-zinc-950/80 text-zinc-500 opacity-0 group-hover/widget:opacity-100"
        }`}
        title="Move widget"
      >
        <GripHorizontal size={14} />
      </div>
      <motion.div
        animate={{
          scale: isDragging || isResizing ? 1.015 : 1,
          y: isDragging ? -4 : 0
        }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        className={`h-full min-h-[240px] rounded-2xl transition-[filter] duration-200 ${
          isDragging || isResizing ? "ring-1 ring-indigo-400/40 brightness-110" : ""
        }`}
      >
        {children}
      </motion.div>
      <button
        type="button"
        aria-label="Resize widget"
        onPointerDown={handleResizeStart}
        className={`absolute bottom-2 right-2 z-20 h-5 w-5 cursor-nwse-resize rounded-md border shadow-sm transition-all ${
          isResizing
            ? "border-indigo-400/50 bg-indigo-500/20 opacity-100"
            : "border-white/10 bg-zinc-950/80 opacity-0 group-hover/widget:opacity-100"
        }`}
      >
        <span className="absolute bottom-1 right-1 h-2 w-2 border-b border-r border-zinc-400" />
      </button>
    </motion.section>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const sessionToken = useAuthStore((s) => s.sessionToken);

  const { tasks, loadTasks, updateTask } = useTaskStore();
  const { notes, loadNotes } = useNoteStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draggingWidgetId, setDraggingWidgetId] = useState<DashboardWidgetId | null>(null);
  const [resizingWidgetId, setResizingWidgetId] = useState<DashboardWidgetId | null>(null);
  const [dashboardLayout, setDashboardLayout] = useState<DashboardWidgetLayout[]>(() => {
    try {
      const stored = window.localStorage.getItem(dashboardLayoutStorageKey);
      const parsed = stored ? (JSON.parse(stored) as DashboardWidgetLayout[]) : null;
      return parsed?.length ? normalizeDashboardLayout(parsed) : defaultWidgetLayouts;
    } catch {
      return defaultWidgetLayouts;
    }
  });

  useEffect(() => {
    if (sessionToken) {
      void loadTasks(sessionToken);
      void loadNotes(sessionToken);
    }
  }, [sessionToken, loadTasks, loadNotes]);

  if (!user) return <Navigate to="/login" replace />;

  const onSignOut = async () => {
    setLoading(true);
    await signOut();
    navigate("/login");
  };

  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((t) => t.status !== "done").length;
  const isEditingDashboardGrid = draggingWidgetId !== null || resizingWidgetId !== null;

  const moveWidget = (from: DashboardWidgetId, to: DashboardWidgetId) => {
    setDashboardLayout((current) => {
      const fromIndex = current.findIndex((item) => item.id === from);
      const toIndex = current.findIndex((item) => item.id === to);
      if (fromIndex === -1 || toIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      persistDashboardLayout(next);
      return normalizeDashboardLayout(next);
    });
  };

  const resizeWidget = (id: DashboardWidgetId, w: number, h: number) => {
    setDashboardLayout((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, ...clampWidgetSize(id, w, h) } : item));
      persistDashboardLayout(next);
      return next;
    });
  };

  const widgets: Record<DashboardWidgetId, { element: ReactNode }> = {
    profile: { element: <UserProfileCard user={user} /> },
    stopwatch: { element: <StopwatchCard /> },
    priority: { element: <PriorityChartCard tasks={tasks} /> },
    timeline: { element: <TaskTimelineCard /> },
    luna: { element: <LunaAgentBlock /> },
    system: { element: <SystemStatsCard /> },
    tasks: { element: <RecentTasksCard tasks={tasks} sessionToken={sessionToken ?? ""} updateTask={updateTask} /> },
    notes: { element: <RecentNotesCard notes={notes} /> }
  };

  return (
    <div className="app-page-scroll bg-background pb-28 text-zinc-100 font-sans">
      <main className="flex w-full flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-white/5 pb-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              {getGreeting(user.display_name ?? user.username)}
            </h1>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center xl:ml-auto">
            <TimeWeatherPanel />

            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-6">
              <div className="text-right group hover:scale-105 transition-all duration-200">
                <div className="text-3xl font-extrabold font-mono text-zinc-100 tracking-tight">{totalTasks}</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold mt-1">Total Tasks</div>
              </div>

              <div className="text-right group hover:scale-105 transition-all duration-200">
                <div className="text-3xl font-extrabold font-mono text-indigo-400 tracking-tight">
                  {pendingTasks}
                </div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold mt-1">Pending</div>
              </div>

              <div className="text-right group hover:scale-105 transition-all duration-200">
                <div className="text-3xl font-extrabold font-mono text-zinc-100 tracking-tight">{notes.length}</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold mt-1">Notes Saved</div>
              </div>
            </div>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 hover:bg-zinc-800 p-1.5 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                >
                  <UserAvatar seed={user.avatar_seed ?? user.id} className="h-8 w-8 rounded-lg border border-white/5" />
                  <ChevronDown size={14} className="text-zinc-400 pr-0.5" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-40 rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    <Link className="block rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100" to="/profile">
                      Profile Settings
                    </Link>
                    <button
                      onClick={onSignOut}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : "Sign Out"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <motion.div
          layout
          className={`dashboard-widget-grid grid grid-flow-dense auto-rows-[118px] grid-cols-12 gap-5 rounded-2xl border p-1 transition-[background-color,border-color,box-shadow] duration-200 ${
            isEditingDashboardGrid
              ? "border-indigo-500/20 bg-[linear-gradient(rgba(129,140,248,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.18)_1px,transparent_1px)] bg-[length:calc((100%-55px)/12)_138px] shadow-inner shadow-indigo-500/10"
              : "border-transparent bg-transparent"
          }`}
        >
          {dashboardLayout.map((layout) => (
            <DashboardWidget
              key={layout.id}
              id={layout.id}
              layout={layout}
              draggingWidgetId={draggingWidgetId}
              resizingWidgetId={resizingWidgetId}
              onDragStartWidget={setDraggingWidgetId}
              onDragEndWidget={() => setDraggingWidgetId(null)}
              onResizeStartWidget={setResizingWidgetId}
              onResizeEndWidget={() => setResizingWidgetId(null)}
              onMoveWidget={moveWidget}
              onResizeWidget={resizeWidget}
            >
              {widgets[layout.id].element}
            </DashboardWidget>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
