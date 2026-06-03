/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

export const QUIRK_ANTIGRAVITY_TOPIC = "quasar.quirk.antigravity";

export type QuirkTaskStatus = "running" | "success" | "error" | "cancelled";
export type QuirkLogStream = "stdout" | "stderr" | "diagnostic" | "lifecycle";

export type QuirkAntigravityLog = {
  id: string;
  sequence: number;
  stream: QuirkLogStream;
  line: string;
  timestamp: number;
};

export type QuirkAntigravityTask = {
  id: string;
  title: string;
  status: QuirkTaskStatus;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  output?: string;
  error?: string;
  logs: QuirkAntigravityLog[];
  seenSequences: Record<number, true>;
};

type QuirkAntigravityValue = {
  tasks: QuirkAntigravityTask[];
  dismissTask: (taskId: string) => void;
  killTask: (taskId: string) => Promise<void>;
};

type StatusPacket = {
  type?: string;
  taskId?: string;
  task_id?: string;
  title?: string;
  task?: string;
  status?: string;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number;
  output?: string | null;
  error?: string | null;
  timestamp?: number;
};

type LogPacket = {
  type?: string;
  taskId?: string;
  task_id?: string;
  title?: string;
  task?: string;
  stream?: string;
  sequence?: number;
  line?: string;
  log?: string;
  timestamp?: number;
};

const QuirkAntigravityContext = createContext<QuirkAntigravityValue | null>(null);

export function useQuirkAntigravity() {
  const value = useContext(QuirkAntigravityContext);
  if (!value) {
    throw new Error("useQuirkAntigravity must be used inside QuirkAntigravityProvider");
  }
  return value;
}

export function QuirkAntigravityProvider({ children }: { children: ReactNode }) {
  const room = useRoomContext();
  const [tasksById, setTasksById] = useState<Record<string, QuirkAntigravityTask>>({});
  const [dismissedTasks, setDismissedTasks] = useState<Record<string, true>>({});

  const dismissTask = useCallback((taskId: string) => {
    setDismissedTasks((prev) => ({ ...prev, [taskId]: true }));
  }, []);

  const killTask = useCallback(
    async (taskId: string) => {
      if (!room) return;
      const payload = JSON.stringify({
        version: 1,
        type: "quirk_antigravity_kill",
        taskId,
        task_id: taskId,
        timestamp: Date.now(),
      });
      const bytes = new TextEncoder().encode(payload);
      try {
        await room.localParticipant.publishData(bytes, { reliable: true, topic: QUIRK_ANTIGRAVITY_TOPIC });
      } catch (err) {
        console.error("Failed to publish Quirk kill packet:", err);
      }
    },
    [room]
  );

  const applyStatusPacket = useCallback((packet: StatusPacket) => {
    const taskId = normalizeId(packet.taskId ?? packet.task_id);
    if (!taskId) return;

    const status = normalizeStatus(packet.status);
    const title = normalizeTitle(packet.title ?? packet.task);
    const timestamp = normalizeTime(packet.timestamp);

    setDismissedTasks((prev) => {
      if (status !== "running") return prev;
      if (!prev[taskId]) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setTasksById((prev) => {
      const existing = prev[taskId];
      const startedAt = normalizeTime(packet.startedAt) || existing?.startedAt || timestamp || Date.now();
      return {
        ...prev,
        [taskId]: {
          id: taskId,
          title: title || existing?.title || "Antigravity Task",
          status,
          startedAt,
          endedAt: normalizeTime(packet.endedAt) || existing?.endedAt,
          exitCode: typeof packet.exitCode === "number" ? packet.exitCode : existing?.exitCode,
          output: typeof packet.output === "string" ? packet.output : existing?.output,
          error: typeof packet.error === "string" ? packet.error : existing?.error,
          logs: existing?.logs ?? [],
          seenSequences: existing?.seenSequences ?? {},
        },
      };
    });
  }, []);

  const applyLogPacket = useCallback((packet: LogPacket) => {
    const taskId = normalizeId(packet.taskId ?? packet.task_id);
    if (!taskId) return;

    const line = normalizeLine(packet.line ?? packet.log);
    if (!line) return;

    const sequence = typeof packet.sequence === "number" && Number.isFinite(packet.sequence)
      ? packet.sequence
      : Date.now();
    const stream = normalizeStream(packet.stream);
    const title = normalizeTitle(packet.title ?? packet.task);
    const timestamp = normalizeTime(packet.timestamp) || Date.now();

    setTasksById((prev) => {
      const existing = prev[taskId] ?? {
        id: taskId,
        title: title || "Antigravity Task",
        status: "running" as QuirkTaskStatus,
        startedAt: timestamp,
        logs: [],
        seenSequences: {},
      };
      if (existing.seenSequences[sequence]) return prev;

      const log: QuirkAntigravityLog = {
        id: `${taskId}:${sequence}`,
        sequence,
        stream,
        line,
        timestamp,
      };

      const logs = [...existing.logs, log]
        .sort((a, b) => a.sequence - b.sequence)
        .slice(-300);

      return {
        ...prev,
        [taskId]: {
          ...existing,
          title: title || existing.title,
          logs,
          seenSequences: {
            ...existing.seenSequences,
            [sequence]: true,
          },
        },
      };
    });
  }, []);

  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic && topic !== QUIRK_ANTIGRAVITY_TOPIC) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      if (!isRecord(parsed)) return;

      const type = typeof parsed.type === "string" ? parsed.type : "";
      if (type === "quirk_antigravity_status" || type === "antigravity_task_status") {
        applyStatusPacket(parsed as StatusPacket);
      } else if (type === "quirk_antigravity_log" || type === "antigravity_task_log") {
        applyLogPacket(parsed as LogPacket);
      }
    };

    const clearSessionTasks = () => {
      setTasksById({});
      setDismissedTasks({});
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    room.on(RoomEvent.Disconnected, clearSessionTasks);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
      room.off(RoomEvent.Disconnected, clearSessionTasks);
    };
  }, [applyLogPacket, applyStatusPacket, room]);

  const tasks = useMemo(
    () =>
      Object.values(tasksById)
        .filter((task) => !dismissedTasks[task.id])
        .sort((a, b) => a.startedAt - b.startedAt),
    [dismissedTasks, tasksById]
  );

  const value = useMemo(
    () => ({
      tasks,
      dismissTask,
      killTask,
    }),
    [dismissTask, killTask, tasks]
  );

  return (
    <QuirkAntigravityContext.Provider value={value}>
      {children}
    </QuirkAntigravityContext.Provider>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTitle(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLine(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTime(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value < 100000000000 ? value * 1000 : value;
}

function normalizeStatus(value: unknown): QuirkTaskStatus {
  if (value === "success" || value === "error" || value === "cancelled") return value;
  return "running";
}

function normalizeStream(value: unknown): QuirkLogStream {
  if (value === "stderr" || value === "diagnostic" || value === "lifecycle") return value;
  return "stdout";
}
