import { invoke } from "@tauri-apps/api/core";

export type UserProfile = {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  avatar_seed: string | null;
  created_at: string;
};

export type SessionToken = {
  token: string;
  user: UserProfile;
};

function assertTauriRuntime() {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error("This feature needs the desktop app runtime. Start with `npx tauri dev`.");
  }
}

export async function registerUser(payload: {
  username: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<UserProfile> {
  assertTauriRuntime();
  return invoke<UserProfile>("register_user", {
    username: payload.username,
    email: payload.email,
    password: payload.password,
    display_name: payload.displayName
  });
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<SessionToken> {
  assertTauriRuntime();
  return invoke<SessionToken>("login", payload);
}

export async function logout(sessionToken: string): Promise<void> {
  assertTauriRuntime();
  return invoke("logout", { session_token: sessionToken });
}

export async function getCurrentUser(sessionToken: string): Promise<UserProfile> {
  assertTauriRuntime();
  return invoke<UserProfile>("get_current_user", { session_token: sessionToken });
}

export async function updateProfile(payload: {
  sessionToken: string;
  displayName: string;
  avatarSeed: string;
}): Promise<UserProfile> {
  assertTauriRuntime();
  return invoke<UserProfile>("update_profile", {
    session_token: payload.sessionToken,
    display_name: payload.displayName,
    avatar_seed: payload.avatarSeed
  });
}
