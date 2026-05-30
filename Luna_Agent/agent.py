import os
import json
import shlex
import shutil
import subprocess
import sqlite3
import asyncio
import re
import urllib.error
import urllib.parse
import urllib.request
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from dotenv import load_dotenv
from livekit.agents import AgentSession, JobContext, WorkerOptions, cli, llm, mcp, room_io
from livekit.plugins import google as livekit_google
from typing import Annotated, Callable
from datetime import datetime, timezone
from uuid import uuid4
from memory import (
    MemoryAgent,
    build_initial_chat_context,
    build_memory_instructions,
    load_memory_state,
    resolve_memory_path,
)
from antigravity_delegator import AntigravityDelegator

try:
    from google import genai as google_genai
except Exception:
    google_genai = None

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_ENV_PATH = os.path.join(AGENT_DIR, ".env")
LUNA_IMAGE_ENVELOPE_PREFIX = "[[LUNA_IMAGE_V1]]"

# Always load env from Luna_Agent/.env regardless of caller working directory.
dotenv_loaded = load_dotenv(dotenv_path=AGENT_ENV_PATH, override=False)
if dotenv_loaded:
    print(f"Loaded environment from: {AGENT_ENV_PATH}")
else:
    print(
        f"Environment file not found at expected path: {AGENT_ENV_PATH}. "
        "Falling back to process environment only."
    )


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_mcp_args(raw_args: str) -> list[str]:
    if not raw_args:
        return []

    stripped = raw_args.strip()
    if stripped.startswith("["):
        parsed = json.loads(stripped)
        if not isinstance(parsed, list):
            raise ValueError("GOOGLE_WORKSPACE_MCP_ARGS JSON must be a list of strings.")
        if not all(isinstance(item, str) for item in parsed):
            raise ValueError("GOOGLE_WORKSPACE_MCP_ARGS JSON list must contain only strings.")
        return parsed

    return shlex.split(stripped, posix=False)


def _parse_allowed_tools(raw_tools: str) -> list[str]:
    if not raw_tools:
        return []

    return [tool.strip() for tool in raw_tools.split(",") if tool.strip()]


def _build_google_workspace_mcp_servers() -> list[mcp.MCPServer]:
    mcp_enabled = _env_flag("GOOGLE_WORKSPACE_MCP_ENABLED", default=False)
    if not mcp_enabled:
        print("MCP disabled: GOOGLE_WORKSPACE_MCP_ENABLED is not truthy.")
        return []

    command = os.getenv("GOOGLE_WORKSPACE_MCP_COMMAND", "uvx").strip()
    if not command:
        raise ValueError("GOOGLE_WORKSPACE_MCP_COMMAND is empty.")
    if shutil.which(command) is None:
        raise FileNotFoundError(
            f"MCP command not found in PATH: {command}. Install it or disable GOOGLE_WORKSPACE_MCP_ENABLED."
        )

    args = _parse_mcp_args(
        os.getenv(
            "GOOGLE_WORKSPACE_MCP_ARGS",
            '["google-workspace-mcp","--transport","stdio"]',
        )
    )
    timeout_seconds = float(os.getenv("GOOGLE_WORKSPACE_MCP_TIMEOUT_SECONDS", "30"))
    allowed_tools = _parse_allowed_tools(os.getenv("GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS", ""))
    child_env = os.environ.copy()

    print(
        "MCP enabled:",
        "server=google-workspace-mcp",
        f"command={command}",
        f"args={args}",
        f"allowed_tools={len(allowed_tools) if allowed_tools else 'all'}",
        f"timeout={timeout_seconds}s",
    )

    # Compatibility across livekit-agents versions:
    # newer signatures may support name/timeout/allowed_tools,
    # older ones may only accept command/args.
    constructor_variants = [
        {
            "command": command,
            "args": args,
            "env": child_env,
            "client_session_timeout_seconds": timeout_seconds,
        },
        {
            "command": command,
            "args": args,
            "env": child_env,
        },
    ]

    last_error = None
    for kwargs in constructor_variants:
        try:
            server = mcp.MCPServerStdio(**kwargs)
            if allowed_tools:
                print(
                    "MCP note: this livekit-agents version does not support allowed-tools"
                    " filtering on MCPServerStdio; exposing all MCP tools."
                )
            return [server]
        except TypeError as e:
            last_error = e
            continue

    raise TypeError(f"Unable to initialize MCPServerStdio with supported signatures: {last_error}")


