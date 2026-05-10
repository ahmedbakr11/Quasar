import { format } from "date-fns";
import { CalendarClock, CheckCircle2, GripVertical, LayoutGrid, List, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type Task, type TaskPriority, type TaskStatus, useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";

const colorPalette = [
  { token: "slate", label: "Slate", dot: "#64748b22", text: "#cbd5e1" },
  { token: "sky", label: "Sky", dot: "#0ea5e922", text: "#bae6fd" },
  { token: "emerald", label: "Emerald", dot: "#10b98122", text: "#a7f3d0" },
  { token: "amber", label: "Amber", dot: "#f59e0b22", text: "#fde68a" },
  { token: "rose", label: "Rose", dot: "#f43f5e22", text: "#fecdd3" }
] as const;

const priorities: TaskPriority[] = ["high", "medium", "low"];

const defaultForm = {
  title: "",
  description: "",
  dueDate: "",
  priority: "medium" as TaskPriority,
  status: "todo" as TaskStatus,
  subtaskDraft: "",
  subtasks: [] as string[],
  colorToken: "slate"
};

type ColorMenuState = {
  taskId: string;
  x: number;
  y: number;
} | null;

const getColor = (token: string) => colorPalette.find((item) => item.token === token) ?? colorPalette[0];

export default function Tasks() {
  const user = useAuthStore((state) => state.user);
  const {
    tasks,
    lists,
    viewMode,
    setViewMode,
    createTask,
    moveTask,
    reorderLists,
    setListColor,
    setTaskColor,
    toggleSubtask,
    updateTask,
    deleteTask
  } = useTaskStore();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragListId, setDragListId] = useState<string | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const [colorMenu, setColorMenu] = useState<ColorMenuState>(null);

  if (!user) return <Navigate to="/login" replace />;

  const tasksByStatus = useMemo(
    () =>
      lists.reduce(
        (acc, list) => {
          acc[list.id] = tasks
            .filter((task) => task.status === list.id)
            .sort((a, b) => a.position - b.position);
          return acc;
        },
        {} as Record<TaskStatus, Task[]>
      ),
    [lists, tasks]
  );

  const allTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }),
    [tasks]
  );

  const resetForm = () => {
    setForm(defaultForm);
    setFormOpen(false);
  };

  const submitTask = () => {
    if (!form.title.trim() || !form.dueDate) return;
    createTask({
      title: form.title,
      description: form.description,
      dueDate: form.dueDate,
      priority: form.priority,
      status: form.status,
      subtasks: form.subtasks,
      colorToken: form.colorToken
    });
    resetForm();
  };

  const onDropTask = (targetStatus: TaskStatus, targetIndex: number) => {
    if (!dragTaskId) return;
    moveTask(dragTaskId, targetStatus, targetIndex);
    setDragTaskId(null);
    setActiveDropZone(null);
  };

  const onListDrop = (targetListId: string) => {
    if (!dragListId || dragListId === targetListId) return;
    const from = lists.findIndex((list) => list.id === dragListId);
    const to = lists.findIndex((list) => list.id === targetListId);
    if (from >= 0 && to >= 0) reorderLists(from, to);
    setDragListId(null);
  };

  return (
    <div className="flex min-h-[calc(100vh-40px)] bg-background">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto p-8" onClick={() => setColorMenu(null)}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Tasks</h1>
            <p className="mt-2 text-sm text-muted">Right-click a task to customize color.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
              <List className="mr-1 h-4 w-4" /> List
            </Button>
            <Button variant={viewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setViewMode("card")}>
              <LayoutGrid className="mr-1 h-4 w-4" /> Cards
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New Task
            </Button>
          </div>
        </div>

        {viewMode === "card" ? (
          <section className="grid min-w-[880px] grid-cols-3 gap-4 pb-4">
            {lists.map((list) => {
              const color = getColor(list.colorToken);
              const listTasks = tasksByStatus[list.id];
              return (
                <article
                  key={list.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", list.id);
                    setDragListId(list.id);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onListDrop(list.id)}
                  className="rounded-xl border border-border bg-surface p-3"
                  style={{ boxShadow: `inset 0 0 0 1px ${color.dot}` }}
                >
                  <header className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted" />
                      <span className="font-medium">{list.name}</span>
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: color.dot, color: color.text }}>
                        {listTasks.length}
                      </span>
                    </div>
                    <select
                      className="rounded border border-border bg-surfaceAlt px-2 py-1 text-xs"
                      value={list.colorToken}
                      onChange={(event) => setListColor(list.id, event.target.value)}
                    >
                      {colorPalette.map((paletteColor) => (
                        <option key={paletteColor.token} value={paletteColor.token}>
                          {paletteColor.label}
                        </option>
                      ))}
                    </select>
                  </header>
                  <DropZone
                    visible={Boolean(dragTaskId)}
                    active={activeDropZone === `${list.id}-0`}
                    onDragEnter={() => setActiveDropZone(`${list.id}-0`)}
                    onDrop={() => onDropTask(list.id, 0)}
                  />
                  <div className="space-y-2">
                    {listTasks.map((task, idx) => (
                      <div key={task.id}>
                        <TaskCard
                          task={task}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", task.id);
                            setDragTaskId(task.id);
                          }}
                          onDragEnd={() => {
                            setDragTaskId(null);
                            setActiveDropZone(null);
                          }}
                          onToggleSubtask={toggleSubtask}
                          onDelete={deleteTask}
                          onContextColorMenu={(x, y) => setColorMenu({ taskId: task.id, x, y })}
                        />
                        <DropZone
                          visible={Boolean(dragTaskId)}
                          active={activeDropZone === `${list.id}-${idx + 1}`}
                          onDragEnter={() => setActiveDropZone(`${list.id}-${idx + 1}`)}
                          onDrop={() => onDropTask(list.id, idx + 1)}
                        />
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-surface">
            <div className="grid grid-cols-[32px_1fr_150px_130px_130px] items-center border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted">
              <span />
              <span>Task</span>
              <span>Due date</span>
              <span>Priority</span>
              <span>Status</span>
            </div>
            {allTasks.map((task) => {
              const color = getColor(task.colorToken);
              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", task.id);
                    setDragTaskId(task.id);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDropTask(task.status, task.position)}
                  onDragEnd={() => {
                    setDragTaskId(null);
                    setActiveDropZone(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setColorMenu({ taskId: task.id, x: event.clientX, y: event.clientY });
                  }}
                  className="grid grid-cols-[32px_1fr_150px_130px_130px] items-center border-b border-border/70 px-4 py-3 text-sm hover:bg-surfaceAlt/50"
                  style={{ boxShadow: `inset 2px 0 0 ${color.text}` }}
                >
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={(event) => updateTask(task.id, { status: event.target.checked ? "done" : "todo" })}
                  />
                  <div className="min-w-0">
                    <p className={cn("truncate font-medium", task.status === "done" && "text-muted line-through")}>{task.title}</p>
                    <p className="truncate text-xs text-muted">{task.description || "No description"}</p>
                  </div>
                  <span className="text-xs text-muted">{format(new Date(task.dueDate), "MMM d, yyyy")}</span>
                  <span className={cn("w-fit rounded-full px-2 py-0.5 text-xs capitalize", task.priority === "high" ? "bg-red-500/20 text-red-300" : task.priority === "medium" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300")}>
                    {task.priority}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-surfaceAlt px-2 py-0.5 text-xs capitalize">{task.status.replace("_", " ")}</span>
                    <button className="text-muted hover:text-destructive" onClick={() => deleteTask(task.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {colorMenu && (
          <div
            className="fixed z-50 rounded-lg border border-border bg-surface p-2 shadow-lg"
            style={{ left: colorMenu.x, top: colorMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-1 px-1 text-xs text-muted">Task color</p>
            <div className="flex items-center gap-1">
              {colorPalette.map((paletteColor) => (
                <button
                  key={paletteColor.token}
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ backgroundColor: paletteColor.dot }}
                  onClick={() => {
                    setTaskColor(colorMenu.taskId, paletteColor.token);
                    setColorMenu(null);
                  }}
                  title={paletteColor.label}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-4 text-xl font-semibold">Create New Task</h3>
            <div className="space-y-3">
              <Input
                placeholder="Task title"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <textarea
                className="w-full rounded-md border border-border bg-surfaceAlt p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                rows={3}
                placeholder="Description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Due Date
                  <Input
                    type="date"
                    className="mt-1"
                    value={form.dueDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  Priority
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-border bg-surfaceAlt px-3"
                    value={form.priority}
                    onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value as TaskPriority }))}
                  >
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  List
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-border bg-surfaceAlt px-3"
                    value={form.status}
                    onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as TaskStatus }))}
                  >
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Card Color
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-border bg-surfaceAlt px-3"
                    value={form.colorToken}
                    onChange={(event) => setForm((prev) => ({ ...prev, colorToken: event.target.value }))}
                  >
                    {colorPalette.map((paletteColor) => (
                      <option key={paletteColor.token} value={paletteColor.token}>
                        {paletteColor.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label className="mb-1 block text-sm">Subtasks</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Write subtask and press Add"
                    value={form.subtaskDraft}
                    onChange={(event) => setForm((prev) => ({ ...prev, subtaskDraft: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const value = form.subtaskDraft.trim();
                        if (!value) return;
                        setForm((prev) => ({ ...prev, subtasks: [...prev.subtasks, value], subtaskDraft: "" }));
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const value = form.subtaskDraft.trim();
                      if (!value) return;
                      setForm((prev) => ({ ...prev, subtasks: [...prev.subtasks, value], subtaskDraft: "" }));
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="mt-2 space-y-1">
                  {form.subtasks.map((subtask, idx) => (
                    <div key={`${subtask}-${idx}`} className="flex items-center justify-between rounded bg-surfaceAlt px-2 py-1 text-sm">
                      <span>{subtask}</span>
                      <button
                        className="text-muted hover:text-text"
                        onClick={() => setForm((prev) => ({ ...prev, subtasks: prev.subtasks.filter((_, i) => i !== idx) }))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={resetForm}>Cancel</Button>
              <Button onClick={submitTask} disabled={!form.title.trim() || !form.dueDate}>
                Create Task
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone({
  onDrop,
  onDragEnter,
  active,
  visible
}: {
  onDrop: () => void;
  onDragEnter: () => void;
  active: boolean;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      className={cn(
        "mb-2 rounded-md border border-dashed p-1.5 text-center text-[10px] transition-colors",
        active
          ? "border-primary bg-primary/20 text-text"
          : "border-border text-muted"
      )}
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      Drop
    </div>
  );
}

type TaskCardProps = {
  task: Task;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDelete: (taskId: string) => void;
  onContextColorMenu: (x: number, y: number) => void;
};

function TaskCard({ task, onDragStart, onDragEnd, onToggleSubtask, onDelete, onContextColorMenu }: TaskCardProps) {
  const color = getColor(task.colorToken);
  const completedCount = task.subtasks.filter((subtask) => subtask.done).length;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextColorMenu(event.clientX, event.clientY);
      }}
      className="rounded-lg border border-border bg-surfaceAlt p-3"
      style={{ boxShadow: `inset 0 0 0 1px ${color.dot}` }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="line-clamp-1 text-sm font-semibold">{task.title}</h4>
        <button className="text-muted hover:text-destructive" onClick={() => onDelete(task.id)}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2 line-clamp-2 text-xs text-muted">{task.description || "No description"}</p>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <CalendarClock className="h-3.5 w-3.5" />
        {format(new Date(task.dueDate), "MMM d, yyyy")}
        <span className={cn("rounded-full px-2 py-0.5 capitalize", task.priority === "high" ? "bg-red-500/20 text-red-300" : task.priority === "medium" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300")}>
          {task.priority}
        </span>
      </div>
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>Subtasks</span>
          <span>{completedCount}/{task.subtasks.length}</span>
        </div>
        <div className="space-y-1">
          {task.subtasks.slice(0, 3).map((subtask) => (
            <label key={subtask.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={subtask.done}
                onChange={() => onToggleSubtask(task.id, subtask.id)}
              />
              <span className={cn(subtask.done && "text-muted line-through")}>{subtask.text}</span>
            </label>
          ))}
          {task.subtasks.length === 0 && <span className="text-xs text-muted">No subtasks</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Draggable
      </div>
    </div>
  );
}
