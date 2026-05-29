import { createContext, useContext } from "react";

export type LunaConnectionState = "disconnected" | "connecting" | "connected";

export type LunaRuntimeValue = {
  connectionState: LunaConnectionState;
  isConfigured: boolean;
  isStarting: boolean;
  isManuallyDisconnected: boolean;
  autoConnectBlocked: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

export const LunaRuntimeContext = createContext<LunaRuntimeValue | null>(null);

export function useLunaRuntime() {
  const value = useContext(LunaRuntimeContext);
  if (!value) {
    throw new Error("useLunaRuntime must be used inside LunaRuntime");
  }
  return value;
}