def _log_mcp_preflight() -> None:
    enabled = _env_flag("GOOGLE_WORKSPACE_MCP_ENABLED", default=False)
    command = os.getenv("GOOGLE_WORKSPACE_MCP_COMMAND", "uvx").strip()
    args_raw = os.getenv("GOOGLE_WORKSPACE_MCP_ARGS", "")
    has_client_id = bool(os.getenv("GOOGLE_WORKSPACE_CLIENT_ID"))
    has_client_secret = bool(os.getenv("GOOGLE_WORKSPACE_CLIENT_SECRET"))
    has_refresh_token = bool(os.getenv("GOOGLE_WORKSPACE_REFRESH_TOKEN"))
    command_found = shutil.which(command) is not None if command else False

    print(
        "MCP preflight:",
        f"enabled={enabled}",
        f"command={command or '<empty>'}",
        f"command_found={command_found}",
        f"args_set={bool(args_raw.strip())}",
        f"client_id_set={has_client_id}",
        f"client_secret_set={has_client_secret}",
        f"refresh_token_set={has_refresh_token}",
    )


def _build_environment_facts() -> str:
    facts: list[str] = []

    vault_path = os.getenv("AGENT_VAULT_PATH", "").strip()
    if vault_path:
        facts.append(f"- The user's vault folder is located at: {vault_path}")

    static_facts = os.getenv("AGENT_STATIC_FACTS", "").strip()
    if static_facts:
        # Support either newline-separated or pipe-separated facts in env.
        separators = static_facts.replace("|", "\n")
        for line in separators.splitlines():
            item = line.strip()
            if item:
                facts.append(f"- {item}")

    if not facts:
        return ""

    return (
        "Stable environment facts for this user (assume true unless user says otherwise):\n"
        + "\n".join(facts)
    )


