/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAgent, useMultibandTrackVolume, useLocalParticipant } from "@livekit/components-react";
import { Track, type RemoteAudioTrack, type LocalAudioTrack } from "livekit-client";
import type { AgentState } from "@livekit/components-react";

export type GlobalAgentStateValue = {
  agentState: AgentState;
  agentMicTrack?: RemoteAudioTrack;
  userMicTrack?: LocalAudioTrack;
  userMicVolume: number;
  isMicMuted: boolean;
};

export const GlobalAgentStateContext = createContext<GlobalAgentStateValue | null>(null);

export function useGlobalAgentState() {
  const value = useContext(GlobalAgentStateContext);
  if (!value) {
    throw new Error("useGlobalAgentState must be used within GlobalAgentStateProvider");
  }
  return value;
}

export function GlobalAgentStateProvider({ children }: { children: ReactNode }) {
  const agent = useAgent();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  
  const userMicPub = localParticipant.getTrackPublication(Track.Source.Microphone);
  const userMicTrack = userMicPub?.track as LocalAudioTrack | undefined;
  
  const volumes = useMultibandTrackVolume(userMicTrack, { bands: 3 });
  const userMicVolume = useMemo(() => {
    if (volumes.length === 0) return 0;
    return volumes.reduce((a, b) => a + b, 0) / volumes.length;
  }, [volumes]);

  const value = useMemo(() => ({
    agentState: agent.state,
    agentMicTrack: agent.microphoneTrack as RemoteAudioTrack | undefined,
    userMicTrack,
    userMicVolume,
    isMicMuted: !isMicrophoneEnabled
  }), [agent.state, agent.microphoneTrack, userMicTrack, userMicVolume, isMicrophoneEnabled]);

  return (
    <GlobalAgentStateContext.Provider value={value}>
      {children}
    </GlobalAgentStateContext.Provider>
  );
}
