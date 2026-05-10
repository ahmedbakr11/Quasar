import { create } from "zustand";
import { persist } from "zustand/middleware";

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
};

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
  createTask: (input: CreateTaskInput) => void;
  updateTask: (taskId: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  deleteTask: (taskId: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  moveTask: (taskId: string, toStatus: TaskStatus, toIndex: number) => void;
  reorderLists: (fromIndex: number, toIndex: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setListColor: (listId: TaskStatus, colorToken: string) => void;
  setTaskColor: (taskId: string, colorToken: string) => void;
};

const initialLists: TaskList[] = [
  { id: "todo", name: "Todo", colorToken: "slate" },
  { id: "in_progress", name: "In Progress", colorToken: "sky" },
  { id: "done", name: "Done", colorToken: "emerald" }
];

const moveInArray = <T>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

const reorderForStatus = (tasks: Task[], status: TaskStatus): Task[] => {
  const affected = tasks
    .filter((task) => task.status === status)
    .sort((a, b) => a.position - b.position)
    .map((task, idx) => ({ ...task, position: idx }));
  const unaffected = tasks.filter((task) => task.status !== status);
  return [...unaffected, ...affected];
};

const statusTasks = (tasks: Task[], status: TaskStatus): Task[] =>
  tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position);

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      lists: initialLists,
      viewMode: "list",
      createTask: (input) =>
        set((state) => {
          const now = new Date().toISOString();
          const position = statusTasks(state.tasks, input.status).length;
          const task: Task = {
            id: crypto.randomUUID(),
            title: input.title.trim(),
            description: input.description.trim(),
            dueDate: input.dueDate,
            priority: input.priority,
            subtasks: input.subtasks
              .map((text) => text.trim())
              .filter(Boolean)
              .map((text) => ({ id: crypto.randomUUID(), text, done: false })),
            status: input.status,
            colorToken: input.colorToken,
            position,
            createdAt: now,
            updatedAt: now
          };
          return { tasks: [...state.tasks, task] };
        }),
      updateTask: (taskId, patch) =>
        set((state) => {
          const target = state.tasks.find((task) => task.id === taskId);
          if (!target) return state;

          const now = new Date().toISOString();
          const nextStatus = patch.status ?? target.status;

          if (nextStatus === target.status) {
            return {
              tasks: state.tasks.map((task) =>
                task.id === taskId ? { ...task, ...patch, updatedAt: now } : task
              )
            };
          }

          const withoutTarget = state.tasks.filter((task) => task.id !== taskId);
          const sourceNormalized = reorderForStatus(withoutTarget, target.status);
          const destinationPosition = statusTasks(sourceNormalized, nextStatus).length;
          const movedTask: Task = {
            ...target,
            ...patch,
            status: nextStatus,
            position: destinationPosition,
            updatedAt: now
          };
          return { tasks: [...sourceNormalized, movedTask] };
        }),
      deleteTask: (taskId) =>
        set((state) => {
          const task = state.tasks.find((item) => item.id === taskId);
          if (!task) return state;
          const filtered = state.tasks.filter((item) => item.id !== taskId);
          return { tasks: reorderForStatus(filtered, task.status) };
        }),
      toggleSubtask: (taskId, subtaskId) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id !== taskId
              ? task
              : {
                  ...task,
                  updatedAt: new Date().toISOString(),
                  subtasks: task.subtasks.map((subtask) =>
                    subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask
                  )
                }
          )
        })),
      moveTask: (taskId, toStatus, toIndex) =>
        set((state) => {
          const target = state.tasks.find((task) => task.id === taskId);
          if (!target) return state;

          const sourceStatus = target.status;
          const sourceItems = statusTasks(state.tasks, sourceStatus).filter((item) => item.id !== taskId);
          const destinationBase =
            sourceStatus === toStatus ? sourceItems : statusTasks(state.tasks, toStatus);
          const boundedIndex = Math.max(0, Math.min(toIndex, destinationBase.length));

          const movedTask: Task = {
            ...target,
            status: toStatus,
            position: boundedIndex,
            updatedAt: new Date().toISOString()
          };

          const destinationItems = [...destinationBase];
          destinationItems.splice(boundedIndex, 0, movedTask);
          const normalizedDestination = destinationItems.map((item, idx) => ({ ...item, position: idx }));
          const normalizedSource =
            sourceStatus === toStatus
              ? []
              : sourceItems.map((item, idx) => ({ ...item, position: idx }));

          const untouched = state.tasks.filter(
            (item) =>
              item.status !== sourceStatus &&
              item.status !== toStatus &&
              item.id !== taskId
          );

          const merged = sourceStatus === toStatus
            ? [...untouched, ...normalizedDestination]
            : [...untouched, ...normalizedSource, ...normalizedDestination];

          return { tasks: merged };
        }),
      reorderLists: (fromIndex, toIndex) =>
        set((state) => {
          const boundedToIndex = Math.max(0, Math.min(toIndex, state.lists.length - 1));
          return { lists: moveInArray(state.lists, fromIndex, boundedToIndex) };
        }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setListColor: (listId, colorToken) =>
        set((state) => ({
          lists: state.lists.map((list) => (list.id === listId ? { ...list, colorToken } : list))
        })),
      setTaskColor: (taskId, colorToken) =>
        get().updateTask(taskId, { colorToken })
    }),
    {
      name: "quasar.tasks.v1",
      partialize: (state) => ({
        tasks: state.tasks,
        lists: state.lists,
        viewMode: state.viewMode
      })
    }
  )
);
