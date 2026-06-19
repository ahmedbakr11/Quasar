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

export type OnboardingStatus = {
  isFirstLaunch: boolean;
};

export type CompleteOnboardingPayload = {
  voice: string;
  persona: string;
  googleApiKey: string;
  name: string;
  email: string;
  password: string;
};

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "high" | "medium" | "low";
export type ViewMode = "list" | "card";

export type TaskSubtask = {
  id: string;
  text: string;
  done: boolean;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  subtasks: TaskSubtask[];
  status: TaskStatus;
  colorToken: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskList = {
  id: TaskStatus;
  name: string;
  colorToken: string;
  position: number;
};

export type TaskStatePayload = {
  tasks: Task[];
  lists: TaskList[];
};

export type Note = {
  id: string;
  title: string;
  body: string;
  labels: string[];
  colorToken: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VaultAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  ext: string;
  size: number;
  createdAt: string;
  relativePath: string;
  isPersistent: boolean;
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

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  assertTauriRuntime();
  return invoke<OnboardingStatus>("get_onboarding_status");
}

export async function completeOnboarding(payload: CompleteOnboardingPayload): Promise<SessionToken> {
  assertTauriRuntime();
  return invoke<SessionToken>("complete_onboarding", { payload });
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

export async function listTasks(sessionToken: string): Promise<TaskStatePayload> {
  assertTauriRuntime();
  return invoke<TaskStatePayload>("list_tasks", { sessionToken });
}

export async function createTask(
  sessionToken: string,
  payload: {
    title: string;
    description: string;
    dueDate: string;
    priority: TaskPriority;
    status: TaskStatus;
    subtasks: string[];
    colorToken: string;
  }
): Promise<Task> {
  assertTauriRuntime();
  return invoke<Task>("create_task", { sessionToken, payload });
}

export async function updateTask(
  sessionToken: string,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "description" | "dueDate" | "priority" | "status" | "colorToken">>
): Promise<Task> {
  assertTauriRuntime();
  return invoke<Task>("update_task", { sessionToken, taskId, patch });
}

export async function moveTask(
  sessionToken: string,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number
): Promise<Task> {
  assertTauriRuntime();
  return invoke<Task>("move_task", { sessionToken, taskId, payload: { toStatus, toIndex } });
}

export async function toggleTaskSubtask(
  sessionToken: string,
  taskId: string,
  subtaskId: string
): Promise<Task> {
  assertTauriRuntime();
  return invoke<Task>("toggle_subtask", { sessionToken, taskId, subtaskId });
}

export async function deleteTask(sessionToken: string, taskId: string): Promise<void> {
  assertTauriRuntime();
  return invoke("delete_task", { sessionToken, taskId });
}

export async function setTaskListColor(sessionToken: string, listId: TaskStatus, colorToken: string): Promise<void> {
  assertTauriRuntime();
  return invoke("set_list_color", { sessionToken, listId, colorToken });
}

export async function listNotes(sessionToken: string): Promise<Note[]> {
  assertTauriRuntime();
  return invoke<Note[]>("list_notes", { sessionToken });
}

export async function createNote(
  sessionToken: string,
  payload: {
    title: string;
    body: string;
    labels: string[];
    colorToken: string;
    pinned: boolean;
  }
): Promise<Note> {
  assertTauriRuntime();
  return invoke<Note>("create_note", { sessionToken, payload });
}

export async function updateNote(
  sessionToken: string,
  noteId: string,
  patch: Partial<Pick<Note, "title" | "body" | "labels" | "colorToken" | "pinned" | "archived">>
): Promise<Note> {
  assertTauriRuntime();
  return invoke<Note>("update_note", { sessionToken, noteId, patch });
}

export async function deleteNote(sessionToken: string, noteId: string): Promise<void> {
  assertTauriRuntime();
  return invoke("delete_note", { sessionToken, noteId });
}

export async function listVaultAssets(sessionToken: string): Promise<VaultAsset[]> {
  assertTauriRuntime();
  return invoke<VaultAsset[]>("list_vault_assets", { sessionToken });
}

export async function listMeshAssets(sessionToken: string): Promise<VaultAsset[]> {
  assertTauriRuntime();
  return invoke<VaultAsset[]>("list_mesh_assets", { sessionToken });
}

export async function saveVaultAsset(payload: {
  sessionToken: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Promise<VaultAsset> {
  assertTauriRuntime();
  return invoke<VaultAsset>("save_vault_asset", {
    sessionToken: payload.sessionToken,
    payload: {
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      dataBase64: payload.dataBase64
    }
  });
}

export async function moveMeshAssetToVault(payload: {
  sessionToken: string;
  relativePath: string;
}): Promise<VaultAsset> {
  assertTauriRuntime();
  return invoke<VaultAsset>("move_mesh_asset_to_vault", {
    sessionToken: payload.sessionToken,
    payload: { relativePath: payload.relativePath }
  });
}

export async function deleteMeshAsset(payload: { sessionToken: string; relativePath: string }): Promise<void> {
  assertTauriRuntime();
  return invoke("delete_mesh_asset", {
    sessionToken: payload.sessionToken,
    payload: { relativePath: payload.relativePath }
  });
}

export async function clearMeshWorkspace(sessionToken: string): Promise<void> {
  assertTauriRuntime();
  return invoke("clear_mesh_workspace", { sessionToken });
}
