import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { LunaConnected } from "@/components/luna/LunaConnected";
import { LunaConnecting } from "@/components/luna/LunaConnecting";
import { LunaDisconnected } from "@/components/luna/LunaDisconnected";
import { useLunaRuntime } from "@/components/luna/LunaRuntimeContext";
import { useAuthStore } from "@/store/authStore";

export default function Luna() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const {
    connectionState,
    isConfigured,
    isStarting
  } = useLunaRuntime();
  const transition = useMemo(() => ({ duration: 0.2 }), []);
  if (!sessionToken) return <Navigate to="/login" replace />;

  return (
    <div className="h-full min-h-0 bg-[#0a0a0a] pb-28">
      <AnimatePresence mode="wait">
        {!isConfigured && (
          <motion.div
            key="setup"
            className="h-full"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={transition}
          >
            <LunaDisconnected
              isConfigured={isConfigured}
              isConnecting={isStarting}
            />
          </motion.div>
        )}
        {isConfigured && connectionState === "connecting" && (
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
        {isConfigured && connectionState !== "connecting" && (
          <motion.div
            key="connected"
            className="h-full"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={transition}
          >
            <LunaConnected />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