class SystemTools(llm.Toolset):
    def __init__(self):
        super().__init__(id="system_tools")

   
    @llm.function_tool
    async def run_command(
        self,
        command: Annotated[str, "The shell command to execute"]
    ) -> str:
        """Executes a shell command and returns the output."""
        try:
            result = subprocess.run(
                command, 
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            output = (result.stdout + result.stderr).strip()
            if len(output) > 2000:
                output = output[:2000] + "\n[Output truncated]"
            return output or "Command executed successfully with no output."
        except subprocess.TimeoutExpired:
            return "Error: Command timed out after 30 seconds."
        except FileNotFoundError:
            return "Error: Command not found."
        except Exception as e:
            return f"Error executing command: {str(e)}"

    @llm.function_tool
    async def file_operation(
        self,
        operation: Annotated[str, "Operation to perform: 'read', 'write', or 'list'"],
        path: Annotated[str, "File or directory path"],
        content: Annotated[str, "Content to write (only required for 'write')"] = ""
    ) -> str:
        """Read, write, or list files and directories."""
        try:
            if operation == "list":
                entries = os.listdir(path)
                return "\n".join(entries) or "Directory is empty."
            
            elif operation == "read":
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read(8000)
                return content or "File is empty."
            
            elif operation == "write":
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
                return f"Written successfully to {path}."
            
            else:
                return "Error: operation must be 'read', 'write', or 'list'."
        
        except FileNotFoundError:
            return f"Error: Path not found: {path}"
        except PermissionError:
            return f"Error: Permission denied: {path}"
        except Exception as e:
            return f"Error: {str(e)}"


class TaskTools(llm.Toolset):
    def __init__(self, username_provider: Callable[[], str | None]):
        super().__init__(id="task_tools")
        self._username_provider = username_provider

    def _resolve_db_path(self) -> Path:
        explicit = os.getenv("QUASAR_DB_PATH", "").strip()
        if explicit:
            candidate = Path(explicit)
            if candidate.exists():
                return candidate
        appdata = os.getenv("APPDATA", "").strip()
        if appdata:
            candidate = Path(appdata) / "com.quasar.app" / "luna.db"
            if candidate.exists():
                return candidate
        raise FileNotFoundError(
            "Quasar DB not found. Set QUASAR_DB_PATH to your luna.db path."
        )

    def _connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._resolve_db_path())
        conn.row_factory = sqlite3.Row
        return conn

    def _require_user_id(self, conn: sqlite3.Connection) -> str:
        username = (self._username_provider() or "").strip().lower()
        if not username:
            raise ValueError("No connected caller identity was found in LiveKit session.")
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is None:
            raise ValueError(f"No app user mapped to caller identity '{username}'.")
        return str(row["id"])

    def _load_task(self, conn: sqlite3.Connection, user_id: str, task_id: str) -> dict:
        row = conn.execute(
            "SELECT id, title, description, due_date, priority, status, color_token, position, created_at, updated_at "
            "FROM tasks WHERE id = ? AND user_id = ?",
            (task_id, user_id),
        ).fetchone()
        if row is None:
            raise ValueError("Task not found.")
        subtasks = conn.execute(
            "SELECT id, text, done FROM task_subtasks WHERE task_id = ? ORDER BY position ASC",
            (task_id,),
        ).fetchall()
        return {
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "dueDate": row["due_date"],
            "priority": row["priority"],
            "status": row["status"],
            "colorToken": row["color_token"],
            "position": row["position"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "subtasks": [
                {"id": s["id"], "text": s["text"], "done": bool(s["done"])}
                for s in subtasks
            ],
        }

    @llm.function_tool
    async def view_tasks(
        self,
        status: Annotated[str, "Optional status filter: todo, in_progress, done. Leave empty for all."] = "",
    ) -> str:
        """List current tasks for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                if status.strip():
                    rows = conn.execute(
                        "SELECT id FROM tasks WHERE user_id = ? AND status = ? ORDER BY updated_at ASC",
                        (user_id, status.strip()),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT id FROM tasks WHERE user_id = ? ORDER BY updated_at ASC",
                        (user_id,),
                    ).fetchall()
                tasks = [self._load_task(conn, user_id, str(r["id"])) for r in rows]
                return json.dumps(tasks, ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def add_task(
        self,
        title: Annotated[str, "Task title"],
        due_date: Annotated[str, "Due date in YYYY-MM-DD format"],
        description: Annotated[str, "Task description"] = "",
        priority: Annotated[str, "Priority: high, medium, low"] = "medium",
        status: Annotated[str, "Status: todo, in_progress, done"] = "todo",
        color_token: Annotated[str, "Color token"] = "slate",
        subtasks_json: Annotated[str, "JSON array of subtask strings, e.g. [\"a\",\"b\"]"] = "[]",
    ) -> str:
        """Create a task for the connected caller."""
        try:
            parsed = json.loads(subtasks_json) if subtasks_json.strip() else []
            if not isinstance(parsed, list):
                return "Error: subtasks_json must be a JSON array of strings."
            clean_subtasks = [str(x).strip() for x in parsed if str(x).strip()]
            now = __import__("datetime").datetime.utcnow().isoformat() + "Z"
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                next_pos_row = conn.execute(
                    "SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = ?",
                    (user_id, status),
                ).fetchone()
                next_pos = int(next_pos_row["c"]) if next_pos_row else 0
                task_id = __import__("uuid").uuid4().hex
                conn.execute(
                    "INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, color_token, position, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        task_id,
                        user_id,
                        title.strip(),
                        description.strip(),
                        due_date.strip(),
                        priority.strip(),
                        status.strip(),
                        color_token.strip(),
                        next_pos,
                        now,
                        now,
                    ),
                )
                for idx, text in enumerate(clean_subtasks):
                    conn.execute(
                        "INSERT INTO task_subtasks (id, task_id, text, done, position) VALUES (?, ?, ?, 0, ?)",
                        (__import__("uuid").uuid4().hex, task_id, text, idx),
                    )
                conn.commit()
                return json.dumps(self._load_task(conn, user_id, task_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def edit_task(
        self,
        task_id: Annotated[str, "Task id"],
        title: Annotated[str, "Optional new title"] = "",
        description: Annotated[str, "Optional new description"] = "",
        due_date: Annotated[str, "Optional new due date (YYYY-MM-DD)"] = "",
        priority: Annotated[str, "Optional new priority"] = "",
        status: Annotated[str, "Optional new status"] = "",
        color_token: Annotated[str, "Optional new color token"] = "",
    ) -> str:
        """Edit an existing task for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                existing = conn.execute(
                    "SELECT title, description, due_date, priority, status, color_token FROM tasks WHERE id = ? AND user_id = ?",
                    (task_id, user_id),
                ).fetchone()
                if existing is None:
                    return "Error: Task not found."
                next_values = (
                    title.strip() or existing["title"],
                    description.strip() or existing["description"],
                    due_date.strip() or existing["due_date"],
                    priority.strip() or existing["priority"],
                    status.strip() or existing["status"],
                    color_token.strip() or existing["color_token"],
                    __import__("datetime").datetime.utcnow().isoformat() + "Z",
                    task_id,
                    user_id,
                )
                conn.execute(
                    "UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, color_token = ?, updated_at = ? "
                    "WHERE id = ? AND user_id = ?",
                    next_values,
                )
                conn.commit()
                return json.dumps(self._load_task(conn, user_id, task_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def check_subtask(
        self,
        task_id: Annotated[str, "Task id"],
        subtask_id: Annotated[str, "Subtask id"],
    ) -> str:
        """Toggle a subtask check state."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                owns = conn.execute(
                    "SELECT COUNT(*) AS c FROM tasks WHERE id = ? AND user_id = ?",
                    (task_id, user_id),
                ).fetchone()
                if owns is None or int(owns["c"]) == 0:
                    return "Error: Task not found."
                conn.execute(
                    "UPDATE task_subtasks SET done = CASE done WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND task_id = ?",
                    (subtask_id, task_id),
                )
                conn.execute(
                    "UPDATE tasks SET updated_at = ? WHERE id = ?",
                    (__import__("datetime").datetime.utcnow().isoformat() + "Z", task_id),
                )
                conn.commit()
                return json.dumps(self._load_task(conn, user_id, task_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def delete_task(
        self,
        task_id: Annotated[str, "Task id"],
    ) -> str:
        """Delete a task for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                conn.execute(
                    "DELETE FROM task_subtasks WHERE task_id = ?",
                    (task_id,),
                )
                deleted = conn.execute(
                    "DELETE FROM tasks WHERE id = ? AND user_id = ?",
                    (task_id, user_id),
                ).rowcount
                conn.commit()
                if not deleted:
                    return "Error: Task not found."
                return "Task deleted."
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"


class NoteTools(llm.Toolset):
    def __init__(self, username_provider: Callable[[], str | None]):
        super().__init__(id="note_tools")
        self._username_provider = username_provider

    def _resolve_db_path(self) -> Path:
        explicit = os.getenv("QUASAR_DB_PATH", "").strip()
        if explicit:
            candidate = Path(explicit)
            if candidate.exists():
                return candidate
        appdata = os.getenv("APPDATA", "").strip()
        if appdata:
            candidate = Path(appdata) / "com.quasar.app" / "luna.db"
            if candidate.exists():
                return candidate
        raise FileNotFoundError("Quasar DB not found. Set QUASAR_DB_PATH to your luna.db path.")

    def _connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._resolve_db_path())
        conn.row_factory = sqlite3.Row
        return conn

    def _require_user_id(self, conn: sqlite3.Connection) -> str:
        username = (self._username_provider() or "").strip().lower()
        if not username:
            raise ValueError("No connected caller identity was found in LiveKit session.")
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if row is None:
            raise ValueError(f"No app user mapped to caller identity '{username}'.")
        return str(row["id"])

    def _clean_labels(self, labels: list[object]) -> list[str]:
        out: list[str] = []
        for label in labels:
            cleaned = str(label).strip().lstrip("#")
            if cleaned and cleaned not in out:
                out.append(cleaned)
        return out

    def _load_note(self, conn: sqlite3.Connection, user_id: str, note_id: str) -> dict:
        row = conn.execute(
            "SELECT id, title, body, labels, color_token, pinned, archived, created_at, updated_at "
            "FROM notes WHERE id = ? AND user_id = ?",
            (note_id, user_id),
        ).fetchone()
        if row is None:
            raise ValueError("Note not found.")
        try:
            labels = json.loads(row["labels"] or "[]")
        except json.JSONDecodeError:
            labels = []
        return {
            "id": row["id"],
            "title": row["title"],
            "body": row["body"],
            "labels": labels if isinstance(labels, list) else [],
            "colorToken": row["color_token"],
            "pinned": bool(row["pinned"]),
            "archived": bool(row["archived"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    @llm.function_tool
    async def view_notes(
        self,
        query: Annotated[str, "Optional search query across title, body, and labels"] = "",
    ) -> str:
        """List notes for the connected caller, optionally filtered by query."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                rows = conn.execute(
                    "SELECT id FROM notes WHERE user_id = ? AND archived = 0 ORDER BY pinned DESC, updated_at DESC",
                    (user_id,),
                ).fetchall()
                notes = [self._load_note(conn, user_id, str(row["id"])) for row in rows]
                normalized = query.strip().lower()
                if normalized:
                    notes = [
                        note for note in notes
                        if normalized in " ".join([note["title"], note["body"], *note["labels"]]).lower()
                    ]
                return json.dumps(notes, ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def add_note(
        self,
        title: Annotated[str, "Note title"] = "",
        body: Annotated[str, "Note body"] = "",
        labels_json: Annotated[str, "JSON array of labels"] = "[]",
        color_token: Annotated[str, "Color token"] = "slate",
        pinned: Annotated[bool, "Whether to pin the note"] = False,
    ) -> str:
        """Create a note for the connected caller."""
        try:
            if not title.strip() and not body.strip():
                return "Error: title or body is required."
            parsed_labels = json.loads(labels_json) if labels_json.strip() else []
            if not isinstance(parsed_labels, list):
                return "Error: labels_json must be a JSON array."
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                now = datetime.now(timezone.utc).isoformat()
                note_id = uuid4().hex
                conn.execute(
                    "INSERT INTO notes (id, user_id, title, body, labels, color_token, pinned, archived, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
                    (
                        note_id,
                        user_id,
                        title.strip(),
                        body.strip(),
                        json.dumps(self._clean_labels(parsed_labels), ensure_ascii=False),
                        color_token.strip() or "slate",
                        1 if pinned else 0,
                        now,
                        now,
                    ),
                )
                conn.commit()
                return json.dumps(self._load_note(conn, user_id, note_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def edit_note(
        self,
        note_id: Annotated[str, "Note id"],
        title: Annotated[str, "Optional new title"] = "",
        body: Annotated[str, "Optional new body"] = "",
        labels_json: Annotated[str, "Optional JSON array of labels"] = "",
        color_token: Annotated[str, "Optional color token"] = "",
        pinned: Annotated[str, "Optional pinned value: true or false"] = "",
    ) -> str:
        """Edit a note for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                existing = conn.execute(
                    "SELECT title, body, labels, color_token, pinned FROM notes WHERE id = ? AND user_id = ?",
                    (note_id, user_id),
                ).fetchone()
                if existing is None:
                    return "Error: Note not found."
                labels = existing["labels"]
                if labels_json.strip():
                    parsed_labels = json.loads(labels_json)
                    if not isinstance(parsed_labels, list):
                        return "Error: labels_json must be a JSON array."
                    labels = json.dumps(self._clean_labels(parsed_labels), ensure_ascii=False)
                next_pinned = existing["pinned"]
                if pinned.strip().lower() in {"true", "yes", "1"}:
                    next_pinned = 1
                elif pinned.strip().lower() in {"false", "no", "0"}:
                    next_pinned = 0
                conn.execute(
                    "UPDATE notes SET title = ?, body = ?, labels = ?, color_token = ?, pinned = ?, updated_at = ? "
                    "WHERE id = ? AND user_id = ?",
                    (
                        title.strip() or existing["title"],
                        body.strip() or existing["body"],
                        labels,
                        color_token.strip() or existing["color_token"],
                        next_pinned,
                        datetime.now(timezone.utc).isoformat(),
                        note_id,
                        user_id,
                    ),
                )
                conn.commit()
                return json.dumps(self._load_note(conn, user_id, note_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def delete_note(
        self,
        note_id: Annotated[str, "Note id"],
    ) -> str:
        """Delete a note for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                deleted = conn.execute(
                    "DELETE FROM notes WHERE id = ? AND user_id = ?",
                    (note_id, user_id),
                ).rowcount
                conn.commit()
                if not deleted:
                    return "Error: Note not found."
                return "Note deleted."
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"


class _DuckDuckGoResultParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results: list[dict[str, str]] = []
        self._active_result: dict[str, str] | None = None
        self._capture: str | None = None
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {key: value or "" for key, value in attrs}
        class_name = attrs_dict.get("class", "")
        if tag == "a" and "result__a" in class_name:
            self._active_result = {"title": "", "url": self._clean_duckduckgo_url(attrs_dict.get("href", "")), "snippet": ""}
            self._capture = "title"
            self._buffer = []
            return
        if self._active_result is not None and "result__snippet" in class_name:
            self._capture = "snippet"
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._active_result is None or self._capture is None:
            return
        if tag == "a" and self._capture == "title":
            self._active_result["title"] = self._clean_text(" ".join(self._buffer))
            self._capture = None
            self._buffer = []
            if self._active_result["title"] and self._active_result["url"]:
                self.results.append(self._active_result)
            return
        if tag in {"a", "div"} and self._capture == "snippet":
            self._active_result["snippet"] = self._clean_text(" ".join(self._buffer))
            self._capture = None
            self._buffer = []

    def _clean_duckduckgo_url(self, href: str) -> str:
        href = unescape(href or "").strip()
        if not href:
            return ""
        parsed = urllib.parse.urlparse(href)
        query = urllib.parse.parse_qs(parsed.query)
        if "uddg" in query and query["uddg"]:
            return query["uddg"][0]
        if href.startswith("//"):
            return f"https:{href}"
        return href

    def _clean_text(self, value: str) -> str:
        return re.sub(r"\s+", " ", unescape(value)).strip()


class _ReadableTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag in {"p", "br", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth > 0:
            self._skip_depth -= 1
        if tag in {"p", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            cleaned = re.sub(r"\s+", " ", data).strip()
            if cleaned:
                self.parts.append(cleaned)

    def text(self) -> str:
        return re.sub(r"\n{3,}", "\n\n", unescape(" ".join(self.parts))).strip()


class WebSearchTools(llm.Toolset):
    def __init__(self):
        super().__init__(id="web_search_tools")

    def _timeout(self) -> float:
        return float(os.getenv("LUNA_WEB_TIMEOUT_SECONDS", "12"))

    def _max_bytes(self) -> int:
        return int(os.getenv("LUNA_WEB_MAX_BYTES", "1500000"))

    def _request(self, url: str) -> bytes:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": os.getenv(
                    "LUNA_WEB_USER_AGENT",
                    "Quasar-Luna/0.1 (+local personal assistant)",
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(req, timeout=self._timeout()) as response:
            return response.read(self._max_bytes())

    def _assert_safe_url(self, url: str) -> str:
        parsed = urllib.parse.urlparse(url.strip())
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("Only http and https URLs are supported.")
        if not parsed.netloc:
            raise ValueError("URL must include a hostname.")
        return parsed.geturl()

    @llm.function_tool
    async def internet_search(
        self,
        query: Annotated[str, "Search query for current internet information"],
        max_results: Annotated[int, "Number of results to return, from 1 to 10"] = 5,
    ) -> str:
        """Search the public internet and return result titles, links, and snippets."""
        try:
            clean_query = query.strip()
            if not clean_query:
                return "Error: query cannot be empty."
            limit = max(1, min(int(max_results), 10))
            search_url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": clean_query})

            raw = await asyncio.to_thread(self._request, search_url)
            parser = _DuckDuckGoResultParser()
            parser.feed(raw.decode("utf-8", errors="replace"))
            deduped: list[dict[str, str]] = []
            seen_urls: set[str] = set()
            for result in parser.results:
                url = result.get("url", "")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                deduped.append(result)
                if len(deduped) >= limit:
                    break
            if not deduped:
                return "No search results found."
            return json.dumps(
                {
                    "query": clean_query,
                    "results": deduped,
                    "source": "duckduckgo_html",
                },
                ensure_ascii=False,
            )
        except urllib.error.URLError as e:
            return f"Error: internet search request failed: {e}"
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def read_webpage(
        self,
        url: Annotated[str, "HTTP or HTTPS webpage URL to read"],
        max_chars: Annotated[int, "Maximum readable characters to return, from 500 to 12000"] = 5000,
    ) -> str:
        """Fetch a webpage URL and return readable text for Luna to summarize or use."""
        try:
            safe_url = self._assert_safe_url(url)
            char_limit = max(500, min(int(max_chars), 12000))
            raw = await asyncio.to_thread(self._request, safe_url)
            content = raw.decode("utf-8", errors="replace")
            parser = _ReadableTextParser()
            parser.feed(content)
            text = parser.text()
            if not text:
                return "No readable text found on this page."
            return json.dumps(
                {
                    "url": safe_url,
                    "text": text[:char_limit],
                    "truncated": len(text) > char_limit,
                },
                ensure_ascii=False,
            )
        except urllib.error.URLError as e:
            return f"Error: webpage request failed: {e}"
        except Exception as e:
            return f"Error: {e}"


class DelegationTools(llm.Toolset):
    def __init__(self):
        super().__init__(id="delegation_tools")

    def _resolve_output_root(self) -> Path:
        root_raw = os.getenv("LUNA_DELEGATION_OUTPUT_DIR", "").strip()
        if root_raw:
            root = Path(root_raw).expanduser()
        else:
            root = Path(AGENT_DIR).parent / "generated" / "delegations"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _parse_inputs(self, inputs_json: str) -> list[str]:
        if not inputs_json.strip():
            return []
        parsed = json.loads(inputs_json)
        if not isinstance(parsed, list):
            raise ValueError("inputs_json must be a JSON list of file paths.")
        return [str(item).strip() for item in parsed if str(item).strip()]

    def _read_input_files(self, paths: list[str], per_file_chars: int) -> str:
        chunks: list[str] = []
        for idx, raw_path in enumerate(paths, start=1):
            try:
                p = Path(raw_path).expanduser().resolve()
                if not p.exists() or not p.is_file():
                    chunks.append(f"[Input {idx}] Path not found or not a file: {raw_path}")
                    continue
                try:
                    text = p.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    text = p.read_text(encoding="latin-1", errors="replace")
                trimmed = text[:per_file_chars]
                chunks.append(
                    f"[Input {idx}] path={str(p)}\n{trimmed}\n"
                    + ("[Truncated]\n" if len(text) > per_file_chars else "")
                )
            except Exception as e:
                chunks.append(f"[Input {idx}] Failed to read {raw_path}: {e}")
        return "\n".join(chunks)

    async def _run_gemini_delegate(
        self,
        task_type: str,
        instructions: str,
        file_context: str,
        model_name: str,
        max_output_tokens: int,
    ) -> str:
        if google_genai is None:
            raise RuntimeError("google-genai is not importable in this environment.")
        api_key = os.getenv("GOOGLE_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not set.")

        prompt = (
            "You are a delegated execution worker for Luna.\n"
            "Return only the final deliverable content for the user task.\n"
            "Do not include internal chain-of-thought.\n\n"
            f"Task type: {task_type}\n"
            f"User instructions:\n{instructions}\n\n"
            "Input file contents (may be truncated):\n"
            f"{file_context if file_context.strip() else '[No input files provided]'}\n"
        )

        def _call() -> str:
            client = google_genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={"max_output_tokens": max_output_tokens},
            )
            text = getattr(resp, "text", None)
            if isinstance(text, str) and text.strip():
                return text.strip()
            return str(resp)

        return await asyncio.to_thread(_call)

    @llm.function_tool
    async def delegate_task(
        self,
        task_type: Annotated[str, "Task class, e.g. general, document_analysis, writing, file_summary"],
        instructions: Annotated[str, "Detailed user task instructions"],
        inputs_json: Annotated[str, "JSON list of input file paths"] = "[]",
        preferred_model: Annotated[str, "Currently supports: auto or gemini"] = "auto",
        output_format: Annotated[str, "Output format: markdown or text"] = "markdown",
    ) -> str:
        """Delegate a non-realtime task to a Gemini non-live model and save an artifact."""
        try:
            model_pref = preferred_model.strip().lower() or "auto"
            if model_pref not in {"auto", "gemini"}:
                return "Error: preferred_model must be 'auto' or 'gemini' for Phase 1."

            fmt = output_format.strip().lower() or "markdown"
            if fmt not in {"markdown", "text"}:
                return "Error: output_format must be 'markdown' or 'text'."

            if not instructions.strip():
                return "Error: instructions cannot be empty."

            paths = self._parse_inputs(inputs_json)
            per_file_chars = int(os.getenv("LUNA_DELEGATION_INPUT_CHARS_PER_FILE", "12000"))
            file_context = self._read_input_files(paths, per_file_chars=per_file_chars)

            model_name = os.getenv("GEMINI_DELEGATION_MODEL", "gemini-2.5-flash")
            max_tokens = int(os.getenv("LUNA_DELEGATION_MAX_OUTPUT_TOKENS", "4096"))
            generated = await self._run_gemini_delegate(
                task_type=task_type.strip() or "general",
                instructions=instructions.strip(),
                file_context=file_context,
                model_name=model_name,
                max_output_tokens=max_tokens,
            )

            output_root = self._resolve_output_root()
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            ext = ".md" if fmt == "markdown" else ".txt"
            artifact_name = f"{stamp}_{uuid4().hex[:8]}{ext}"
            artifact_path = output_root / artifact_name
            artifact_path.write_text(generated, encoding="utf-8")

            result = {
                "status": "completed",
                "taskType": task_type.strip() or "general",
                "modelUsed": model_name,
                "outputFormat": fmt,
                "artifactPath": str(artifact_path.resolve()),
                "summary": f"Delegated task completed and saved to {artifact_path.name}.",
            }
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            return f"Error: {e}"


async def entrypoint(ctx: JobContext):
    print("Starting agent...")

    # Connect to the LiveKit room
    await ctx.connect()

    active_session = None

    def _get_session() -> AgentSession | None:
        return active_session

    def _get_room() -> Any:
        return getattr(ctx, "room", None)

    delegator_instance = AntigravityDelegator(_get_session, _get_room)

    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        try:
            payload = json.loads(data_packet.data.decode('utf-8'))
            if payload.get("type") == "antigravity_kill_task":
                task_id = payload.get("task_id")
                if task_id:
                    delegator_instance.kill_task(task_id)
        except Exception as e:
            print(f"Error handling room data_received event: {e}")

    # Use an explicit realtime model from env when provided.
    # Otherwise let the LiveKit plugin choose its API-appropriate default.
    selected_model = os.getenv("GEMINI_REALTIME_MODEL")
    selected_voice = os.getenv("AGENT_VOICE", "Puck")
    persona = os.getenv(
        "AGENT_PERSONA",
        "You are a helpful system assistant. You can execute shell commands, call Gemini CLI directly, and manage files on the user's machine using the provided tools. Be concise and professional.",
    )
    environment_facts = _build_environment_facts()
    if environment_facts:
        persona = f"{persona.strip()}\n\n{environment_facts}"
    memory_file = os.getenv("AGENT_MEMORY_FILE", "memory.json")
    memory_recent_items = int(os.getenv("AGENT_MEMORY_RECENT_ITEMS", "12"))
    memory_summary_max_chars = int(os.getenv("AGENT_MEMORY_SUMMARY_MAX_CHARS", "3000"))
    resolved_memory_path = resolve_memory_path(memory_file)

    loaded_persistent, loaded_summary, loaded_recent = load_memory_state(
        memory_file, memory_recent_items
    )
    combined_instructions = build_memory_instructions(
        persona, loaded_persistent, loaded_summary
    )
    model_kwargs = {
        "instructions": combined_instructions,
        "voice": selected_voice,
    }
    if selected_model:
        model_kwargs["model"] = selected_model

    model = livekit_google.realtime.RealtimeModel(**model_kwargs)
    initial_ctx = build_initial_chat_context(memory_file, memory_recent_items)
    try:
        mcp_servers = []
        mcp_servers.extend(_build_google_workspace_mcp_servers())
    except Exception as e:
        print(f"MCP startup disabled due to configuration error: {e}")
        mcp_servers = []

    async def cleanup():
        print("Cleaning up MCP servers...")
        for server in mcp_servers:
            try:
                await server.aclose()
            except Exception as e:
                print(f"Error closing MCP server: {e}")

    ctx.add_shutdown_callback(cleanup)
    print(
        "Memory initialized:",
        f"path={resolved_memory_path}",
        f"persistent_chars={len(loaded_persistent)}",
        f"summary_chars={len(loaded_summary)}",
        f"recent_turns={len(loaded_recent)}",
    )

    def _resolve_livekit_username() -> str | None:
        room = getattr(ctx, "room", None)
        if room is None:
            return None
        remote = getattr(room, "remote_participants", None)
        values = []
        if hasattr(remote, "values"):
            try:
                values = list(remote.values())
            except Exception:
                values = []
        elif isinstance(remote, list):
            values = remote
        for participant in values:
            identity = str(getattr(participant, "identity", "") or "").strip()
            if identity:
                return identity
        return None

    def _build_agent(extra_tools: list[llm.Toolset]) -> MemoryAgent:
        return MemoryAgent(
            memory_file=memory_file,
            memory_recent_items=memory_recent_items,
            memory_summary_max_chars=memory_summary_max_chars,
            instructions=combined_instructions,
            llm=model,
            chat_ctx=initial_ctx,
            tools=[
                SystemTools(),
                TaskTools(_resolve_livekit_username),
                NoteTools(_resolve_livekit_username),
                WebSearchTools(),
                DelegationTools(),
                delegator_instance,
                *extra_tools,
            ],
        )

    # Create MCP toolsets via the current API (passing servers to AgentSession is deprecated).
    mcp_toolsets: list[mcp.MCPToolset] = []
    for index, server in enumerate(mcp_servers):
        mcp_toolsets.append(mcp.MCPToolset(id=f"mcp_toolset_{index}", mcp_server=server))

    agent = _build_agent(mcp_toolsets)

    async def _text_input_cb(sess: AgentSession, ev: room_io.TextInputEvent) -> None:
        await sess.interrupt()
        text = ev.text or ""
        if not text.startswith(LUNA_IMAGE_ENVELOPE_PREFIX):
            sess.generate_reply(user_input=text)
            return

        raw = text[len(LUNA_IMAGE_ENVELOPE_PREFIX) :].strip()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            sess.generate_reply(user_input=text)
            return

        if not isinstance(payload, dict) or payload.get("type") != "image_message":
            sess.generate_reply(user_input=text)
            return

        image_data_url = payload.get("imageDataUrl")
        if not isinstance(image_data_url, str) or not image_data_url.strip():
            sess.generate_reply(user_input=text)
            return

        user_text = payload.get("text", "")
        if not isinstance(user_text, str):
            user_text = ""
        user_text = user_text.strip() or "Please analyze this image."

        mime_type = payload.get("mimeType")
        if not isinstance(mime_type, str) or not mime_type.strip():
            mime_type = None

        chat_message = llm.ChatMessage(
            role="user",
            content=[
                user_text,
                llm.ImageContent(image=image_data_url, mime_type=mime_type),
            ],
        )
        sess.generate_reply(user_input=chat_message)

    async def _start_with_optional_video_input(
        session_obj: AgentSession,
        agent_obj: MemoryAgent,
    ) -> None:
        try:
            await session_obj.start(
                agent_obj,
                room=ctx.room,
                room_options=room_io.RoomOptions(
                    video_input=True,
                    text_input=room_io.TextInputOptions(text_input_cb=_text_input_cb),
                ),
            )
        except Exception as start_err:
            print(f"Video input start failed, retrying without video input: {start_err}")
            await session_obj.start(
                agent_obj,
                room=ctx.room,
                room_options=room_io.RoomOptions(
                    text_input=room_io.TextInputOptions(text_input_cb=_text_input_cb),
                ),
            )

    # Create and start the session
    try:
        session = AgentSession()
        active_session = session
        await _start_with_optional_video_input(session, agent)
    except Exception as e:
        # If LiveKit indicates an activity is already running for this session,
        # don't attempt a second start.
        if "activity is already running" in str(e).lower():
            print(f"Session start skipped: {e}")
            return
        if not mcp_servers:
            raise
        print(f"MCP session startup failed, retrying without MCP: {e}")
        fallback_agent = _build_agent([])
        session = AgentSession()
        active_session = session
        await _start_with_optional_video_input(session, fallback_agent)
    print("Session started.")

if __name__ == "__main__":
    _log_mcp_preflight()
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("AGENT_NAME", "gemini_voice_agent"),
        )
    )
