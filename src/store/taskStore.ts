import { create } from "zustand";
import {
  createTask as createTaskApi,
  deleteTask as deleteTaskApi,
  listTasks,
  moveTask as moveTaskApi,
  setTaskListColor,
  toggleTaskSubtask,
  updateTask as updateTaskApi,
  type Task,
  type TaskList,
  type TaskPriority,
  type TaskStatus,
  type ViewMode
} from "@/lib/tauriCommands";

type CreateTaskInput = {
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  subtasks: string[];
  colorToken: string;
};

type TaskState = {
  tasks: Task[];
  lists: TaskList[];
  viewMode: ViewMode;
  isLoading: boolean;
  loadTasks: (sessionToken: string) => Promise<void>;
  createTask: (sessionToken: string, input: CreateTaskInput) => Promise<void>;
  updateTask: (
    sessionToken: string,
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "dueDate" | "priority" | "status" | "colorToken">>
  ) => Promise<void>;
  deleteTask: (sessionToken: string, taskId: string) => Promise<void>;
  toggleSubtask: (sessionToken: string, taskId: string, subtaskId: string) => Promise<void>;
  moveTask: (sessionToken: string, taskId: string, toStatus: TaskStatus, toIndex: number) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setListColor: (sessionToken: string, listId: TaskStatus, colorToken: string) => Promise<void>;
  setTaskColor: (sessionToken: string, taskId: string, colorToken: string) => Promise<void>;
};

const replaceTaskInState = (tasks: Task[], next: Task): Task[] => {
  const exists = tasks.some((task) => task.id === next.id);
  if (!exists) return [...tasks, next];
  return tasks.map((task) => (task.id === next.id ? next : task));
};

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  lists: [],
  viewMode: "card",
  isLoading: false,
  loadTasks: async (sessionToken) => {
    set({ isLoading: true });
    try {
      const payload = await listTasks(sessionToken);
      set({ tasks: payload.tasks, lists: payload.lists });
    } finally {
      set({ isLoading: false });
    }
  },
  createTask: async (sessionToken, input) => {
    const created = await createTaskApi(sessionToken, input);
    set((state) => ({ tasks: [...state.tasks, created] }));
  },
  updateTask: async (sessionToken, taskId, patch) => {
    const updated = await updateTaskApi(sessionToken, taskId, patch);
    set((state) => ({ tasks: replaceTaskInState(state.tasks, updated) }));
  },
  deleteTask: async (sessionToken, taskId) => {
    await deleteTaskApi(sessionToken, taskId);
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== taskId) }));
  },
  toggleSubtask: async (sessionToken, taskId, subtaskId) => {
    const updated = await toggleTaskSubtask(sessionToken, taskId, subtaskId);
    set((state) => ({ tasks: replaceTaskInState(state.tasks, updated) }));
  },
  moveTask: async (sessionToken, taskId, toStatus, toIndex) => {
    await moveTaskApi(sessionToken, taskId, toStatus, toIndex);
    const payload = await listTasks(sessionToken);
    set({ tasks: payload.tasks, lists: payload.lists });
  },
  setViewMode: (mode) => set({ viewMode: mode }),
  setListColor: async (sessionToken, listId, colorToken) => {
    await setTaskListColor(sessionToken, listId, colorToken);
    set((state) => ({
      lists: state.lists.map((list) => (list.id === listId ? { ...list, colorToken } : list))
    }));
  },
  setTaskColor: async (sessionToken, taskId, colorToken) => {
    const updated = await updateTaskApi(sessionToken, taskId, { colorToken });
    set((state) => ({ tasks: replaceTaskInState(state.tasks, updated) }));
  }
}));

export type { Task, TaskList, TaskPriority, TaskStatus, ViewMode };
