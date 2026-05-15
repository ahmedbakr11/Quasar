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
