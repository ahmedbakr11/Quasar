import { format } from "date-fns";
import { CalendarClock, Check, ChevronDown, CheckCircle2, GripVertical, Palette, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
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
  const sessionToken = useAuthStore((state) => state.sessionToken);
  const {
    tasks,
    lists,
    loadTasks,
    createTask,
    moveTask,
    setListColor,
    setTaskColor,
    toggleSubtask,
    updateTask,
    deleteTask
  } = useTaskStore();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [colorMenu, setColorMenu] = useState<ColorMenuState>(null);
  const [listColorMenu, setListColorMenu] = useState<{ listId: TaskStatus; x: number; y: number } | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    dueDate: string;
    priority: TaskPriority;
    colorToken: string;
  } | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!sessionToken) return;
    void loadTasks(sessionToken).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to load tasks");
    });
  }, [loadTasks, sessionToken]);

  const tasksByStatus = useMemo(
    () => {
      const grouped = lists.reduce(
        (acc, list) => {
          acc[list.id] = [];
          return acc;
        },
        {} as Record<TaskStatus, Task[]>
      );
      for (const task of tasks) {
        const bucket = grouped[task.status];
        if (bucket) bucket.push(task);
      }
      for (const list of lists) {
        grouped[list.id].sort((a, b) => a.position - b.position);
      }
      return grouped;
    },
    [lists, tasks]
  );

  if (!user) return <Navigate to="/login" replace />;
  if (!sessionToken) return <Navigate to="/login" replace />;

  const resetForm = () => {
    setForm(defaultForm);
    setFormOpen(false);
  };

  const submitTask = async () => {
    if (!form.title.trim()) return;
    try {
      await createTask(sessionToken, {
        title: form.title,
        description: form.description,
        dueDate: form.dueDate,
        priority: form.priority,
        status: form.status,
        subtasks: form.subtasks,
        colorToken: form.colorToken
      });
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
    }
  };

  const onDropTask = async (targetStatus: TaskStatus, targetIndex: number) => {
    if (!dragTaskId) return;
    try {
      await moveTask(sessionToken, dragTaskId, targetStatus, targetIndex);
      setDragTaskId(null);
      setDragOverListId(null);
      setDragOverTaskId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move task");
    }
  };

  const toggleTaskDone = (task: Task) =>
    updateTask(sessionToken, task.id, { status: task.status === "done" ? "todo" : "done" }).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    });

  const toggleExpanded = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const startEditing = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate || "",
      priority: task.priority,
      colorToken: task.colorToken
    });
  };

  const saveTaskChanges = async () => {
    if (!editingTask || !editForm || !editForm.title.trim()) return;
    try {
      await updateTask(sessionToken, editingTask.id, {
        title: editForm.title,
        description: editForm.description,
        dueDate: editForm.dueDate,
        priority: editForm.priority,
        colorToken: editForm.colorToken
      });
      setEditingTask(null);
      setEditForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  return (
    <div className="min-h-[calc(100vh-40px)] bg-background pb-28">
      <main className="relative overflow-y-auto p-8" onClick={() => { setColorMenu(null); setListColorMenu(null); }}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Tasks</h1>
            <p className="mt-2 text-sm text-muted">Plan work, expand details, and let Luna keep tasks updated.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New Task
            </Button>
          </div>
        </div>

        <section className="grid min-w-[880px] grid-cols-3 gap-4 pb-4 items-start">
          {lists.map((list) => {
            const color = getColor(list.colorToken);
            const listTasks = tasksByStatus[list.id];
            return (
              <article
                key={list.id}
                className={cn(
                  "rounded-xl border transition-colors p-4 space-y-3 bg-[#131313]",
                  dragOverListId === list.id && !dragOverTaskId
                    ? "bg-surfaceAlt/55"
                    : ""
                )}
                style={{ borderColor: dragOverListId === list.id && !dragOverTaskId ? "var(--primary)" : `${color.text}22` }}
                onDragOver={(event) => {
                  if (dragTaskId) {
                    event.preventDefault();
                  }
                }}
                onDragEnter={(event) => {
                  if (dragTaskId) {
                    event.preventDefault();
                    setDragOverListId(list.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverListId === list.id) {
                    setDragOverListId(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragTaskId) {
                    void onDropTask(list.id, listTasks.length);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setListColorMenu({ listId: list.id, x: event.clientX, y: event.clientY });
                }}
              >
                <header className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2 select-none">
                    <GripVertical className="h-4 w-4 text-muted/60" />
                    <span className="font-semibold text-sm tracking-wide text-zinc-100">{list.name}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: color.dot, color: color.text }}>
                      {listTasks.length}
                    </span>
                  </div>
                </header>
                <div className="space-y-2">
                  {listTasks.map((task, idx) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", task.id);
                        setDragTaskId(task.id);
                      }}
                      onDragEnd={() => {
                        setDragTaskId(null);
                        setDragOverListId(null);
                        setDragOverTaskId(null);
                      }}
                      onToggleSubtask={(taskId, subtaskId) =>
                        void toggleSubtask(sessionToken, taskId, subtaskId).catch((err) => {
                          toast.error(err instanceof Error ? err.message : "Failed to update subtask");
                        })
                      }
                      onDelete={(taskId) =>
                        void deleteTask(sessionToken, taskId).catch((err) => {
                          toast.error(err instanceof Error ? err.message : "Failed to delete task");
                        })
                      }
                      onContextColorMenu={(x, y) => setColorMenu({ taskId: task.id, x, y })}
                      expanded={Boolean(expandedTasks[task.id])}
                      onToggleExpanded={() => toggleExpanded(task.id)}
                      onToggleDone={() => void toggleTaskDone(task)}
                      onEdit={() => startEditing(task)}
                      draggedOver={dragOverTaskId === task.id && dragTaskId !== task.id}
                      onDragEnter={
                        dragTaskId && dragTaskId !== task.id
                          ? (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setDragOverTaskId(task.id);
                              setDragOverListId(list.id);
                            }
                          : undefined
                      }
                      onDragLeave={
                        dragTaskId && dragTaskId !== task.id
                          ? () => {
                              if (dragOverTaskId === task.id) {
                                setDragOverTaskId(null);
                              }
                            }
                          : undefined
                      }
                      onDrop={
                        dragTaskId && dragTaskId !== task.id
                          ? async (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              await onDropTask(list.id, idx);
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </section>

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
                    void setTaskColor(sessionToken, colorMenu.taskId, paletteColor.token).catch((err) => {
                      toast.error(err instanceof Error ? err.message : "Failed to update task color");
                    });
                    setColorMenu(null);
                  }}
                  title={paletteColor.label}
                />
              ))}
            </div>
          </div>
        )}

        {listColorMenu && (
          <div
            className="fixed z-50 rounded-lg border border-border bg-surface p-2 shadow-lg"
            style={{ left: listColorMenu.x, top: listColorMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-1 px-1 text-xs text-muted">Column color</p>
            <div className="flex items-center gap-1">
              {colorPalette.map((paletteColor) => (
                <button
                  key={paletteColor.token}
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ backgroundColor: paletteColor.dot }}
                  onClick={() => {
                    void setListColor(sessionToken, listColorMenu.listId, paletteColor.token).catch((err) => {
                      toast.error(err instanceof Error ? err.message : "Failed to update list color");
                    });
                    setListColorMenu(null);
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
          <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold">Create task</h3>
                <p className="mt-1 text-sm text-muted">Add enough context for you and Luna to act on it later.</p>
              </div>
              <div className="rounded-full bg-surfaceAlt p-2 text-muted">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-4">
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
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-muted">
                  <Palette className="h-4 w-4" />
                  Card color
                </div>
                <div className="flex flex-wrap gap-2">
                  {colorPalette.map((paletteColor) => (
                    <button
                      key={paletteColor.token}
                      type="button"
                      className={cn("h-8 rounded-full border border-border px-3 text-xs", form.colorToken === paletteColor.token && "ring-2 ring-primary")}
                      style={{ backgroundColor: paletteColor.dot, color: paletteColor.text }}
                      onClick={() => setForm((prev) => ({ ...prev, colorToken: paletteColor.token }))}
                    >
                      {paletteColor.label}
                    </button>
                  ))}
                </div>
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
              <Button onClick={() => void submitTask()} disabled={!form.title.trim()}>
                Create Task
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingTask && editForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold">Edit task</h3>
                <p className="mt-1 text-sm text-muted">Update details for this task.</p>
              </div>
              <div className="rounded-full bg-surfaceAlt p-2 text-muted">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-4">
              <Input
                placeholder="Task title"
                value={editForm.title}
                onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, title: event.target.value }) : null)}
              />
              <textarea
                className="w-full rounded-md border border-border bg-surfaceAlt p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                rows={3}
                placeholder="Description"
                value={editForm.description}
                onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, description: event.target.value }) : null)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Due Date
                  <Input
                    type="date"
                    className="mt-1"
                    value={editForm.dueDate}
                    onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, dueDate: event.target.value }) : null)}
                  />
                </label>
                <label className="text-sm">
                  Priority
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-border bg-surfaceAlt px-3"
                    value={editForm.priority}
                    onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, priority: event.target.value as TaskPriority }) : null)}
                  >
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-muted">
                  <Palette className="h-4 w-4" />
                  Card color
                </div>
                <div className="flex flex-wrap gap-2">
                  {colorPalette.map((paletteColor) => (
                    <button
                      key={paletteColor.token}
                      type="button"
                      className={cn("h-8 rounded-full border border-border px-3 text-xs", editForm.colorToken === paletteColor.token && "ring-2 ring-primary")}
                      style={{ backgroundColor: paletteColor.dot, color: paletteColor.text }}
                      onClick={() => setEditForm((prev) => prev ? ({ ...prev, colorToken: paletteColor.token }) : null)}
                    >
                      {paletteColor.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setEditingTask(null); setEditForm(null); }}>Cancel</Button>
              <Button onClick={() => void saveTaskChanges()} disabled={!editForm.title.trim()}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCheckbox({
  checked,
  onChange,
  size = "md"
}: {
  checked: boolean;
  onChange: () => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border transition-colors",
        size === "sm" ? "h-4 w-4" : "h-5 w-5",
        checked
          ? "border-emerald-400 bg-emerald-400 text-black"
          : "border-white/25 bg-black/20 text-transparent hover:border-primary hover:bg-primary/10"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
    >
      <Check className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
    </button>
  );
}

type TaskCardProps = {
  task: Task;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDelete: (taskId: string) => void;
  onContextColorMenu: (x: number, y: number) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleDone: () => void;
  onEdit: () => void;
  draggedOver: boolean;
  onDragEnter?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
};

function TaskCard({
  task,
  onDragStart,
  onDragEnd,
  onToggleSubtask,
  onDelete,
  onContextColorMenu,
  expanded,
  onToggleExpanded,
  onToggleDone,
  onEdit,
  draggedOver,
  onDragEnter,
  onDragLeave,
  onDrop
}: TaskCardProps) {
  const color = getColor(task.colorToken);
  const completedCount = task.subtasks.filter((subtask) => subtask.done).length;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragEnter ? (event) => event.preventDefault() : undefined}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextColorMenu(event.clientX, event.clientY);
      }}
      className={cn(
        "rounded-lg border bg-surfaceAlt p-3 cursor-grab active:cursor-grabbing transition-shadow duration-200",
        draggedOver
          ? "border-primary/50 shadow-[0_-4px_0_0_#6366f1]"
          : "border-border"
      )}
      style={{ boxShadow: draggedOver ? undefined : `inset 0 0 0 1px ${color.dot}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <TaskCheckbox checked={task.status === "done"} onChange={onToggleDone} />
          <button className="min-w-0 flex-1 text-left select-none" onClick={onToggleExpanded}>
            <h4 className={cn("line-clamp-2 text-sm font-semibold leading-tight", task.status === "done" && "text-muted line-through")}>
              {task.title}
            </h4>
          </button>
        </div>
        <button className="rounded p-1 text-muted hover:bg-surface hover:text-text" onClick={onToggleExpanded} title="Toggle Details">
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {task.description && (
        <p className={cn("mt-2 text-xs text-muted leading-relaxed", expanded ? "whitespace-pre-wrap" : "line-clamp-2")}>
          {task.description}
        </p>
      )}

      {/* Due Date & Priority Tag */}
      {(task.dueDate || task.priority) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted">
          {task.dueDate && (
            <div className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              <span>{format(new Date(task.dueDate), "MMM d, yyyy")}</span>
            </div>
          )}
          <span className={cn(
            "rounded-full px-2 py-0.5 capitalize font-medium",
            task.priority === "high" ? "bg-red-500/20 text-red-300" :
            task.priority === "medium" ? "bg-amber-500/20 text-amber-300" :
            "bg-emerald-500/20 text-emerald-300"
          )}>
            {task.priority}
          </span>
        </div>
      )}

      {/* Expanded details (Subtasks, inline edit/delete) */}
      {expanded && (
        <div className="mt-4 pt-3 border-t border-border/40 space-y-3">
          {task.subtasks.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>Subtasks</span>
                <span>{completedCount}/{task.subtasks.length}</span>
              </div>
              <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                {task.subtasks.map((subtask) => (
                  <label key={subtask.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <TaskCheckbox size="sm" checked={subtask.done} onChange={() => onToggleSubtask(task.id, subtask.id)} />
                    <span className={cn(subtask.done && "text-muted line-through")}>{subtask.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons revealed only inside expanded view */}
          <div className="flex justify-end gap-2 pt-1 border-t border-border/20">
            <button
              className="flex items-center gap-1 rounded bg-surface px-2.5 py-1 text-xs text-muted hover:text-text hover:bg-surfaceAlt transition-colors"
              onClick={onEdit}
              title="Edit task"
            >
              Edit
            </button>
            <button
              className="flex items-center gap-1 rounded bg-surface px-2.5 py-1 text-xs text-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => onDelete(task.id)}
              title="Delete task"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

