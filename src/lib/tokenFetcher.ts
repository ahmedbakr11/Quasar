import { invoke } from "@tauri-apps/api/core";

export async function fetchLiveKitToken(sessionToken: string): Promise<string> {
  return invoke<string>("generate_livekit_token", { sessionToken });
}
