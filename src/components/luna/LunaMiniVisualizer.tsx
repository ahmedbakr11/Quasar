import { AgentAudioVisualizerGrid } from "@/components/agents/agent-audio-visualizer-grid";
import { useLunaRuntime } from "@/components/luna/LunaRuntimeContext";
import { useGlobalAgentState } from "@/components/luna/GlobalAgentState";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAgentStore } from "@/store/agentStore";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function LunaMiniVisualizer() {
  const { connectionState } = useLunaRuntime();
  const { agentState, agentMicTrack, userMicTrack, userMicVolume } = useGlobalAgentState();
  const location = useLocation();
  const transparency = useAgentStore((s) => s.popup_transparency);
  const [side, setSide] = useState<"right" | "left">("right");
  const [isBlinking, setIsBlinking] = useState(false);

  const isConnected = connectionState === "connected";
  const onLunaPage = location.pathname === "/luna";
  const showPopup = isConnected && !onLunaPage;

  const visualState = agentState;

  const handleHoverNear = () => {
    if (isBlinking) return;
    setIsBlinking(true);
    setTimeout(() => {
      setSide((s) => (s === "right" ? "left" : "right"));
      setIsBlinking(false);
    }, 400);
  };

  if (!showPopup) return null;

  return (
    <AnimatePresence>
      <motion.div
        layout
        onMouseEnter={handleHoverNear}
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
        }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className={cn(
          "fixed bottom-6 z-40 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 shadow-[0_18px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl",
          side === "left" ? "left-6" : "right-6",
          isBlinking && "animate-pulse opacity-50"
        )}
        style={{ 
          backgroundColor: `rgba(16, 16, 20, ${transparency})`,
          pointerEvents: "auto",
        }}
        aria-label="Luna activity"
      >
        {visualState === "listening" && (
          <motion.div
            animate={{
              scale: 1 + userMicVolume * 0.6,
              opacity: userMicVolume > 0.01 ? userMicVolume * 0.75 : 0,
            }}
            transition={{ type: "spring", bounce: 0, duration: 0.15 }}
            className="absolute inset-0 rounded-2xl bg-indigo-500 pointer-events-none blur-md"
          />
        )}
        <AgentAudioVisualizerGrid
          size="sm"
          rowCount={7}
          columnCount={7}
          color={visualState === "speaking" ? "#6366f1" : visualState === "listening" ? "#818cf8" : "#8b8d98"}
          radius={2}
          interval={100}
          audioTrack={visualState === "speaking" ? agentMicTrack : userMicTrack}
          state={visualState}
          className="h-12 w-12 place-content-center relative z-10"
        />
      </motion.div>
    </AnimatePresence>
  );
}
